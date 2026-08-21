from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from datetime import datetime
import random
from zoneinfo import ZoneInfo
from typing import List, Optional

from app.database import get_db
from app.models.quiz import Quiz, Question, QuizAttempt, AttemptActivity, QuizType, Group, GroupMember
from app.models.user import User
from app.schemas.quiz import (
    QuizOut, QuizDetail, SubmitAnswers, AttemptProgressUpdate, AttemptActivityCreate,
    AttemptActivityOut, AttemptOut, AttemptResult, TestInstructionsOut,
    GroupInviteOut, GroupInviteJoinRequest, GroupOut, AttemptStartOut,
)
from app.core.security import get_current_user
from app.ws_manager import manager
from app.services.question_types import score_attempt

router = APIRouter(prefix="/user", tags=["User"])

IST = ZoneInfo("Asia/Kolkata")


def now_ist():
    return datetime.now(IST)


def normalize_ist(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


def to_naive(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=None)


def enrich_attempt(attempt: QuizAttempt, quiz: Optional[Quiz], user: Optional[User] = None) -> dict:
    return {
        "id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "user_id": attempt.user_id,
        "score": attempt.score,
        "total": attempt.total,
        "submitted": attempt.submitted,
        "started_at": attempt.started_at,
        "submitted_at": attempt.submitted_at,
        "quiz_title": quiz.title if quiz else None,
        "difficulty": quiz.difficulty.value if quiz else None,
        "username": user.username if user else None,
        "status": attempt.status,
        "max_points": getattr(attempt, "max_points", 0) or 0,
        "obtained_points": getattr(attempt, "obtained_points", 0) or 0,
        "percentage": attempt.percentage,
        "total_points": attempt.total_points,
        "time_spent_seconds": attempt.time_spent_seconds,
        "attempt_number": attempt.attempt_number,
        "passed": attempt.passed,
        "auto_submitted": attempt.auto_submitted,
        "correct_answers": getattr(attempt, "correct_answers", 0) or 0,
        "incorrect_answers": getattr(attempt, "incorrect_answers", 0) or 0,
        "partial_answers": getattr(attempt, "partial_answers", 0) or 0,
        "unanswered_questions": getattr(attempt, "unanswered_questions", 0) or 0,
        "question_order": attempt.question_order or [],
        "bookmarks": attempt.bookmarks or [],
    }


def attempt_deadline(attempt: QuizAttempt, quiz: Quiz):
    if not quiz.duration_minutes:
        return None
    return normalize_ist(attempt.started_at).timestamp() + quiz.duration_minutes * 60


async def _record_attempt_event(db: AsyncSession, attempt_id: int, event_type: str, metadata: Optional[dict] = None):
    db.add(AttemptActivity(
        attempt_id=attempt_id,
        event_type=event_type,
        metadata_json=metadata or {},
    ))


def ensure_attempt_open(attempt: QuizAttempt, quiz: Quiz):
    deadline = attempt_deadline(attempt, quiz)
    if deadline and now_ist().timestamp() >= deadline:
        raise HTTPException(409, "Test duration has expired. Submit the answers that were already saved.")


def _finalize_attempt(attempt: QuizAttempt, quiz: Quiz, questions, status_if_clean: str, at_timestamp: float):
    """Score `attempt` against `questions` and close it out. Shared by the
    student-triggered submit flow and the backend's own lazy-expiry reaper
    so both paths compute the score identically.

    `status_if_clean` is the status to use when there's nothing awaiting
    manual grading; if any essay/manually-graded answers were given, the
    attempt always lands on "grading_pending" regardless of how it ended.
    """
    answers = {int(k): v for k, v in (attempt.answers or {}).items()}
    summary = score_attempt(questions, answers)
    attempt.score = summary["correct_answers"]
    attempt.total = summary["gradable_questions"]
    attempt.max_points = summary["max_points"]
    attempt.obtained_points = summary["earned_points"]
    attempt.total_points = summary["max_points"]
    attempt.percentage = round((summary["earned_points"] / summary["max_points"] * 100) if summary["max_points"] else 0, 2)
    attempt.passed = attempt.percentage >= quiz.passing_percentage if not summary["essay_pending"] else None
    attempt.time_spent_seconds = max(0, int(at_timestamp - normalize_ist(attempt.started_at).timestamp()))
    attempt.status = "grading_pending" if summary["essay_pending"] else status_if_clean
    attempt.submitted = True
    attempt.submitted_at = to_naive(datetime.fromtimestamp(at_timestamp, IST))
    attempt.correct_answers = summary["correct_answers"]
    attempt.incorrect_answers = summary["incorrect_answers"]
    attempt.partial_answers = summary["partial_answers"]
    attempt.unanswered_questions = summary["unanswered_questions"]
    return summary["essay_pending"]


async def finalize_if_expired(db: AsyncSession, attempt: QuizAttempt, quiz: Quiz):
    """Backend-authoritative timer enforcement.

    If `attempt` is still open but its deadline has already passed, grade
    it right now using whatever was last autosaved and close it out as
    "expired" (or "grading_pending" if it contains essay answers). This is
    what actually prevents a student from continuing to answer questions
    past the time limit — the React countdown is cosmetic only; every
    write path re-checks the deadline against this function before doing
    anything else.

    Returns True if the attempt was just finalized here.
    """
    if attempt.submitted:
        return False
    deadline = attempt_deadline(attempt, quiz)
    if not deadline or now_ist().timestamp() < deadline:
        return False
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == quiz.id).order_by(Question.id)
    )
    questions = q_result.scalars().all()
    await _record_attempt_event(db, attempt.id, "time_expired", {"deadline": deadline})
    _finalize_attempt(attempt, quiz, questions, status_if_clean="expired", at_timestamp=deadline)
    attempt.auto_submitted = True
    await _record_attempt_event(db, attempt.id, "auto_submitted", {"reason": "time_expired"})
    await db.commit()
    await db.refresh(attempt)
    return True


async def attempt_stats(db: AsyncSession, quiz: Quiz, user_id: int):
    """Completed-attempt count + effective cap for this student/quiz.

    Retakes off → exactly one completed attempt is allowed regardless of
    max_attempts (mirrors the check in start_quiz). Retakes on → capped at
    max_attempts.
    """
    completed = (await db.execute(
        select(func.count(QuizAttempt.id)).where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.submitted.is_(True),
        )
    )).scalar() or 0
    effective_max = quiz.max_attempts if quiz.allow_retakes else 1
    remaining = max(0, effective_max - completed)
    return completed, effective_max, remaining


@router.get("/quizzes", response_model=List[QuizOut])
async def available_quizzes(
    difficulty: Optional[str] = None,
    subject: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Quiz).where(Quiz.is_active == True, Quiz.quiz_type == QuizType.scheduled.value)
    if difficulty:
        q = q.where(Quiz.difficulty == difficulty)
    if subject:
        q = q.where(Quiz.subject == subject)
    result = await db.execute(q)
    quizzes = result.scalars().all()
    for quiz in quizzes:
        count = await db.execute(
            select(func.count(Question.id)).where(Question.quiz_id == quiz.id)
        )
        quiz.question_count = count.scalar()
    return quizzes


@router.get("/quizzes/{quiz_id}", response_model=QuizDetail)
async def get_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quiz).where(Quiz.id == quiz_id, Quiz.is_active == True, Quiz.quiz_type == QuizType.scheduled.value)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    now = now_ist()
    end = normalize_ist(quiz.scheduled_end)
    if end and now > end:
        raise HTTPException(403, "Quiz time has ended")
    question_count = (await db.execute(
        select(func.count(Question.id)).where(Question.quiz_id == quiz_id)
    )).scalar() or 0
    return QuizDetail(
        id=quiz.id,
        title=quiz.title,
        description=quiz.description,
        difficulty=quiz.difficulty,
        subject=quiz.subject,
        topic=quiz.topic,
        quiz_type=quiz.quiz_type,
        scheduled_start=quiz.scheduled_start,
        scheduled_end=quiz.scheduled_end,
        is_active=quiz.is_active,
        created_at=quiz.created_at,
        question_count=question_count,
        instructions=quiz.instructions,
        duration_minutes=quiz.duration_minutes,
        status=quiz.status,
        passing_percentage=quiz.passing_percentage,
        max_attempts=quiz.max_attempts,
        allow_retakes=quiz.allow_retakes,
        randomize_questions=quiz.randomize_questions,
        randomize_answers=quiz.randomize_answers,
        random_question_count=quiz.random_question_count,
        show_results=quiz.show_results,
        show_answers=quiz.show_answers,
        instant_feedback=quiz.instant_feedback,
        allow_navigation=quiz.allow_navigation,
        allow_bookmarking=quiz.allow_bookmarking,
        allow_question_review=quiz.allow_question_review,
        security_settings=quiz.security_settings,
        is_public=quiz.is_public,
        public_slug=quiz.public_slug,
        questions=[],
    )


@router.get("/quizzes/{quiz_id}/instructions", response_model=TestInstructionsOut)
async def quiz_instructions(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test Instructions screen — shown between "Available Tests" and
    "Start Test". Read-only: never creates an attempt, never leaks answer
    keys, but does eagerly settle any stale in-progress attempt so the
    "attempts remaining" figure shown here is always accurate."""
    result = await db.execute(
        select(Quiz).where(Quiz.id == quiz_id, Quiz.is_active == True, Quiz.quiz_type == QuizType.scheduled.value)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    question_count = (await db.execute(
        select(func.count(Question.id)).where(Question.quiz_id == quiz_id)
    )).scalar() or 0

    now = now_ist()
    start = normalize_ist(quiz.scheduled_start)
    end = normalize_ist(quiz.scheduled_end)

    # Settle a stale attempt (if any) before counting, so a student who
    # walked away mid-test sees an up to date "attempts remaining".
    existing = (await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.submitted.is_(False),
        )
    )).scalar_one_or_none()
    if existing:
        await finalize_if_expired(db, existing, quiz)
        if existing.submitted:
            existing = None

    completed, effective_max, remaining = await attempt_stats(db, quiz, current_user.id)

    can_start = True
    block_reason = None
    if start and now < start:
        can_start = False
        block_reason = f"This test opens at {start.isoformat()}"
    elif end and now > end:
        can_start = False
        block_reason = "This test's scheduled window has ended"
    elif not existing and remaining <= 0:
        can_start = False
        block_reason = "Retakes are not allowed for this test" if not quiz.allow_retakes and completed else "Maximum attempts reached"

    return TestInstructionsOut(
        id=quiz.id,
        title=quiz.title,
        description=quiz.description,
        instructions=quiz.instructions,
        subject=quiz.subject,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        question_count=question_count,
        duration_minutes=quiz.duration_minutes,
        passing_percentage=quiz.passing_percentage,
        max_attempts=effective_max,
        allow_retakes=quiz.allow_retakes,
        attempts_used=completed,
        attempts_remaining=remaining,
        allow_bookmarking=quiz.allow_bookmarking,
        allow_navigation=quiz.allow_navigation,
        scheduled_start=quiz.scheduled_start,
        scheduled_end=quiz.scheduled_end,
        can_start=can_start,
        block_reason=block_reason,
        has_in_progress_attempt=bool(existing),
        in_progress_attempt_id=existing.id if existing else None,
    )


async def _load_questions_in_order(db: AsyncSession, question_ids: list[int]):
    if not question_ids:
        return []
    result = await db.execute(select(Question).where(Question.id.in_(question_ids)))
    by_id = {q.id: q for q in result.scalars().all()}
    return [by_id[qid] for qid in question_ids if qid in by_id]


async def _select_random_question_ids(db: AsyncSession, quiz: Quiz) -> list[int]:
    q = select(Question.id).where(Question.quiz_id == quiz.id)
    if quiz.random_question_categories:
        q = q.where(Question.category.in_(quiz.random_question_categories))
    q = q.order_by(Question.id)
    ids = list((await db.execute(q)).scalars().all())
    if quiz.random_question_count and quiz.random_question_count > 0 and quiz.random_question_count < len(ids):
        ids = random.sample(ids, quiz.random_question_count)
    if quiz.randomize_questions:
        random.shuffle(ids)
    return ids


@router.post("/quizzes/{quiz_id}/start", response_model=AttemptStartOut, status_code=201)
async def start_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id, Quiz.is_active == True, Quiz.quiz_type == QuizType.scheduled.value))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    now = now_ist()
    start = normalize_ist(quiz.scheduled_start)
    end = normalize_ist(quiz.scheduled_end)
    if start and now < start:
        raise HTTPException(403, {"message": "Quiz not started yet", "start_time": start.isoformat()})
    if end and now > end:
        raise HTTPException(403, "Quiz time has ended")

    # Try to find an existing unsubmitted attempt first.
    existing = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.submitted.is_(False),
        )
    )
    attempt = existing.scalar_one_or_none()
    if attempt:
        # Backend-authoritative timer: if this attempt's clock already ran
        # out (e.g. the student closed the tab and came back later), settle
        # it now instead of trusting a client that never checked back in.
        if await finalize_if_expired(db, attempt, quiz):
            attempt = None
        else:
            await _record_attempt_event(db, attempt.id, "test_resumed", {"via": "start_endpoint"})
            await db.commit()
            questions = await _load_questions_in_order(db, attempt.question_order or [])
            return AttemptStartOut(**enrich_attempt(attempt, quiz, current_user), questions=questions)

    completed_attempts, effective_max, remaining = await attempt_stats(db, quiz, current_user.id)
    if completed_attempts and not quiz.allow_retakes:
        raise HTTPException(403, "Retakes are not allowed for this test")
    if remaining <= 0:
        raise HTTPException(403, "Maximum attempts reached")

    question_order = await _select_random_question_ids(db, quiz)

    # No existing attempt — create one.
    # Wrap in try/except: two concurrent /start requests (e.g. from
    # Promise.all on the frontend) can both pass the SELECT above and then
    # race to INSERT. The unique index lets only one win; the loser gets an
    # IntegrityError which we recover from by simply re-fetching the row
    # the winner just created.
    attempt = QuizAttempt(
        user_id=current_user.id,
        quiz_id=quiz_id,
        answers={},
        score=0,
        total=0,
        submitted=False,
        started_at=to_naive(now),
        status="in_progress",
        attempt_number=completed_attempts + 1,
        question_order=question_order,
        bookmarks=[],
    )
    db.add(attempt)
    try:
        await db.commit()
        await db.refresh(attempt)
    except IntegrityError:
        # Lost the race — roll back and fetch the winner's row.
        await db.rollback()
        refetch = await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.user_id == current_user.id,
                QuizAttempt.quiz_id == quiz_id,
                QuizAttempt.submitted.is_(False),
            )
        )
        attempt = refetch.scalar_one()
        questions = await _load_questions_in_order(db, attempt.question_order or question_order)
        return AttemptStartOut(**enrich_attempt(attempt, quiz, current_user), questions=questions)

    await _record_attempt_event(db, attempt.id, "test_started", {"attempt_number": attempt.attempt_number})
    await db.commit()

    await manager.broadcast({
        "type": "quiz_started",
        "user": current_user.username,
        "quiz_id": quiz_id,
        "quiz_title": quiz.title,
        "difficulty": quiz.difficulty.value,
        "subject": quiz.subject,
        "attempt_id": attempt.id,
        "ts": now.isoformat(),
    })
    questions = await _load_questions_in_order(db, attempt.question_order or question_order)
    return AttemptStartOut(**enrich_attempt(attempt, quiz, current_user), questions=questions)


@router.put("/attempts/{attempt_id}/progress", response_model=AttemptOut)
async def save_attempt_progress(
    attempt_id: int,
    data: AttemptProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist answers and bookmarks during an attempt.

    Stored state is deliberately server-side so a refresh, reconnect, or a
    second browser session resumes the same in-progress exam.
    """
    result = await db.execute(select(QuizAttempt).where(
        QuizAttempt.id == attempt_id,
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.submitted.is_(False),
    ))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Active attempt not found")
    quiz = (await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one()
    if await finalize_if_expired(db, attempt, quiz):
        # The deadline had already passed — the backend just closed this
        # attempt out server-side rather than accepting more answers.
        raise HTTPException(410, {
            "message": "Test duration has expired. Your saved answers were auto-submitted.",
            "attempt_id": attempt.id,
            "status": attempt.status,
        })

    allowed_ids = set(attempt.question_order or [])
    if not allowed_ids:
        allowed_ids = set((await db.execute(select(Question.id).where(Question.quiz_id == quiz.id))).scalars().all())
    if any(question_id not in allowed_ids for question_id in data.answers) or any(question_id not in allowed_ids for question_id in data.bookmarks):
        raise HTTPException(400, "Progress contains a question outside this test")

    attempt.answers = {str(key): value for key, value in data.answers.items()}
    attempt.bookmarks = sorted(set(data.bookmarks)) if quiz.allow_bookmarking else []
    await db.commit()
    await db.refresh(attempt)
    return AttemptOut(**enrich_attempt(attempt, quiz, current_user))


@router.post("/attempts/{attempt_id}/events", response_model=AttemptActivityOut, status_code=201)
async def record_attempt_event(
    attempt_id: int,
    data: AttemptActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a non-invasive client event; no webcam or biometric data."""
    if not data.event_type.strip() or len(data.event_type) > 80:
        raise HTTPException(400, "A valid event type is required")
    attempt = (await db.execute(select(QuizAttempt).where(
        QuizAttempt.id == attempt_id,
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.submitted.is_(False),
    ))).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Active attempt not found")
    quiz = (await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one()
    if await finalize_if_expired(db, attempt, quiz):
        raise HTTPException(410, {
            "message": "Test duration has expired. Your saved answers were auto-submitted.",
            "attempt_id": attempt.id,
            "status": attempt.status,
        })
    event = AttemptActivity(
        attempt_id=attempt.id,
        event_type=data.event_type.strip(),
        metadata_json=data.metadata,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return AttemptActivityOut(
        id=event.id,
        attempt_id=event.attempt_id,
        event_type=event.event_type,
        metadata=event.metadata_json,
        created_at=event.created_at,
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_quiz(
    attempt_id: int,
    data: SubmitAnswers,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.user_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")

    quiz_r = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_r.scalar_one_or_none()
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )
    questions = q_result.scalars().all()

    if attempt.submitted:
        # The backend may have already auto-finalized this attempt (lazy
        # expiry reaper in finalize_if_expired) between the student's last
        # autosave and this submit click landing. Rather than erroring on
        # a click the student has no way to retract, just hand back the
        # already-computed result — same outcome either way.
        return AttemptResult(
            **enrich_attempt(attempt, quiz, current_user),
            answers={str(k): v for k, v in (attempt.answers or {}).items()},
            questions=questions,
            essay_pending=0,
        )

    # Persist the final answer snapshot the client sent, then delegate
    # scoring to the same per-question-type registry (see
    # app/services/question_types.py) — MCQ, multiple-select (with
    # optional partial credit), true/false, auto-graded short answer,
    # matching, and manually-graded essay are all handled consistently
    # here and in the public (guest) submit flow.
    attempt.answers = {str(k): v for k, v in data.answers.items()}
    now = now_ist()
    deadline = attempt_deadline(attempt, quiz)
    status_if_clean = "auto_submitted" if (deadline and now.timestamp() >= deadline) else "submitted"
    essay_pending = _finalize_attempt(attempt, quiz, questions, status_if_clean, now.timestamp())
    attempt.auto_submitted = status_if_clean == "auto_submitted"
    await _record_attempt_event(
        db,
        attempt.id,
        "test_submitted",
        {"auto": attempt.auto_submitted, "essay_pending": essay_pending},
    )
    await db.commit()
    await db.refresh(attempt)

    await manager.broadcast({
        "type": "quiz_submitted",
        "user": current_user.username,
        "quiz_id": attempt.quiz_id,
        "quiz_title": quiz.title if quiz else "",
        "difficulty": quiz.difficulty.value if quiz else "",
        "subject": quiz.subject if quiz else "",
        "attempt_id": attempt.id,
        "score": attempt.score,
        "total": len(questions),
        "ts": now.isoformat(),
    })

    return AttemptResult(
        **enrich_attempt(attempt, quiz, current_user),
        answers={str(k): v for k, v in attempt.answers.items()},
        questions=questions,
        essay_pending=essay_pending,
    )


@router.get("/results", response_model=List[AttemptOut])
async def my_results(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == current_user.id, QuizAttempt.submitted == True)
        .order_by(QuizAttempt.submitted_at.desc())
    )
    attempts = result.scalars().all()
    enriched = []
    for attempt in attempts:
        quiz_r = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
        quiz = quiz_r.scalar_one_or_none()
        enriched.append(AttemptOut(**enrich_attempt(attempt, quiz, current_user)))
    return enriched


@router.get("/results/{attempt_id}", response_model=AttemptResult)
async def result_detail(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.submitted == True,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Result not found")

    quiz_r = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_r.scalar_one_or_none()
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )
    questions = q_result.scalars().all()

    show_results = bool(quiz.show_results if quiz else True)
    show_answers = bool(quiz.show_answers if quiz else False)
    allow_review = bool(quiz.allow_question_review if quiz else True)
    answers = {str(k): v for k, v in (attempt.answers or {}).items()} if show_results else {}
    questions_out = questions if allow_review and show_results else []
    essay_pending = sum(
        1 for q in questions
        if q.question_type == "essay"
        and str(q.id) in (attempt.manual_grades or {})
        and (attempt.answers or {}).get(str(q.id)) not in (None, "")
    )
    if not show_answers and show_results:
        for q in questions_out:
            if q.question_type in ("multiple_choice", "true_false"):
                q.correct_option = None
            if q.question_type == "multiple_select":
                q.correct_options = []
            if q.question_type == "short_answer":
                q.expected_answers = []
            if q.question_type == "matching":
                q.matching_data = {}

    return AttemptResult(
        **enrich_attempt(attempt, quiz, current_user),
        answers=answers,
        questions=questions_out,
        essay_pending=essay_pending,
    )


@router.get("/groups/invite/{invite_token}", response_model=GroupInviteOut)
async def get_group_invite(
    invite_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student), selectinload(Group.owner))
        .where(Group.invite_token == invite_token)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Invite not found")
    return GroupInviteOut(
        group_id=group.id,
        group_name=group.name,
        description=group.description,
        owner_name=group.owner.name if group.owner else None,
        invite_token=group.invite_token or "",
        member_count=len(group.members),
    )


@router.post("/groups/invite/join", response_model=GroupOut)
async def join_group_invite(
    data: GroupInviteJoinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student))
        .where(Group.invite_token == data.invite_token)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Invite not found")

    existing = (await db.execute(
        select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.student_id == current_user.id)
    )).scalar_one_or_none()
    if not existing:
        db.add(GroupMember(group_id=group.id, student_id=current_user.id))
        await db.commit()

    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student))
        .where(Group.id == group.id)
    )
    group = result.scalar_one()
    return GroupOut(
        id=group.id,
        owner_id=group.owner_id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=len(group.members),
        members=[
            {
                "student_id": gm.student.id,
                "username": gm.student.username,
                "name": gm.student.name,
                "email": gm.student.email,
            }
            for gm in group.members if gm.student
        ],
    )
