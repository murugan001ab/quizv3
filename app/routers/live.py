"""
Live quiz channels: admin creates a named (optionally password-protected)
channel wrapping an existing quiz; everyone joins the same WebSocket,
sees the live participant list, and once the admin starts it, questions
are pushed to everyone in sync with a running leaderboard.

Auth on the WebSocket reuses the same JWT scheme as /ws/admin: the access
token is passed as a query param since browsers can't set custom headers
on a WebSocket handshake.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ALGORITHM, SECRET_KEY, get_admin_user, get_current_user,create_access_token
from app.database import AsyncSessionLocal, get_db
from app.live_session_manager import (
    LiveQuestion,
    Participant,
    advance_question,
    broadcast,
    explain_payload,
    send_explain_question,
    send_user_list,
    store,
)
from app.models.quiz import Question, Quiz
from app.models.quiz import QuizType
from app.models.user import User
from app.schemas.live import LiveChannelCreate, LiveChannelOut, LiveChannelSummary

router = APIRouter(prefix="/live", tags=["Live Quiz"])


@router.post("/channels", response_model=LiveChannelOut, status_code=201)
async def create_channel(
    data: LiveChannelCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    result = await db.execute(select(Quiz).where(Quiz.id == data.quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if quiz.quiz_type != QuizType.live.value:
        raise HTTPException(400, "Only quizzes of type 'live' can be hosted in a live channel")

    q_result = await db.execute(
        select(Question).where(Question.quiz_id == quiz.id).order_by(Question.id)
    )
    questions = q_result.scalars().all()
    if not questions:
        raise HTTPException(400, "This quiz has no questions yet")

    

    live_questions = [
        LiveQuestion(
            id=q.id,
            text=q.text,
            options=q.options,
            correct_option=q.correct_option,
            time_limit=data.time_per_question,
            explanation=q.explanation,
        )
        for q in questions
    ]

    channel = store.create(
        name=data.name,
        password=data.password,
        quiz_id=quiz.id,
        quiz_title=quiz.title,
        admin_user_id=admin.id,
        questions=live_questions,
    )

    linkdata={
        "code":channel.code,
        "password":channel.password
    }
    link_token=create_access_token(linkdata)

    return LiveChannelOut(
        code=channel.code,
        name=channel.name,
        locked=bool(channel.password),
        quiz_id=quiz.id,
        quiz_title=quiz.title,
        link_token=link_token
    )


@router.get("/channels", response_model=list[LiveChannelSummary])
async def list_channels(admin: User = Depends(get_admin_user)):
    return store.list_public()


@router.delete("/channels/{code}", status_code=204)
async def close_channel(code: str, admin: User = Depends(get_admin_user)):
    channel = store.get(code)
    if channel:
        store.remove(code)


def _verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def _safe_send(ws: WebSocket, data: dict):
    """send_json, but tolerant of a client that's already gone. The raw
    transport can be closed out from under us (tab closed, fast reconnect,
    React double-mount opening/closing a socket in quick succession) and
    send_json then raises a bare RuntimeError -- not a WebSocketDisconnect --
    which would otherwise crash the ASGI worker for this connection."""
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def _safe_close(ws: WebSocket, code: int = 1000):
    try:
        await ws.close(code=code)
    except Exception:
        pass


async def _get_user(payload: dict) -> User | None:
    user_id = payload.get("sub")
    if user_id is None:
        return None
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


@router.websocket("/ws/{code}")
async def live_ws(websocket: WebSocket, code: str, token: str = Query(...),link: Optional[str]=None):
    await websocket.accept()

    # A shared invite link (/live/:code/:link_token) encodes the channel's
    # code + password in a signed token, generated once in create_channel().
    # If it decodes successfully and matches this channel, the visitor is
    # trusted to skip typing the password manually.
    link_valid = False
    if link:
        link_payload = _verify_token(link)
        if link_payload and link_payload.get("code") == code.upper():
            link_valid = True

    payload = _verify_token(token)
    if not payload:
        await _safe_send(websocket, {"type": "error", "message": "Invalid or expired token"})
        await _safe_close(websocket, code=1008)
        return

    user = await _get_user(payload)
    if not user:
        await _safe_send(websocket, {"type": "error", "message": "User not found"})
        await _safe_close(websocket, code=1008)
        return


    channel = store.get(code)
    if not channel:
        await _safe_send(websocket, {"type": "error", "message": "Channel not found"})
        await _safe_close(websocket)
        return

    participant: Participant | None = None

    try:
        first_msg = await websocket.receive_json()
        if first_msg.get("type") != "join":
            await _safe_send(websocket, {"type": "error", "message": "Expected a join message first"})
            await _safe_close(websocket)
            return

        password = first_msg.get("password")
        # A valid invite link already proves the visitor has the password
        # (it's embedded in the signed token), so skip the manual check.
        if not link_valid and not channel.check_password(password):
            await _safe_send(websocket, {"type": "error", "message": "Incorrect password"})
            await _safe_close(websocket)
            return

        is_admin = user.is_admin and user.id == channel.admin_user_id

        existing = channel.participants.get(user.id)
        if existing is not None:
            # A new connection that already passed token + password auth for
            # this user is trusted as a legitimate reconnect (reload, tab
            # refresh, dropped wifi) -- always evict the old socket rather
            # than trying to probe whether it's "actually" still alive. That
            # probe (send a ping, see if it throws) is unreliable: a
            # half-closed TCP socket can still accept writes for a while, so
            # it was sometimes rejecting genuine reloads as "already
            # connected in another tab" -- which, worse, could also skip the
            # score handoff below and reset the user back to 0.
            try:
                await existing.ws.close()
            except Exception:
                pass
            channel.participants.pop(user.id, None)

        # Score (and which questions have already been answered) is tracked
        # on the channel itself, independent of the Participant/WebSocket
        # object, so a reload never loses progress -- regardless of exactly
        # when the old connection's disconnect is detected relative to the
        # new one connecting.
        prior_score = channel.scores.get(user.id, existing.score if existing is not None else 0)
        channel.scores[user.id] = prior_score
        answered_current = (
            channel.current_question_index in channel.answered_questions.get(user.id, set())
        )
        participant = Participant(
            user_id=user.id,
            username=user.username,
            ws=websocket,
            is_admin=is_admin,
            score=prior_score,
            answered_current=answered_current,
        )
        channel.participants[user.id] = participant

        await _safe_send(
            websocket,
            {
                "type": "joined",
                "channel": {
                    "code": channel.code,
                    "name": channel.name,
                    "state": channel.state,
                    "quiz_title": channel.quiz_title,
                },
                "is_admin": is_admin,
            },
        )
        await send_user_list(channel)

        # Resume mid-session: catch this participant up on whatever's showing
        # right now instead of leaving them stuck until the next question.
        if channel.state == "in_progress" and 0 <= channel.current_question_index < len(channel.questions):
            q = channel.questions[channel.current_question_index]
            if channel.phase == "results":
                if is_admin:
                    await _safe_send(
                        websocket,
                        {
                            "type": "question_ended",
                            "index": channel.current_question_index,
                            "correct_index": channel.last_correct_index,
                            "counts": channel.question_counts(channel.current_question_index),
                        },
                    )
                else:
                    await _safe_send(
                        websocket, {"type": "question_locked", "index": channel.current_question_index}
                    )
                await _safe_send(websocket, {"type": "leaderboard", "scores": channel.leaderboard()})
            else:
                await _safe_send(
                    websocket,
                    {
                        "type": "question",
                        "index": channel.current_question_index,
                        "total": len(channel.questions),
                        "id": q.id,
                        "text": q.text,
                        "options": q.options,
                        "time_limit": channel.remaining_seconds(),
                    },
                )
        elif channel.state == "finished":
            await _safe_send(
                websocket, {"type": "quiz_ended", "final_leaderboard": channel.leaderboard()}
            )
            if channel.phase == "explain":
                payload = explain_payload(channel)
                if payload is not None:
                    await _safe_send(websocket, payload)

        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")

            if mtype == "start_quiz":
                if not participant.is_admin:
                    await _safe_send(
                        websocket, {"type": "error", "message": "Only the admin can start the quiz"}
                    )
                    continue
                if channel.state != "waiting":
                    continue
                channel.state = "in_progress"
                await broadcast(channel, {"type": "quiz_started"})
                channel.current_question_index = -1
                await advance_question(channel)

            elif mtype == "answer":
                if participant.is_admin:
                    await _safe_send(
                        websocket, {"type": "error", "message": "The host doesn't take the quiz"}
                    )
                    continue
                if channel.state != "in_progress" or participant.answered_current:
                    continue
                q_index = msg.get("index")
                option_index = msg.get("option_index")
                if q_index != channel.current_question_index:
                    continue
                question = channel.questions[channel.current_question_index]
                if not isinstance(option_index, int) or not (0 <= option_index < len(question.options)):
                    continue
                participant.answered_current = True
                channel.answered_questions.setdefault(user.id, set()).add(channel.current_question_index)
                counts = channel.answer_counts.setdefault(
                    channel.current_question_index, [0] * len(question.options)
                )
                counts[option_index] += 1
                is_correct = option_index == question.correct_option
                if is_correct:
                    participant.score += 1
                    channel.scores[user.id] = participant.score
                await _safe_send(websocket, {"type": "answer_ack", "correct": is_correct})

            elif mtype == "start_explain":
                if not participant.is_admin:
                    await _safe_send(
                        websocket, {"type": "error", "message": "Only the admin can start the explanation"}
                    )
                    continue
                if channel.state != "finished" or not channel.questions:
                    continue
                channel.phase = "explain"
                channel.explain_index = 0
                await send_explain_question(channel)

            elif mtype in ("explain_next", "explain_prev"):
                if not participant.is_admin:
                    await _safe_send(
                        websocket, {"type": "error", "message": "Only the admin can move through the explanation"}
                    )
                    continue
                if channel.phase != "explain":
                    continue
                step = 1 if mtype == "explain_next" else -1
                new_index = channel.explain_index + step
                if 0 <= new_index < len(channel.questions):
                    channel.explain_index = new_index
                    await send_explain_question(channel)

            elif mtype == "leave":
                break

    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError covers the transport-already-closed race (client
        # gone between message receipt and our reply going out).
        pass
    finally:
        if participant is not None:
            channel.participants.pop(user.id, None)
            await send_user_list(channel)
