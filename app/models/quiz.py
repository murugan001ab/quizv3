from datetime import datetime
from zoneinfo import ZoneInfo
import enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Enum as SAEnum,
    Text,
    JSON,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from app.database import Base


# Indian Standard Time
IST = ZoneInfo("Asia/Kolkata")


def now_ist():
    # Return IST without timezone info
    return datetime.now(IST).replace(tzinfo=None)


class DifficultyLevel(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class QuizType(str, enum.Enum):
    scheduled = "scheduled"  # self-paced, browsable/takeable by users within scheduled_start/scheduled_end
    live = "live"  # only ever run through a hosted Live Quiz channel — never shown to users directly


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    true_false = "true_false"
    multiple_select = "multiple_select"
    short_answer = "short_answer"
    essay = "essay"
    matching = "matching"


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)

    difficulty = Column(SAEnum(DifficultyLevel), nullable=False)
    subject = Column(String, nullable=False)
    topic = Column(String, nullable=False)

    # Plain string (not a native Postgres enum) so existing databases can pick
    # it up with a simple ADD COLUMN — see init_db() in database.py.
    quiz_type = Column(String, nullable=False, default=QuizType.scheduled.value, server_default=QuizType.scheduled.value)

    scheduled_start = Column(DateTime, nullable=True)
    scheduled_end = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True)

    # Additive ClassMarker-style settings. Existing rows retain safe defaults.
    instructions = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="draft", server_default="draft")
    passing_percentage = Column(Float, nullable=False, default=0, server_default="0")
    max_attempts = Column(Integer, nullable=False, default=1, server_default="1")
    allow_retakes = Column(Boolean, nullable=False, default=False, server_default="false")
    randomize_questions = Column(Boolean, nullable=False, default=False, server_default="false")
    randomize_answers = Column(Boolean, nullable=False, default=False, server_default="false")
    random_question_count = Column(Integer, nullable=True)
    random_question_categories = Column(JSON, nullable=False, default=list, server_default="[]")
    show_results = Column(Boolean, nullable=False, default=True, server_default="true")
    show_answers = Column(Boolean, nullable=False, default=False, server_default="false")
    instant_feedback = Column(Boolean, nullable=False, default=False, server_default="false")
    allow_navigation = Column(Boolean, nullable=False, default=True, server_default="true")
    allow_bookmarking = Column(Boolean, nullable=False, default=True, server_default="true")
    allow_question_review = Column(Boolean, nullable=False, default=True, server_default="true")
    security_settings = Column(JSON, nullable=False, default=dict, server_default="{}")

    # Public shareable link — anyone with the link can take the quiz
    # without an account. public_slug is only ever set once (kept even
    # after disabling) so re-enabling the link reuses the same URL.
    is_public = Column(Boolean, nullable=False, default=False, server_default="false")
    public_slug = Column(String, nullable=True, unique=True)

    created_at = Column(DateTime, default=now_ist)

    questions = relationship(
        "Question",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="Question.id",
    )

    attempts = relationship(
        "QuizAttempt",
        back_populates="quiz",
    )


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)

    quiz_id = Column(
        Integer,
        ForeignKey("quizzes.id"),
        nullable=False,
    )

    text = Column(Text, nullable=False)

    # MCQ / true-false: the option list and the single correct index.
    # Nullable because multiple_select/short_answer/essay/matching don't
    # use a single correct_option index — see the type-specific columns
    # below instead.
    options = Column(JSON, nullable=False, default=list, server_default="[]")

    correct_option = Column(Integer, nullable=True)

    explanation = Column(Text)

    question_type = Column(String, nullable=False, default=QuestionType.multiple_choice.value, server_default=QuestionType.multiple_choice.value)
    points = Column(Float, nullable=False, default=1, server_default="1")
    tags = Column(JSON, nullable=False, default=list, server_default="[]")
    expected_answers = Column(JSON, nullable=False, default=list, server_default="[]")
    case_sensitive = Column(Boolean, nullable=False, default=False, server_default="false")
    correct_feedback = Column(Text, nullable=True)
    incorrect_feedback = Column(Text, nullable=True)

    # ── Question Management module additions (additive, all optional) ──
    category = Column(String, nullable=True)
    # Per-question difficulty override; falls back to the quiz's difficulty
    # in the UI when unset. Deliberately a free string (not the quiz-level
    # DifficultyLevel enum) so it stays additive/non-breaking.
    difficulty = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    # multiple_select: indices of every correct option (options column
    # supplies the choices themselves, same as MCQ).
    correct_options = Column(JSON, nullable=False, default=list, server_default="[]")
    # multiple_select: award partial credit for a partially-correct
    # selection instead of all-or-nothing.
    partial_scoring = Column(Boolean, nullable=False, default=False, server_default="false")

    # matching: {"left": [...], "right": [...], "correct_mapping": {"0": 2, ...}}
    # kept as a single JSON blob (rather than three columns) so the shape
    # can evolve without another migration.
    matching_data = Column(JSON, nullable=False, default=dict, server_default="{}")

    year = Column(Text)

    quiz = relationship(
        "Quiz",
        back_populates="questions",
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    # Set only for attempts taken through a public link (no account).
    guest_name = Column(String, nullable=True)
    guest_email = Column(String, nullable=True)

    quiz_id = Column(
        Integer,
        ForeignKey("quizzes.id"),
        nullable=False,
    )

    answers = Column(JSON, default=dict)

    score = Column(Integer, default=0)

    total = Column(Integer, default=0)

    submitted = Column(Boolean, default=False)

    started_at = Column(DateTime, default=now_ist)

    submitted_at = Column(DateTime, nullable=True)

    status = Column(String, nullable=False, default="in_progress", server_default="in_progress")
    max_points = Column(Float, nullable=False, default=0, server_default="0")
    obtained_points = Column(Float, nullable=False, default=0, server_default="0")
    percentage = Column(Float, nullable=False, default=0, server_default="0")
    total_points = Column(Float, nullable=False, default=0, server_default="0")
    time_spent_seconds = Column(Integer, nullable=False, default=0, server_default="0")
    attempt_number = Column(Integer, nullable=False, default=1, server_default="1")
    passed = Column(Boolean, nullable=True)
    auto_submitted = Column(Boolean, nullable=False, default=False, server_default="false")
    correct_answers = Column(Integer, nullable=False, default=0, server_default="0")
    incorrect_answers = Column(Integer, nullable=False, default=0, server_default="0")
    partial_answers = Column(Integer, nullable=False, default=0, server_default="0")
    unanswered_questions = Column(Integer, nullable=False, default=0, server_default="0")
    # Ordered ids and bookmarks belong to the attempt, preventing a refresh
    # from creating a different exam.
    question_order = Column(JSON, nullable=False, default=list, server_default="[]")
    bookmarks = Column(JSON, nullable=False, default=list, server_default="[]")

    # Manual grades for non-autograded questions (currently: essay).
    # Shape: {"<question_id>": {"points": 4.5, "feedback": "..."}}
    # Populated by an admin via POST /admin/attempts/{id}/grade once the
    # attempt's status is "grading_pending"; moves status to "graded".
    manual_grades = Column(JSON, nullable=False, default=dict, server_default="{}")

    user = relationship(
        "User",
        back_populates="attempts",
    )

    quiz = relationship(
        "Quiz",
        back_populates="attempts",
    )

    activity_events = relationship(
        "AttemptActivity",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="AttemptActivity.created_at",
    )

    __table_args__ = (
        # Prevent multiple unsubmitted attempts for the same user+quiz.
        # We can't use a simple UNIQUE(user_id, quiz_id) because a user
        # is allowed to have multiple *submitted* attempts (retakes).
        # The partial unique index below only enforces uniqueness while
        # submitted=False, which is exactly what we need.
        # NOTE: create_all won't create this index on an already-existing
        # table; the raw SQL migration in database.py handles that case.
        Index(
            "uq_quiz_attempt_active",
            "user_id",
            "quiz_id",
            unique=True,
            postgresql_where=Column("submitted") == False,  # noqa: E712
        ),
    )


class AttemptActivity(Base):
    """Non-invasive audit events recorded during an exam attempt."""

    __tablename__ = "attempt_activities"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    metadata_json = Column(JSON, nullable=False, default=dict, server_default="{}")
    created_at = Column(DateTime, default=now_ist, nullable=False, index=True)

    attempt = relationship("QuizAttempt", back_populates="activity_events")


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=now_ist, nullable=False)

    group = relationship("Group", back_populates="members")
    student = relationship("User", back_populates="group_memberships")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    invite_token = Column(String, nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=now_ist, nullable=False)
    updated_at = Column(DateTime, default=now_ist, nullable=False)

    owner = relationship("User", back_populates="owned_groups")
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")


class TestAssignment(Base):
    __tablename__ = "test_assignments"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True, index=True)
    assigned_at = Column(DateTime, default=now_ist, nullable=False)
    due_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="assigned", server_default="assigned")

    owner = relationship("User", foreign_keys=[owner_id])
    quiz = relationship("Quiz")
    student = relationship("User", foreign_keys=[student_id])
    group = relationship("Group")
