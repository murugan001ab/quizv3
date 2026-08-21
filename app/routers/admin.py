from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, asc, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
import secrets
import csv
import io
from datetime import datetime
from app.database import get_db
from app.models.quiz import Quiz, Question, QuizAttempt, AttemptActivity, now_ist
from app.models.user import User
from app.models.quiz import Group, GroupMember
from app.schemas.quiz import (
    QuizCreate, QuizUpdate, QuizOut, QuizDetail,AdminQuizDetail,
    QuestionCreate, QuestionOut, QuestionOutWithAnswer,
    AttemptOut, AttemptActivityOut, PublicLinkOut,
    AttemptGradeRequest, AttemptGradingOut, GradableAnswerOut,
    AttemptResult, QuizAnalyticsOut, AnalyticsTestSummary,
    AnalyticsQuestionOut, AnalyticsCategoryOut,
    GroupCreate, GroupUpdate, GroupOut, GroupMemberOut, GroupMemberAddRequest,
    GroupInviteOut,
)
from app.schemas.user import UserOut
from app.core.security import get_admin_user
from app.services.question_types import validate_question_data, score_attempt, grade_question

router = APIRouter(prefix="/admin", tags=["Admin"])


def _parse_boolish(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _parse_correct_answer(question_type: str, value: str):
    value = (value or "").strip()
    if question_type in {"multiple_choice", "true_false"}:
        if not value:
            raise ValueError("correct_answer is required")
        if value.isdigit():
            return int(value)
        lookup = {"true": 0, "false": 1, "a": 0, "b": 1, "c": 2, "d": 3}
        if value.lower() in lookup:
            return lookup[value.lower()]
        raise ValueError("correct_answer must be an option index, A-D, or True/False")
    if question_type == "multiple_select":
        if not value:
            raise ValueError("correct_answer is required")
        parts = [p.strip() for p in value.split("|") if p.strip()]
        out = []
        for part in parts:
            if not part.isdigit():
                raise ValueError("multiple_select correct_answer must be pipe-separated indices")
            out.append(int(part))
        return out
    if question_type == "short_answer":
        return [p.strip() for p in value.split("|") if p.strip()]
    return value


def _row_error(row_num: int, message: str):
    return {"row": row_num, "error": message}


def _serialize_group(group: Group) -> GroupOut:
    members = [
        GroupMemberOut(
            student_id=gm.student.id,
            username=gm.student.username,
            name=gm.student.name,
            email=gm.student.email,
        )
        for gm in group.members
        if gm.student
    ]
    return GroupOut(
        id=group.id,
        owner_id=group.owner_id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=len(members),
        members=members,
    )


async def _get_owned_group_or_404(db: AsyncSession, group_id: int, current_user: User) -> Group:
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student))
        .where(Group.id == group_id, Group.owner_id == current_user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    return group


# ── Users ─────────────────────────────────────────────────
@router.get("/users", response_model=List[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.get("/groups", response_model=List[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student))
        .where(Group.owner_id == current_user.id)
        .order_by(Group.created_at.desc())
    )
    return [_serialize_group(group) for group in result.scalars().all()]


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(data: GroupCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    group = Group(owner_id=current_user.id, name=data.name.strip(), description=data.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student))
        .where(Group.id == group.id)
    )
    return _serialize_group(result.scalar_one())


@router.post("/groups/{group_id}/invite", response_model=GroupInviteOut)
async def create_group_invite(group_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    if not group.invite_token:
        group.invite_token = secrets.token_urlsafe(24)
    await db.commit()
    await db.refresh(group)
    owner = await db.execute(select(User).where(User.id == group.owner_id))
    owner_user = owner.scalar_one_or_none()
    member_count = (await db.execute(select(func.count(GroupMember.student_id)).where(GroupMember.group_id == group.id))).scalar() or 0
    return GroupInviteOut(
        group_id=group.id,
        group_name=group.name,
        description=group.description,
        owner_name=owner_user.name if owner_user else None,
        invite_token=group.invite_token,
        member_count=member_count,
    )


@router.delete("/groups/{group_id}/invite", response_model=GroupInviteOut)
async def revoke_group_invite(group_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    group.invite_token = None
    await db.commit()
    await db.refresh(group)
    member_count = (await db.execute(select(func.count(GroupMember.student_id)).where(GroupMember.group_id == group.id))).scalar() or 0
    return GroupInviteOut(
        group_id=group.id,
        group_name=group.name,
        description=group.description,
        owner_name=current_user.name,
        invite_token="",
        member_count=member_count,
    )


@router.put("/groups/{group_id}", response_model=GroupOut)
async def update_group(group_id: int, data: GroupUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    if data.name is not None:
      group.name = data.name.strip()
    if data.description is not None:
      group.description = data.description
    await db.commit()
    await db.refresh(group)
    group = await _get_owned_group_or_404(db, group_id, current_user)
    return _serialize_group(group)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    await db.delete(group)
    await db.commit()


@router.post("/groups/{group_id}/members", response_model=GroupOut, status_code=201)
async def add_group_member(
    group_id: int,
    data: GroupMemberAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    student = (await db.execute(select(User).where(User.id == data.student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(404, "Student not found")
    existing = (await db.execute(
        select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.student_id == student.id)
    )).scalar_one_or_none()
    if not existing:
        db.add(GroupMember(group_id=group.id, student_id=student.id))
        await db.commit()
    group = await _get_owned_group_or_404(db, group_id, current_user)
    return _serialize_group(group)


@router.delete("/groups/{group_id}/members/{student_id}", response_model=GroupOut)
async def remove_group_member(
    group_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    group = await _get_owned_group_or_404(db, group_id, current_user)
    member = (await db.execute(
        select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.student_id == student_id)
    )).scalar_one_or_none()
    if member:
        await db.delete(member)
        await db.commit()
    group = await _get_owned_group_or_404(db, group_id, current_user)
    return _serialize_group(group)


@router.get("/groups/invite/{invite_token}", response_model=GroupInviteOut)
async def get_group_invite(invite_token: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_admin_user)):
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.student), selectinload(Group.owner))
        .where(Group.invite_token == invite_token)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Invite not found")
    member_count = len(group.members)
    return GroupInviteOut(
        group_id=group.id,
        group_name=group.name,
        description=group.description,
        owner_name=group.owner.name if group.owner else None,
        invite_token=group.invite_token or "",
        member_count=member_count,
    )


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    total_quizzes = (await db.execute(select(func.count(Quiz.id)))).scalar()
    total_attempts = (await db.execute(select(func.count(QuizAttempt.id)))).scalar()
    # "Live" = started but not submitted, AND the quiz hasn't ended.
    # Without the quiz-end check, an attempt abandoned mid-quiz (tab closed,
    # browser crash, etc.) stays "submitted=False" forever and would
    # permanently inflate this count.
    now = now_ist()
    active_attempts = (await db.execute(
        select(func.count(QuizAttempt.id))
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(
            QuizAttempt.submitted == False,
            or_(Quiz.scheduled_end.is_(None), Quiz.scheduled_end >= now),
        )
    )).scalar()
    grading_pending = (await db.execute(
        select(func.count(QuizAttempt.id)).where(QuizAttempt.status == "grading_pending")
    )).scalar()
    return {
        "total_users": total_users,
        "total_quizzes": total_quizzes,
        "total_attempts": total_attempts,
        "live_takers": active_attempts,
        "grading_pending": grading_pending,
    }


@router.get("/attempts", response_model=List[AttemptOut])
async def all_attempts(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = None,
    status: Optional[str] = None,
    quiz_id: Optional[int] = None,
    user_id: Optional[int] = None,
    passed: Optional[bool] = None,
    sort_by: str = "date",
    sort_order: str = "desc",
):
    """Most recent attempts across every quiz (not just a handful of
    quizzes), newest submissions first. Fixes the dashboard's old approach
    of only checking the first 5 quizzes returned by list_quizzes (which
    has no ORDER BY, so it isn't the same as "most recently active
    quizzes") — that meant quizzes created later, even if heavily attempted,
    never showed up in "Recent Attempts".
    """
    q = select(QuizAttempt).join(Quiz, Quiz.id == QuizAttempt.quiz_id).outerjoin(User, User.id == QuizAttempt.user_id)
    if quiz_id is not None:
        q = q.where(QuizAttempt.quiz_id == quiz_id)
    if user_id is not None:
        q = q.where(QuizAttempt.user_id == user_id)
    if status:
        q = q.where(QuizAttempt.status == status)
    if passed is not None:
        q = q.where(QuizAttempt.passed.is_(passed))
    if search:
        like = f"%{search}%"
        q = q.where(or_(
            Quiz.title.ilike(like),
            User.username.ilike(like),
            User.name.ilike(like),
            QuizAttempt.guest_name.ilike(like),
        ))
    sort_map = {
        "name": User.username,
        "score": QuizAttempt.score,
        "percentage": QuizAttempt.percentage,
        "duration": QuizAttempt.time_spent_seconds,
        "date": QuizAttempt.submitted_at,
        "status": QuizAttempt.status,
    }
    sort_col = sort_map.get(sort_by, QuizAttempt.submitted_at)
    q = q.order_by(asc(sort_col) if sort_order.lower() == "asc" else desc(sort_col), desc(QuizAttempt.started_at))
    result = await db.execute(q.offset(offset).limit(limit))
    attempts = result.scalars().all()
    quiz_ids = {a.quiz_id for a in attempts}
    user_ids = {a.user_id for a in attempts if a.user_id is not None}
    quizzes = {quiz.id: quiz for quiz in (await db.execute(select(Quiz).where(Quiz.id.in_(quiz_ids)))).scalars().all()} if quiz_ids else {}
    users = {user.id: user for user in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()} if user_ids else {}

    enriched = []
    for a in attempts:
        quiz = quizzes.get(a.quiz_id)
        user = users.get(a.user_id)
        enriched.append(AttemptOut(
            id=a.id, quiz_id=a.quiz_id, user_id=a.user_id,
            score=a.score, total=a.total, submitted=a.submitted,
            started_at=a.started_at, submitted_at=a.submitted_at,
            quiz_title=quiz.title if quiz else None,
            difficulty=quiz.difficulty.value if quiz else None,
            user=UserOut.model_validate(user) if user else None,
            guest_name=a.guest_name, guest_email=a.guest_email,
            status=a.status, max_points=a.max_points, obtained_points=a.obtained_points,
            percentage=a.percentage, total_points=a.total_points,
            time_spent_seconds=a.time_spent_seconds, attempt_number=a.attempt_number,
            passed=a.passed, auto_submitted=a.auto_submitted,
            correct_answers=a.correct_answers, incorrect_answers=a.incorrect_answers,
            partial_answers=a.partial_answers, unanswered_questions=a.unanswered_questions,
            question_order=a.question_order or [], bookmarks=a.bookmarks or [],
        ))
    return enriched


@router.get("/attempts/export")
async def export_attempts_csv(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
    search: Optional[str] = None,
    status: Optional[str] = None,
    quiz_id: Optional[int] = None,
    user_id: Optional[int] = None,
    passed: Optional[bool] = None,
    sort_by: str = "date",
    sort_order: str = "desc",
):
    q = select(QuizAttempt).join(Quiz, Quiz.id == QuizAttempt.quiz_id).outerjoin(User, User.id == QuizAttempt.user_id)
    if quiz_id is not None:
        q = q.where(QuizAttempt.quiz_id == quiz_id)
    if user_id is not None:
        q = q.where(QuizAttempt.user_id == user_id)
    if status:
        q = q.where(QuizAttempt.status == status)
    if passed is not None:
        q = q.where(QuizAttempt.passed.is_(passed))
    if search:
        like = f"%{search}%"
        q = q.where(or_(
            Quiz.title.ilike(like),
            User.username.ilike(like),
            User.name.ilike(like),
            QuizAttempt.guest_name.ilike(like),
        ))
    sort_map = {
        "name": User.username,
        "score": QuizAttempt.score,
        "percentage": QuizAttempt.percentage,
        "duration": QuizAttempt.time_spent_seconds,
        "date": QuizAttempt.submitted_at,
        "status": QuizAttempt.status,
    }
    sort_col = sort_map.get(sort_by, QuizAttempt.submitted_at)
    q = q.order_by(asc(sort_col) if sort_order.lower() == "asc" else desc(sort_col), desc(QuizAttempt.started_at))
    attempts = (await db.execute(q)).scalars().all()
    quiz_ids = {a.quiz_id for a in attempts}
    user_ids = {a.user_id for a in attempts if a.user_id is not None}
    quizzes = {quiz.id: quiz for quiz in (await db.execute(select(Quiz).where(Quiz.id.in_(quiz_ids)))).scalars().all()} if quiz_ids else {}
    users = {user.id: user for user in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()} if user_ids else {}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Student", "Test", "Attempt", "Score", "Percentage", "Pass/fail", "Duration", "Started time", "Submitted time"])
    for attempt in attempts:
        quiz = quizzes.get(attempt.quiz_id)
        user = users.get(attempt.user_id)
        student = user.name or user.username if user else (attempt.guest_name or "—")
        writer.writerow([
            student,
            quiz.title if quiz else "—",
            attempt.attempt_number,
            attempt.obtained_points if attempt.obtained_points is not None else attempt.score,
            round(attempt.percentage or 0, 2),
            "Pass" if attempt.passed else ("Fail" if attempt.passed is not None else "—"),
            attempt.time_spent_seconds,
            attempt.started_at.isoformat() if attempt.started_at else "",
            attempt.submitted_at.isoformat() if attempt.submitted_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="results-export.csv"'},
    )


@router.get("/live", response_model=List[AttemptOut])
async def live_attempts(db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    """Currently in-progress attempts (started, not yet submitted, quiz not
    ended). Lets the Live Monitor show who's attending right now on load /
    reconnect, instead of only reacting to events broadcast during the
    current browser session."""
    now = now_ist()
    result = await db.execute(
        select(QuizAttempt)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(
            QuizAttempt.submitted == False,
            or_(Quiz.scheduled_end.is_(None), Quiz.scheduled_end >= now),
        )
        .order_by(QuizAttempt.started_at.desc())
    )
    attempts = result.scalars().all()
    quiz_ids = {a.quiz_id for a in attempts}
    user_ids = {a.user_id for a in attempts if a.user_id is not None}
    quizzes = {quiz.id: quiz for quiz in (await db.execute(select(Quiz).where(Quiz.id.in_(quiz_ids)))).scalars().all()} if quiz_ids else {}
    users = {user.id: user for user in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()} if user_ids else {}

    enriched = []
    for a in attempts:
        quiz = quizzes.get(a.quiz_id)
        user = users.get(a.user_id)
        enriched.append(AttemptOut(
            id=a.id, quiz_id=a.quiz_id, user_id=a.user_id,
            score=a.score, total=a.total, submitted=a.submitted,
            started_at=a.started_at, submitted_at=a.submitted_at,
            quiz_title=quiz.title if quiz else None,
            difficulty=quiz.difficulty.value if quiz else None,
            user=UserOut.model_validate(user) if user else None,
            guest_name=a.guest_name, guest_email=a.guest_email,
        ))
    return enriched


# ── Quiz CRUD ─────────────────────────────────────────────
@router.post("/quizzes", response_model=QuizOut, status_code=201)
async def create_quiz(data: QuizCreate, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    quiz = Quiz(**data.model_dump())
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    quiz.question_count = 0
    return quiz


@router.get("/quizzes", response_model=List[QuizOut])
async def list_quizzes(
    difficulty: Optional[str] = None,
    subject: Optional[str] = None,
    quiz_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user)
):
    q = select(Quiz)
    if difficulty:
        q = q.where(Quiz.difficulty == difficulty)
    if subject:
        q = q.where(Quiz.subject == subject)
    if quiz_type:
        q = q.where(Quiz.quiz_type == quiz_type)
    result = await db.execute(q)
    quizzes = result.scalars().all()
    for quiz in quizzes:
        count = (await db.execute(
            select(func.count(Question.id)).where(Question.quiz_id == quiz.id)
        )).scalar()
        quiz.question_count = count
    return quizzes


@router.get("/quizzes/{quiz_id}", response_model=AdminQuizDetail)
async def get_quiz(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user)
):
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )

    quiz = result.scalar_one_or_none()

    if not quiz:
        raise HTTPException(404, "Quiz not found")

    quiz.question_count = len(quiz.questions)

    return quiz


@router.put("/quizzes/{quiz_id}", response_model=QuizOut)
async def update_quiz(quiz_id: int, data: QuizUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(quiz, field, value)
    await db.commit()
    await db.refresh(quiz)
    count = (await db.execute(
        select(func.count(Question.id)).where(Question.quiz_id == quiz_id)
    )).scalar()
    quiz.question_count = count
    return quiz


@router.delete("/quizzes/{quiz_id}", status_code=204)
async def delete_quiz(quiz_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    await db.delete(quiz)
    await db.commit()


# ── Public link ───────────────────────────────────────────
@router.post("/quizzes/{quiz_id}/public-link", response_model=PublicLinkOut)
async def enable_public_link(quiz_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    """Turn on the public shareable link. Generates a slug the first time;
    re-enabling after a prior disable reuses the existing slug."""
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if not quiz.public_slug:
        # Collision odds are negligible at this token length, but check
        # anyway rather than trusting it blindly.
        for _attempt in range(5):
            candidate = secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10]
            exists = (await db.execute(select(Quiz.id).where(Quiz.public_slug == candidate))).scalar_one_or_none()
            if not exists:
                quiz.public_slug = candidate
                break
        else:
            raise HTTPException(500, "Could not generate a unique link, try again")
    quiz.is_public = True
    await db.commit()
    await db.refresh(quiz)
    return PublicLinkOut(is_public=quiz.is_public, public_slug=quiz.public_slug)


@router.delete("/quizzes/{quiz_id}/public-link", response_model=PublicLinkOut)
async def disable_public_link(quiz_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    quiz.is_public = False
    await db.commit()
    await db.refresh(quiz)
    return PublicLinkOut(is_public=quiz.is_public, public_slug=quiz.public_slug)


# ── Question CRUD ─────────────────────────────────────────
@router.post("/quizzes/{quiz_id}/questions", response_model=QuestionOutWithAnswer, status_code=201)
async def add_question(quiz_id: int, data: QuestionCreate, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Quiz not found")
    if not data.text.strip():
        raise HTTPException(400, "Question text is required")
    # Delegates to the per-type validator registry (see
    # app/services/question_types.py) so adding a new question type later
    # doesn't require touching this route.
    validate_question_data(data)
    q = Question(quiz_id=quiz_id, **data.model_dump())
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


@router.put("/questions/{question_id}", response_model=QuestionOutWithAnswer)
async def update_question(question_id: int, data: QuestionCreate, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Question not found")
    if not data.text.strip():
        raise HTTPException(400, "Question text is required")
    validate_question_data(data)
    for field, value in data.model_dump().items():
        setattr(q, field, value)
    await db.commit()
    await db.refresh(q)
    return q


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(question_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Question not found")
    await db.delete(q)
    await db.commit()


@router.get("/quizzes/{quiz_id}/questions", response_model=List[QuestionOutWithAnswer])
async def list_quiz_questions(
    quiz_id: int,
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    question_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
):
    """Question bank view for one quiz, with the filters a teacher needs
    when a quiz has grown to dozens of questions (by category/difficulty/
    type/active status). AdminQuizDetail's `questions` list has no
    filtering, so this exists alongside it rather than replacing it."""
    q = select(Question).where(Question.quiz_id == quiz_id)
    if category:
        q = q.where(Question.category == category)
    if difficulty:
        q = q.where(Question.difficulty == difficulty)
    if question_type:
        q = q.where(Question.question_type == question_type)
    if is_active is not None:
        q = q.where(Question.is_active == is_active)
    result = await db.execute(q.order_by(Question.id))
    return result.scalars().all()


@router.post("/quizzes/{quiz_id}/questions/import-csv")
async def import_quiz_questions_csv(
    quiz_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    quiz = (await db.execute(select(Quiz).where(Quiz.id == quiz_id, Quiz.status != "archived"))).scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    required = {"question", "question_type", "correct_answer", "points"}
    errors = []
    rows = []
    for idx, row in enumerate(reader, start=2):
        missing = [field for field in required if not str(row.get(field, "")).strip()]
        if missing:
            errors.append(_row_error(idx, f"Missing required fields: {', '.join(missing)}"))
            continue
        qtype = str(row.get("question_type", "")).strip()
        try:
            data = QuestionCreate(
                text=str(row.get("question", "")).strip(),
                question_type=qtype,
                options=[str(row.get(f"option_{c}", "")).strip() for c in ("a", "b", "c", "d") if str(row.get(f"option_{c}", "")).strip()],
                correct_option=None,
                correct_options=[],
                partial_scoring=False,
                expected_answers=[],
                case_sensitive=False,
                matching_data={},
                explanation=(row.get("explanation") or "").strip() or None,
                points=float(row.get("points", 1) or 1),
                tags=[],
                category=(row.get("category") or "").strip() or None,
                difficulty=(row.get("difficulty") or "").strip() or None,
                is_active=True,
            )
            if qtype in {"multiple_choice", "true_false"}:
                data.correct_option = _parse_correct_answer(qtype, row.get("correct_answer", ""))
            elif qtype == "multiple_select":
                data.correct_options = _parse_correct_answer(qtype, row.get("correct_answer", ""))
            elif qtype == "short_answer":
                data.expected_answers = _parse_correct_answer(qtype, row.get("correct_answer", ""))
            else:
                raise ValueError("CSV import supports multiple_choice, true_false, multiple_select, and short_answer")
            validate_question_data(data)
            rows.append(data)
        except Exception as exc:
            errors.append(_row_error(idx, str(exc)))

    if errors:
        return {"inserted": 0, "errors": errors}

    created = []
    for data in rows:
        q = Question(quiz_id=quiz_id, **data.model_dump())
        db.add(q)
        created.append(q)
    await db.commit()
    return {"inserted": len(created), "errors": []}


# ── Attempt monitoring ────────────────────────────────────
@router.get("/attempts/{attempt_id}/activity", response_model=List[AttemptActivityOut])
async def attempt_activity(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
):
    events = (await db.execute(
        select(AttemptActivity)
        .where(AttemptActivity.attempt_id == attempt_id)
        .order_by(AttemptActivity.created_at)
    )).scalars().all()
    return [AttemptActivityOut(
        id=event.id,
        attempt_id=event.attempt_id,
        event_type=event.event_type,
        metadata=event.metadata_json,
        created_at=event.created_at,
    ) for event in events]


@router.get("/quizzes/{quiz_id}/attempts", response_model=List[AttemptOut])
async def quiz_attempts(quiz_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    result = await db.execute(select(QuizAttempt).where(QuizAttempt.quiz_id == quiz_id))
    attempts = result.scalars().all()
    # Enrich with quiz info
    quiz_r = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = quiz_r.scalar_one_or_none()
    enriched = []
    for a in attempts:
        user_r = await db.execute(select(User).where(User.id == a.user_id))
        user = user_r.scalar_one_or_none()
        enriched.append(AttemptOut(
            id=a.id, quiz_id=a.quiz_id, user_id=a.user_id,
            score=a.score, total=a.total, submitted=a.submitted,
            started_at=a.started_at, submitted_at=a.submitted_at,
            quiz_title=quiz.title if quiz else None,
            difficulty=quiz.difficulty.value if quiz else None,
            user=UserOut.model_validate(user) if user else None,
            guest_name=a.guest_name, guest_email=a.guest_email,
        ))
    return enriched


# ── Manual grading (essay / free-response questions) ────────────────────────
# Closes the Grading Pending → Graded loop: an attempt lands on
# "grading_pending" the moment it's finalized (submitted / auto_submitted /
# expired) with at least one answered essay question. These two routes are
# the only way out of that state.

@router.get("/grading-queue", response_model=List[AttemptOut])
async def grading_queue(db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    """Every attempt currently awaiting manual grading, across all quizzes."""
    result = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.status == "grading_pending")
        .order_by(QuizAttempt.submitted_at.asc())
    )
    attempts = result.scalars().all()
    enriched = []
    for a in attempts:
        quiz_r = await db.execute(select(Quiz).where(Quiz.id == a.quiz_id))
        quiz = quiz_r.scalar_one_or_none()
        user_r = await db.execute(select(User).where(User.id == a.user_id))
        user = user_r.scalar_one_or_none()
        enriched.append(AttemptOut(
            id=a.id, quiz_id=a.quiz_id, user_id=a.user_id,
            score=a.score, total=a.total, submitted=a.submitted,
            started_at=a.started_at, submitted_at=a.submitted_at,
            quiz_title=quiz.title if quiz else None,
            difficulty=quiz.difficulty.value if quiz else None,
            user=UserOut.model_validate(user) if user else None,
            guest_name=a.guest_name, guest_email=a.guest_email,
            status=a.status, percentage=a.percentage, total_points=a.total_points,
            time_spent_seconds=a.time_spent_seconds, attempt_number=a.attempt_number,
            passed=a.passed, auto_submitted=a.auto_submitted,
        ))
    return enriched


@router.get("/attempts/{attempt_id}/grade", response_model=AttemptGradingOut)
async def get_gradable_answers(attempt_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_admin_user)):
    attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    quiz = (await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one_or_none()
    questions = (await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )).scalars().all()
    user = (await db.execute(select(User).where(User.id == attempt.user_id))).scalar_one_or_none() if attempt.user_id else None

    answers = attempt.answers or {}
    grades = attempt.manual_grades or {}
    items = []
    for q in questions:
        given = answers.get(str(q.id))
        existing = grades.get(str(q.id)) or {}
        auto_grader = q.question_type != "essay"
        correct_answer = None
        if q.question_type in ("multiple_choice", "true_false"):
            correct_answer = q.correct_option
        elif q.question_type == "multiple_select":
            correct_answer = q.correct_options or []
        elif q.question_type == "short_answer":
            correct_answer = q.expected_answers or []
        elif q.question_type == "matching":
            correct_answer = (q.matching_data or {}).get("correct_mapping") or {}
        items.append(GradableAnswerOut(
            question_id=q.id,
            text=q.text,
            question_type=q.question_type,
            points=q.points,
            student_answer=given,
            correct_answer=correct_answer,
            is_auto_graded=auto_grader,
            given_answer=given if q.question_type == "essay" else None,
            current_points=existing.get("points"),
            current_feedback=existing.get("feedback"),
        ))

    return AttemptGradingOut(
        attempt_id=attempt.id,
        quiz_title=quiz.title if quiz else "",
        student=user.username if user else attempt.guest_name,
        status=attempt.status,
        items=items,
    )


@router.get("/attempts/{attempt_id}/result", response_model=AttemptResult)
async def admin_attempt_result(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
):
    attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    quiz = (await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one_or_none()
    questions = (await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )).scalars().all()
    user = (await db.execute(select(User).where(User.id == attempt.user_id))).scalar_one_or_none() if attempt.user_id else None
    return AttemptResult(
        **AttemptOut(
            id=attempt.id, quiz_id=attempt.quiz_id, user_id=attempt.user_id,
            score=attempt.score, total=attempt.total, submitted=attempt.submitted,
            started_at=attempt.started_at, submitted_at=attempt.submitted_at,
            quiz_title=quiz.title if quiz else None,
            difficulty=quiz.difficulty.value if quiz else None,
            user=UserOut.model_validate(user) if user else None,
            guest_name=attempt.guest_name, guest_email=attempt.guest_email,
            status=attempt.status, max_points=attempt.max_points, obtained_points=attempt.obtained_points,
            percentage=attempt.percentage, total_points=attempt.total_points,
            time_spent_seconds=attempt.time_spent_seconds, attempt_number=attempt.attempt_number,
            passed=attempt.passed, auto_submitted=attempt.auto_submitted,
            correct_answers=attempt.correct_answers, incorrect_answers=attempt.incorrect_answers,
            partial_answers=attempt.partial_answers, unanswered_questions=attempt.unanswered_questions,
            question_order=attempt.question_order or [], bookmarks=attempt.bookmarks or [],
        ).model_dump(),
        answers={str(k): v for k, v in (attempt.answers or {}).items()},
        questions=questions,
        essay_pending=0,
    )


@router.get("/quizzes/{quiz_id}/analytics", response_model=QuizAnalyticsOut)
async def quiz_analytics(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
):
    quiz = (await db.execute(select(Quiz).where(Quiz.id == quiz_id))).scalar_one_or_none()
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    questions = (await db.execute(
        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.id)
    )).scalars().all()
    attempts = (await db.execute(
        select(QuizAttempt).where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.submitted.is_(True))
    )).scalars().all()

    attempt_count = len(attempts)
    percentages = [float(a.percentage or 0) for a in attempts]
    times = [int(a.time_spent_seconds or 0) for a in attempts]
    passed = sum(1 for a in attempts if a.passed is True)
    failed = sum(1 for a in attempts if a.passed is False)
    test_summary = AnalyticsTestSummary(
        attempts=attempt_count,
        average_score=round(sum(percentages) / attempt_count, 2) if attempt_count else 0,
        highest_score=round(max(percentages), 2) if percentages else 0,
        lowest_score=round(min(percentages), 2) if percentages else 0,
        pass_percentage=round((passed / attempt_count) * 100, 2) if attempt_count else 0,
        failure_percentage=round((failed / attempt_count) * 100, 2) if attempt_count else 0,
        average_completion_time=round((sum(times) / attempt_count), 2) if attempt_count else 0,
    )

    question_stats = {}
    category_stats = {}
    for q in questions:
        question_stats[q.id] = {
            "question_id": q.id,
            "text": q.text,
            "question_type": q.question_type,
            "category": q.category,
            "attempts": 0,
            "correct": 0,
            "incorrect": 0,
            "partial": 0,
            "unanswered": 0,
            "earned": 0.0,
            "max_points": float(q.points or 0),
        }
        if q.category:
            category_stats.setdefault(q.category, {"category": q.category, "questions": 0, "earned": 0.0, "max_points": 0.0, "correct": 0})
            category_stats[q.category]["questions"] += 1
            category_stats[q.category]["max_points"] += float(q.points or 0)

    for attempt in attempts:
        answers = {int(k): v for k, v in (attempt.answers or {}).items()}
        for q in questions:
            stat = question_stats[q.id]
            given = answers.get(q.id)
            if q.question_type == "essay":
                if given in (None, ""):
                    stat["unanswered"] += 1
                else:
                    stat["attempts"] += 1
                continue
            stat["attempts"] += 1
            is_correct, points, _ = grade_question(q, given)
            stat["earned"] += float(points or 0)
            if given in (None, "", []):
                stat["unanswered"] += 1
            elif is_correct:
                stat["correct"] += 1
            elif points and float(points) > 0:
                stat["partial"] += 1
            else:
                stat["incorrect"] += 1
            if q.category:
                c = category_stats[q.category]
                c["earned"] += float(points or 0)
                if is_correct:
                    c["correct"] += 1

    question_analytics = []
    for q in questions:
        stat = question_stats[q.id]
        attempts_n = stat["attempts"] or attempt_count
        question_analytics.append(AnalyticsQuestionOut(
            question_id=q.id,
            text=q.text,
            question_type=q.question_type,
            category=q.category,
            attempts=attempts_n,
            correct_percentage=round((stat["correct"] / attempts_n) * 100, 2) if attempts_n else 0,
            incorrect_percentage=round((stat["incorrect"] / attempts_n) * 100, 2) if attempts_n else 0,
            partial_percentage=round((stat["partial"] / attempts_n) * 100, 2) if attempts_n else 0,
            unanswered_percentage=round((stat["unanswered"] / attempts_n) * 100, 2) if attempts_n else 0,
        ))

    category_analytics = [
        AnalyticsCategoryOut(
            category=name,
            questions=data["questions"],
            average_score=round((data["earned"] / data["max_points"]) * 100, 2) if data["max_points"] else 0,
            correct_percentage=round((data["correct"] / max(1, attempt_count)) * 100, 2) if attempt_count else 0,
        )
        for name, data in category_stats.items()
    ]
    difficult_questions = sorted(question_analytics, key=lambda item: item.correct_percentage)[:5]

    return QuizAnalyticsOut(
        quiz_id=quiz.id,
        quiz_title=quiz.title,
        test_summary=test_summary,
        question_analytics=question_analytics,
        category_analytics=category_analytics,
        difficult_questions=difficult_questions,
    )


@router.post("/attempts/{attempt_id}/grade", response_model=AttemptOut)
async def grade_attempt(
    attempt_id: int,
    data: AttemptGradeRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_admin_user),
):
    """Record manual points for essay answers and finalize the attempt's
    score. Recomputes the percentage from every question (auto-graded +
    just-graded essays combined) rather than trusting any prior partial
    total, so re-grading is always safe to re-run."""
    attempt = (await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if not attempt.submitted:
        raise HTTPException(400, "Attempt hasn't been submitted yet")
    quiz = (await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one_or_none()
    questions = (await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id).order_by(Question.id)
    )).scalars().all()
    essay_by_id = {q.id: q for q in questions if q.question_type == "essay"}

    manual_grades = dict(attempt.manual_grades or {})
    for g in data.grades:
        q = essay_by_id.get(g.question_id)
        if not q:
            raise HTTPException(400, f"Question {g.question_id} is not an essay question on this test")
        if g.points < 0 or g.points > q.points:
            raise HTTPException(400, f"points for question {g.question_id} must be between 0 and {q.points}")
        manual_grades[str(g.question_id)] = {"points": g.points, "feedback": g.feedback}
    attempt.manual_grades = manual_grades

    # Recompute the whole attempt: autograded points from score_attempt()
    # plus every essay's manual points (only counting essays that have
    # actually been graded so far — an attempt can be partially graded
    # across multiple visits to the queue).
    answers = {int(k): v for k, v in (attempt.answers or {}).items()}
    summary = score_attempt(questions, answers)
    essay_total_points = sum(q.points for q in essay_by_id.values())
    essay_earned = sum(
        (manual_grades.get(str(qid)) or {}).get("points", 0) for qid in essay_by_id
    )
    graded_essay_count = sum(1 for qid in essay_by_id if str(qid) in manual_grades)
    still_pending = sum(
        1 for qid, q in essay_by_id.items()
        if str(qid) not in manual_grades and (attempt.answers or {}).get(str(qid)) not in (None, "")
    )

    total_points = summary["max_points"] + essay_total_points
    attempt.score = summary["correct_answers"] + graded_essay_count
    attempt.max_points = total_points
    attempt.obtained_points = summary["earned_points"] + essay_earned
    attempt.total_points = total_points
    attempt.percentage = round(((summary["earned_points"] + essay_earned) / total_points * 100) if total_points else 0, 2)

    if still_pending:
        attempt.status = "grading_pending"
        attempt.passed = None
    else:
        attempt.status = "graded"
        attempt.passed = attempt.percentage >= (quiz.passing_percentage if quiz else 0)
    attempt.correct_answers = summary["correct_answers"]
    attempt.incorrect_answers = summary["incorrect_answers"]
    attempt.partial_answers = summary["partial_answers"]
    attempt.unanswered_questions = summary["unanswered_questions"]

    await db.commit()
    await db.refresh(attempt)

    quiz_title = quiz.title if quiz else None
    difficulty = quiz.difficulty.value if quiz else None
    return AttemptOut(
        id=attempt.id, quiz_id=attempt.quiz_id, user_id=attempt.user_id,
        score=attempt.score, total=attempt.total, submitted=attempt.submitted,
        started_at=attempt.started_at, submitted_at=attempt.submitted_at,
        quiz_title=quiz_title, difficulty=difficulty,
        guest_name=attempt.guest_name, guest_email=attempt.guest_email,
        status=attempt.status, percentage=attempt.percentage, total_points=attempt.total_points,
        time_spent_seconds=attempt.time_spent_seconds, attempt_number=attempt.attempt_number,
        passed=attempt.passed, auto_submitted=attempt.auto_submitted,
        question_order=attempt.question_order or [], bookmarks=attempt.bookmarks or [],
    )
