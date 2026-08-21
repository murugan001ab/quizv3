from datetime import timedelta
from zoneinfo import ZoneInfo
from datetime import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Header
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.quiz import Quiz, Question, QuizAttempt
from app.models.quiz import AttemptActivity
from app.schemas.quiz import (
    QuizDetail,
    PublicStartRequest,
    PublicAttemptOut,
    SubmitAnswers,
    AttemptResult,
    AttemptStartOut,
)
from app.core.security import SECRET_KEY, ALGORITHM, create_access_token
from app.services.question_types import score_attempt

router = APIRouter(prefix="/public", tags=["Public"])

IST = ZoneInfo("Asia/Kolkata")
ATTEMPT_TOKEN_EXPIRE = timedelta(hours=6)


def now_ist():
    return dt.now(IST)


def to_naive(when):
    if when is None:
        return None
    return when.replace(tzinfo=None)


def make_attempt_token(attempt_id: int) -> str:
    return create_access_token(
        {"attempt_id": attempt_id, "type": "public_attempt"},
        expires_delta=ATTEMPT_TOKEN_EXPIRE,
    )


async def _record_attempt_event(db: AsyncSession, attempt_id: int, event_type: str, metadata: dict | None = None):
    db.add(AttemptActivity(attempt_id=attempt_id, event_type=event_type, metadata_json=metadata or {}))


async def get_public_quiz(slug: str, db: AsyncSession) -> Quiz:
    result = await db.execute(
        select(Quiz).where(Quiz.public_slug == slug, Quiz.is_public.is_(True))
    )
    quiz = result.scalar_one_or_none()
    if not quiz or not quiz.is_active:
        raise HTTPException(404, "This link is invalid or no longer active")
    return quiz


async def get_attempt_from_token(
    attempt_id: int,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> QuizAttempt:
    """Validates the short-lived signed token handed back by /start, in
    place of a login — guests never get a real account/JWT."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing attempt token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "public_attempt" or int(payload.get("attempt_id", -1)) != attempt_id:
            raise HTTPException(401, "Invalid attempt token")
    except (JWTError, ValueError, TypeError):
        raise HTTPException(401, "Invalid or expired attempt token")

    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.user_id.is_(None),
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    return attempt


@router.get("/quizzes/{slug}", response_model=QuizDetail)
async def get_public_quiz_detail(slug: str, db: AsyncSession = Depends(get_db)):
    quiz = await get_public_quiz(slug, db)
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == quiz.id).order_by(Question.id)
    )
    questions = q_result.scalars().all()
    # Built explicitly (not QuizDetail.model_validate(quiz)) because that
    # touches the lazy `Quiz.questions` relationship outside an await
    # context and blows up with MissingGreenlet under async SQLAlchemy.
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
        question_count=len(questions),
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
        import random
        ids = random.sample(ids, quiz.random_question_count)
    if quiz.randomize_questions:
        import random
        random.shuffle(ids)
    return ids


@router.post("/quizzes/{slug}/start", response_model=AttemptStartOut, status_code=201)
async def start_public_attempt(
    slug: str,
    data: PublicStartRequest,
    db: AsyncSession = Depends(get_db),
):
    quiz = await get_public_quiz(slug, db)
    if not data.name.strip():
        raise HTTPException(400, "Name is required")

    question_order = await _select_random_question_ids(db, quiz)
    if not question_order:
        raise HTTPException(400, "This quiz has no questions yet")

    # Guests get a fresh attempt on every visit to the link — no login to
    # tie retakes to, so we don't try to enforce max_attempts/allow_retakes
    # here (same scope cut as randomization/duration timer for guests).
    attempt = QuizAttempt(
        user_id=None,
        guest_name=data.name.strip(),
        guest_email=(data.email or "").strip() or None,
        quiz_id=quiz.id,
        answers={},
        score=0,
        total=0,
        submitted=False,
        started_at=to_naive(now_ist()),
        status="in_progress",
        attempt_number=1,
        question_order=question_order,
        bookmarks=[],
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    await _record_attempt_event(db, attempt.id, "test_started", {"guest": True})
    await db.commit()

    questions = await _load_questions_in_order(db, question_order)
    return AttemptStartOut(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        user_id=None,
        score=attempt.score,
        total=attempt.total,
        submitted=attempt.submitted,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        guest_name=attempt.guest_name,
        guest_email=attempt.guest_email,
        status=attempt.status,
        percentage=attempt.percentage,
        total_points=attempt.total_points,
        time_spent_seconds=attempt.time_spent_seconds,
        attempt_number=attempt.attempt_number,
        passed=attempt.passed,
        auto_submitted=attempt.auto_submitted,
        question_order=attempt.question_order or [],
        bookmarks=attempt.bookmarks or [],
        attempt_token=make_attempt_token(attempt.id),
        questions=questions,
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_public_attempt(
    attempt_id: int,
    data: SubmitAnswers,
    db: AsyncSession = Depends(get_db),
    attempt: QuizAttempt = Depends(get_attempt_from_token),
):
    if attempt.submitted:
        raise HTTPException(400, "Already submitted")

    quiz_r = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_r.scalar_one_or_none()
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )
    questions = q_result.scalars().all()

    # Same per-type grading registry as the authenticated submit flow (see
    # app/services/question_types.py) so guests get identical scoring.
    summary = score_attempt(questions, data.answers)
    now = now_ist()

    attempt.answers = {str(k): v for k, v in data.answers.items()}
    attempt.score = summary["correct_answers"]
    attempt.total = summary["gradable_questions"]
    attempt.max_points = summary["max_points"]
    attempt.obtained_points = summary["earned_points"]
    attempt.total_points = summary["max_points"]
    attempt.percentage = round((summary["earned_points"] / summary["max_points"] * 100) if summary["max_points"] else 0, 2)
    attempt.passed = attempt.percentage >= (quiz.passing_percentage if quiz else 0)
    attempt.time_spent_seconds = max(
        0, int(now.timestamp() - attempt.started_at.replace(tzinfo=IST).timestamp())
    )
    attempt.status = "submitted"
    attempt.submitted = True
    attempt.submitted_at = to_naive(now)
    attempt.correct_answers = summary["correct_answers"]
    attempt.incorrect_answers = summary["incorrect_answers"]
    attempt.partial_answers = summary["partial_answers"]
    attempt.unanswered_questions = summary["unanswered_questions"]
    await _record_attempt_event(db, attempt.id, "test_submitted", {"auto": False, "guest": True})
    await db.commit()
    await db.refresh(attempt)

    return AttemptResult(
        id=attempt.id, quiz_id=attempt.quiz_id, user_id=None,
        score=attempt.score, total=attempt.total, submitted=attempt.submitted,
        started_at=attempt.started_at, submitted_at=attempt.submitted_at,
        quiz_title=quiz.title if quiz else None,
        difficulty=quiz.difficulty.value if quiz else None,
        guest_name=attempt.guest_name, guest_email=attempt.guest_email,
        status=attempt.status, percentage=attempt.percentage,
        total_points=attempt.total_points, time_spent_seconds=attempt.time_spent_seconds,
        attempt_number=attempt.attempt_number, passed=attempt.passed,
        auto_submitted=attempt.auto_submitted,
        question_order=attempt.question_order or [], bookmarks=attempt.bookmarks or [],
        answers={str(k): v for k, v in attempt.answers.items()},
        questions=questions,
        essay_pending=summary["essay_pending"],
    )


@router.get("/attempts/{attempt_id}/result", response_model=AttemptResult)
async def public_attempt_result(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    attempt: QuizAttempt = Depends(get_attempt_from_token),
):
    if not attempt.submitted:
        raise HTTPException(400, "Attempt not submitted yet")

    quiz_r = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_r.scalar_one_or_none()
    q_result = await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )
    questions = q_result.scalars().all()

    return AttemptResult(
        id=attempt.id, quiz_id=attempt.quiz_id, user_id=None,
        score=attempt.score, total=attempt.total, submitted=attempt.submitted,
        started_at=attempt.started_at, submitted_at=attempt.submitted_at,
        quiz_title=quiz.title if quiz else None,
        difficulty=quiz.difficulty.value if quiz else None,
        guest_name=attempt.guest_name, guest_email=attempt.guest_email,
        status=attempt.status, percentage=attempt.percentage,
        total_points=attempt.total_points, time_spent_seconds=attempt.time_spent_seconds,
        attempt_number=attempt.attempt_number, passed=attempt.passed,
        auto_submitted=attempt.auto_submitted,
        question_order=attempt.question_order or [], bookmarks=attempt.bookmarks or [],
        answers={str(k): v for k, v in attempt.answers.items()},
        questions=questions,
    )
