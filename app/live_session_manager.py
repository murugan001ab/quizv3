"""
In-memory manager for live quiz channels (Kahoot-style sessions).

A "channel" wraps an existing Quiz (from app.models.quiz) with a short
join code, an optional password, and live state: who's connected, what
question is showing, and running scores. This is intentionally separate
from QuizAttempt/DB-backed quizzes — those stay untouched for the
self-paced flow. This manager only needs a single uvicorn worker; swap
for Redis pub/sub if you ever run multiple workers.
"""
import asyncio
import secrets
import string
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import WebSocket

# Excludes visually-ambiguous characters (0/O, 1/I/L) so a code shown on
# one screen and typed on another isn't misread -- this was causing
# legitimate "Channel not found" errors on manual code entry.
CODE_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0O1IL")


def _gen_code(n: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


@dataclass
class LiveQuestion:
    id: int
    text: str
    options: List[str]
    correct_option: int
    time_limit: int = 20
    explanation: Optional[str] = None


@dataclass
class Participant:
    user_id: int
    username: str
    ws: WebSocket
    is_admin: bool = False
    score: int = 0
    answered_current: bool = False


@dataclass
class LiveChannel:
    code: str
    name: str
    password: Optional[str]
    quiz_id: int
    quiz_title: str
    admin_user_id: int
    questions: List[LiveQuestion] = field(default_factory=list)
    participants: Dict[int, Participant] = field(default_factory=dict)
    state: str = "waiting"  # waiting | in_progress | finished
    phase: str = "idle"  # idle | question | results | explain
    current_question_index: int = -1
    current_question_started_at: float = 0.0
    last_correct_index: Optional[int] = None
    # index -> per-option vote counts, used for the post-quiz explanation walkthrough
    answer_counts: Dict[int, List[int]] = field(default_factory=dict)
    # -1 until the admin starts the explanation walkthrough after the quiz ends
    explain_index: int = -1
    # Persisted independently of the live Participant/WebSocket object so a
    # reload (which tears down and recreates the Participant) never loses a
    # user's running total. Keyed by user_id.
    scores: Dict[int, int] = field(default_factory=dict)
    # user_id -> set of question indices they've already answered. Also kept
    # independent of Participant so a mid-question reload can't be used to
    # (accidentally or otherwise) answer the same question twice.
    answered_questions: Dict[int, set] = field(default_factory=dict)

    def check_password(self, password: Optional[str]) -> bool:
        if not self.password:
            return True
        return password == self.password

    def remaining_seconds(self) -> int:
        """Seconds left on the current question, for someone joining mid-question."""
        if self.current_question_index < 0 or self.current_question_index >= len(self.questions):
            return 0
        q = self.questions[self.current_question_index]
        elapsed = time.time() - self.current_question_started_at
        return max(1, int(q.time_limit - elapsed))

    def user_list(self):
        return [
            {
                "user_id": p.user_id,
                "username": p.username,
                "is_admin": p.is_admin,
                "score": p.score,
            }
            for p in self.participants.values()
        ]

    def leaderboard(self):
        # Admin never takes the quiz, so they're excluded from scoring/ranking.
        return sorted(
            (
                {"username": p.username, "score": p.score}
                for p in self.participants.values()
                if not p.is_admin
            ),
            key=lambda x: x["score"],
            reverse=True,
        )

    def admin_participant(self) -> Optional["Participant"]:
        return self.participants.get(self.admin_user_id)

    def question_counts(self, index: int) -> List[int]:
        if index < 0 or index >= len(self.questions):
            return []
        q = self.questions[index]
        return self.answer_counts.get(index, [0] * len(q.options))


class LiveChannelStore:
    def __init__(self):
        self.channels: Dict[str, LiveChannel] = {}

    def create(
        self,
        name: str,
        password: Optional[str],
        quiz_id: int,
        quiz_title: str,
        admin_user_id: int,
        questions: List[LiveQuestion],
    ) -> LiveChannel:
        code = _gen_code()
        while code in self.channels:
            code = _gen_code()
        channel = LiveChannel(
            code=code,
            name=name,
            password=password or None,
            quiz_id=quiz_id,
            quiz_title=quiz_title,
            admin_user_id=admin_user_id,
            questions=questions,
        )
        self.channels[code] = channel
        return channel

    def get(self, code: str) -> Optional[LiveChannel]:
        return self.channels.get((code or "").strip().upper())

    def remove(self, code: str):
        self.channels.pop((code or "").strip().upper(), None)

    def list_public(self):
        return [
            {
                "code": c.code,
                "name": c.name,
                "locked": bool(c.password),
                "quiz_id": c.quiz_id,
                "quiz_title": c.quiz_title,
                "participant_count": len(c.participants),
                "state": c.state,
                "admin_user_id": c.admin_user_id,
            }
            for c in self.channels.values()
        ]

store = LiveChannelStore()

async def broadcast(channel: LiveChannel, message: dict, exclude_user_id: Optional[int] = None):
    dead = []
    for uid, p in channel.participants.items():
        if uid == exclude_user_id:
            continue
        try:
            await p.ws.send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        channel.participants.pop(uid, None)


async def send_user_list(channel: LiveChannel):
    await broadcast(channel, {"type": "user_list", "users": channel.user_list()})


async def send_leaderboard(channel: LiveChannel):
    await broadcast(channel, {"type": "leaderboard", "scores": channel.leaderboard()})


def explain_payload(channel: LiveChannel) -> Optional[dict]:
    index = channel.explain_index
    if index < 0 or index >= len(channel.questions):
        return None
    q = channel.questions[index]
    return {
        "type": "explain_question",
        "index": index,
        "total": len(channel.questions),
        "id": q.id,
        "text": q.text,
        "options": q.options,
        "correct_option": q.correct_option,
        "explanation": q.explanation,
        "counts": channel.question_counts(index),
    }


async def send_explain_question(channel: LiveChannel):
    """Broadcast the question currently under review to everyone. Only the
    admin can move explain_index forward/back (enforced in the ws handler) —
    this just pushes whatever the admin has it set to out to all clients."""
    payload = explain_payload(channel)
    if payload is not None:
        await broadcast(channel, payload)


async def _run_question_timer(channel: LiveChannel, question_index: int, on_timeout):
    question = channel.questions[question_index]
    await asyncio.sleep(question.time_limit)
    # Only fire if still on the same question (nothing raced ahead of us)
    if channel.state == "in_progress" and channel.current_question_index == question_index:
        await on_timeout()


async def advance_question(channel: LiveChannel):
    channel.current_question_index += 1
    for p in channel.participants.values():
        p.answered_current = False

    if channel.current_question_index >= len(channel.questions):
        channel.state = "finished"
        channel.phase = "idle"
        await broadcast(channel, {"type": "quiz_ended", "final_leaderboard": channel.leaderboard()})
        return

    index = channel.current_question_index
    q = channel.questions[index]
    channel.current_question_started_at = time.time()
    channel.phase = "question"
    channel.last_correct_index = None
    channel.answer_counts[index] = [0] * len(q.options)

    await broadcast(
        channel,
        {
            "type": "question",
            "index": index,
            "total": len(channel.questions),
            "id": q.id,
            "text": q.text,
            "options": q.options,
            "time_limit": q.time_limit,
        },
    )

    async def on_timeout():
        channel.phase = "results"
        channel.last_correct_index = q.correct_option
        counts = channel.question_counts(index)

        # Participants only learn the round has locked — the correct answer
        # and vote breakdown are revealed later, question by question, during
        # the admin-led explanation walkthrough after the quiz finishes.
        await broadcast(
            channel,
            {"type": "question_locked", "index": index},
            exclude_user_id=channel.admin_user_id,
        )
        admin = channel.admin_participant()
        if admin is not None:
            try:
                await admin.ws.send_json(
                    {
                        "type": "question_ended",
                        "index": index,
                        "correct_index": q.correct_option,
                        "counts": counts,
                    }
                )
            except Exception:
                pass

        await send_leaderboard(channel)
        # Show the leaderboard for 5s before the next question starts —
        # also gives late joiners a window where they'll see "results" phase.
        await asyncio.sleep(5)
        await advance_question(channel)

    asyncio.create_task(_run_question_timer(channel, index, on_timeout))
