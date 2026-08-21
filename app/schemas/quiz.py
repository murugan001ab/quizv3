from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.quiz import DifficultyLevel, QuizType
from app.schemas.user import UserOut

class QuestionCreate(BaseModel):
    text: str
    question_type: str = "multiple_choice"

    # multiple_choice / true_false
    options: List[str] = Field(default_factory=list)
    correct_option: Optional[int] = None

    # multiple_select
    correct_options: List[int] = Field(default_factory=list)
    partial_scoring: bool = False

    # short_answer
    expected_answers: List[str] = Field(default_factory=list)
    case_sensitive: bool = False

    # matching — {"left": [...], "right": [...], "correct_mapping": {"0": 2, ...}}
    matching_data: Dict[str, Any] = Field(default_factory=dict)

    explanation: Optional[str] = None
    points: float = 1
    tags: List[str] = Field(default_factory=list)
    correct_feedback: Optional[str] = None
    incorrect_feedback: Optional[str] = None

    # Question Management module additions
    category: Optional[str] = None
    difficulty: Optional[str] = None
    is_active: bool = True


class QuestionOut(BaseModel):
    id: int
    quiz_id: int
    text: str
    question_type: str = "multiple_choice"
    options: List[str] = Field(default_factory=list)
    correct_options: List[int] = Field(default_factory=list)
    partial_scoring: bool = False
    expected_answers: List[str] = Field(default_factory=list)
    case_sensitive: bool = False
    matching_data: Dict[str, Any] = Field(default_factory=dict)
    explanation: Optional[str]
    points: float = 1
    tags: List[str] = Field(default_factory=list)
    correct_feedback: Optional[str] = None
    incorrect_feedback: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class QuestionOutWithAnswer(QuestionOut):
    correct_option: Optional[int] = None


class QuizCreate(BaseModel):
    title: str
    description: Optional[str] = None
    difficulty: DifficultyLevel
    subject: str
    topic: str
    quiz_type: QuizType = QuizType.scheduled
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: str = "draft"
    passing_percentage: float = 0
    max_attempts: int = 1
    allow_retakes: bool = False
    randomize_questions: bool = False
    randomize_answers: bool = False
    random_question_count: Optional[int] = None
    random_question_categories: List[str] = Field(default_factory=list)
    show_results: bool = True
    show_answers: bool = False
    instant_feedback: bool = False
    allow_navigation: bool = True
    allow_bookmarking: bool = True
    allow_question_review: bool = True
    security_settings: Dict[str, Any] = Field(default_factory=dict)


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[DifficultyLevel] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    quiz_type: Optional[QuizType] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    is_active: Optional[bool] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    passing_percentage: Optional[float] = None
    max_attempts: Optional[int] = None
    allow_retakes: Optional[bool] = None
    randomize_questions: Optional[bool] = None
    randomize_answers: Optional[bool] = None
    random_question_count: Optional[int] = None
    random_question_categories: Optional[List[str]] = None
    show_results: Optional[bool] = None
    show_answers: Optional[bool] = None
    instant_feedback: Optional[bool] = None
    allow_navigation: Optional[bool] = None
    allow_bookmarking: Optional[bool] = None
    allow_question_review: Optional[bool] = None
    security_settings: Optional[Dict[str, Any]] = None


class QuizOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    difficulty: DifficultyLevel
    subject: str
    topic: str
    quiz_type: QuizType
    scheduled_start: Optional[datetime]
    scheduled_end: Optional[datetime]
    is_active: bool
    created_at: datetime
    question_count: int = 0
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: str = "draft"
    passing_percentage: float = 0
    max_attempts: int = 1
    allow_retakes: bool = False
    randomize_questions: bool = False
    randomize_answers: bool = False
    random_question_count: Optional[int] = None
    random_question_categories: List[str] = Field(default_factory=list)
    show_results: bool = True
    show_answers: bool = False
    instant_feedback: bool = False
    allow_navigation: bool = True
    allow_bookmarking: bool = True
    allow_question_review: bool = True
    security_settings: Dict[str, Any] = {}
    is_public: bool = False
    public_slug: Optional[str] = None

    class Config:
        from_attributes = True


class AdminQuizDetail(QuizOut):
    questions: List[QuestionOutWithAnswer] = Field(default_factory=list)

class QuizDetail(QuizOut):
    questions: List[QuestionOut] = Field(default_factory=list)


class PublicLinkOut(BaseModel):
    is_public: bool
    public_slug: Optional[str] = None


class PublicStartRequest(BaseModel):
    name: str
    email: Optional[str] = None


class SubmitAnswers(BaseModel):
    # int for multiple_choice/true_false, List[int] for multiple_select,
    # str for short_answer/essay, Dict[str,int] for matching.
    answers: Dict[int, Any]


class AttemptProgressUpdate(BaseModel):
    answers: Dict[int, Any] = Field(default_factory=dict)
    bookmarks: List[int] = Field(default_factory=list)


class AttemptActivityCreate(BaseModel):
    event_type: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AttemptActivityOut(BaseModel):
    id: int
    attempt_id: int
    event_type: str
    metadata: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class AttemptOut(BaseModel):
    id: int
    quiz_id: int
    user_id: Optional[int] = None
    score: int
    total: int
    submitted: bool
    started_at: datetime
    submitted_at: Optional[datetime]
    quiz_title: Optional[str] = None
    difficulty: Optional[str] = None
    user: Optional[UserOut] = None
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    status: str = "in_progress"
    max_points: float = 0
    obtained_points: float = 0
    percentage: float = 0
    total_points: float = 0
    time_spent_seconds: int = 0
    attempt_number: int = 1
    passed: Optional[bool] = None
    auto_submitted: bool = False
    correct_answers: int = 0
    incorrect_answers: int = 0
    partial_answers: int = 0
    unanswered_questions: int = 0
    question_order: List[int] = Field(default_factory=list)
    bookmarks: List[int] = Field(default_factory=list)

    class Config:
        from_attributes = True


class AttemptResult(AttemptOut):
    answers: Dict[str, Any]   # JSON always serialises dict keys as strings
    questions: List[QuestionOutWithAnswer] = Field(default_factory=list)
    essay_pending: int = 0


class PublicAttemptOut(AttemptOut):
    attempt_token: str


class AttemptStartOut(AttemptOut):
    questions: List[QuestionOut] = Field(default_factory=list)


# ── Test Instructions (pre-start summary) ───────────────────────────────────

class TestInstructionsOut(BaseModel):
    """Everything the Dashboard → Available Tests → Test Instructions screen
    needs, without creating an attempt or exposing answer keys."""
    id: int
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    subject: str
    topic: str
    difficulty: DifficultyLevel
    question_count: int = 0
    duration_minutes: Optional[int] = None
    passing_percentage: float = 0
    max_attempts: int = 1
    allow_retakes: bool = False
    attempts_used: int = 0
    attempts_remaining: int = 0
    allow_bookmarking: bool = True
    allow_navigation: bool = True
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    can_start: bool = True
    block_reason: Optional[str] = None
    has_in_progress_attempt: bool = False
    in_progress_attempt_id: Optional[int] = None


# ── Manual grading (essay / free-response questions) ────────────────────────

class QuestionGradeIn(BaseModel):
    question_id: int
    points: float
    feedback: Optional[str] = None


class AttemptGradeRequest(BaseModel):
    grades: List[QuestionGradeIn]


class GradableAnswerOut(BaseModel):
    question_id: int
    text: str
    question_type: str
    points: float
    student_answer: Optional[Any] = None
    correct_answer: Optional[Any] = None
    is_auto_graded: bool = False
    given_answer: Optional[str] = None
    current_points: Optional[float] = None
    current_feedback: Optional[str] = None


class AttemptGradingOut(BaseModel):
    attempt_id: int
    quiz_title: str
    student: Optional[str] = None
    status: str
    items: List[GradableAnswerOut] = Field(default_factory=list)


class AnalyticsTestSummary(BaseModel):
    attempts: int = 0
    average_score: float = 0
    highest_score: float = 0
    lowest_score: float = 0
    pass_percentage: float = 0
    failure_percentage: float = 0
    average_completion_time: float = 0


class AnalyticsQuestionOut(BaseModel):
    question_id: int
    text: str
    question_type: str
    category: Optional[str] = None
    attempts: int = 0
    correct_percentage: float = 0
    incorrect_percentage: float = 0
    partial_percentage: float = 0
    unanswered_percentage: float = 0


class AnalyticsCategoryOut(BaseModel):
    category: str
    questions: int = 0
    average_score: float = 0
    correct_percentage: float = 0


class QuizAnalyticsOut(BaseModel):
    quiz_id: int
    quiz_title: str
    test_summary: AnalyticsTestSummary
    question_analytics: List[AnalyticsQuestionOut] = Field(default_factory=list)
    category_analytics: List[AnalyticsCategoryOut] = Field(default_factory=list)
    difficult_questions: List[AnalyticsQuestionOut] = Field(default_factory=list)


class GroupMemberOut(BaseModel):
    student_id: int
    username: str
    name: Optional[str] = None
    email: Optional[str] = None


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class GroupOut(BaseModel):
    id: int
    owner_id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    members: List[GroupMemberOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class GroupMemberAddRequest(BaseModel):
    student_id: int


class GroupInviteOut(BaseModel):
    group_id: int
    group_name: str
    description: Optional[str] = None
    owner_name: Optional[str] = None
    invite_token: str
    member_count: int = 0


class GroupInviteAction(BaseModel):
    action: str


class GroupInviteJoinRequest(BaseModel):
    invite_token: str


class TestAssignmentCreate(BaseModel):
    quiz_id: int
    student_id: Optional[int] = None
    group_id: Optional[int] = None
    due_at: Optional[datetime] = None


class TestAssignmentOut(BaseModel):
    id: int
    owner_id: int
    quiz_id: int
    quiz_title: str
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    assigned_at: datetime
    due_at: Optional[datetime] = None
    status: str = "assigned"


class TestAssignmentProgressOut(BaseModel):
    assignment_id: int
    quiz_id: int
    quiz_title: str
    status: str
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    group_name: Optional[str] = None
    due_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    attempt_id: Optional[int] = None
