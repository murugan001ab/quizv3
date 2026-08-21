"""Question-type validation and grading, centralized behind a small
registry so the Question Management module stays extensible.

To add a new question type later:
  1. Add it to QuestionType in app/models/quiz.py
  2. Write validate_<type>(data) and grade_<type>(question, given)
  3. Register both functions in VALIDATORS / GRADERS below

Nothing in routers/admin.py, routers/user.py, or routers/public.py needs to
change to support a new type — they all go through validate_question_data()
and score_attempt() in this file.
"""
from typing import Any, Dict, Tuple

from fastapi import HTTPException

from app.models.quiz import Question


# ── Validation (used on create/update) ──────────────────────────────────────

def _require_options(data, min_count: int = 2):
    if len(data.options) < min_count:
        raise HTTPException(400, f"At least {min_count} options are required")
    if any(not o.strip() for o in data.options):
        raise HTTPException(400, "Options cannot be empty")


def validate_multiple_choice(data):
    _require_options(data, 2)
    if data.correct_option is None or not (0 <= data.correct_option < len(data.options)):
        raise HTTPException(400, "correct_option must reference a valid option index")


def validate_true_false(data):
    # True/False questions always have exactly these two options,
    # regardless of what the client sent.
    data.options = ["True", "False"]
    if data.correct_option not in (0, 1):
        raise HTTPException(400, "correct_option must be 0 (True) or 1 (False)")


def validate_multiple_select(data):
    _require_options(data, 2)
    if not data.correct_options:
        raise HTTPException(400, "At least one correct option is required")
    if any(not (0 <= i < len(data.options)) for i in data.correct_options):
        raise HTTPException(400, "correct_options must reference valid option indices")
    data.correct_options = sorted(set(data.correct_options))


def validate_short_answer(data):
    if not data.expected_answers or any(not a.strip() for a in data.expected_answers):
        raise HTTPException(400, "At least one non-empty expected answer is required")


def validate_essay(data):
    # Free-text response, always manually graded — nothing to validate.
    return


def validate_matching(data):
    left = (data.matching_data or {}).get("left") or []
    right = (data.matching_data or {}).get("right") or []
    mapping = (data.matching_data or {}).get("correct_mapping") or {}
    if len(left) < 2 or len(right) < 2:
        raise HTTPException(400, "Matching needs at least 2 left items and 2 right options")
    if any(not str(item).strip() for item in left) or any(not str(item).strip() for item in right):
        raise HTTPException(400, "Matching items cannot be empty")
    if len(mapping) != len(left):
        raise HTTPException(400, "Every left item needs a correct mapping to a right option")
    for left_idx, right_idx in mapping.items():
        if not (str(left_idx).isdigit() and 0 <= int(left_idx) < len(left)):
            raise HTTPException(400, "correct_mapping keys must be valid left-item indices")
        if not (isinstance(right_idx, int) and 0 <= right_idx < len(right)):
            raise HTTPException(400, "correct_mapping values must be valid right-option indices")


VALIDATORS = {
    "multiple_choice": validate_multiple_choice,
    "true_false": validate_true_false,
    "multiple_select": validate_multiple_select,
    "short_answer": validate_short_answer,
    "essay": validate_essay,
    "matching": validate_matching,
}


def validate_question_data(data) -> None:
    """data is a QuestionCreate — validated (and, for true_false,
    normalized) in place. Raises HTTPException(400) on any problem."""
    validator = VALIDATORS.get(data.question_type)
    if not validator:
        raise HTTPException(400, f"Unknown question type: {data.question_type}")
    validator(data)


# ── Grading (used at submit time) ───────────────────────────────────────────
# Each grader returns (is_correct, earned_points, autograded).
# autograded=False marks types (currently only essay) that need a human —
# score_attempt() below excludes those from the automatic percentage.

def grade_multiple_choice(question: Question, given: Any) -> Tuple[bool, float, bool]:
    correct = given is not None and given == question.correct_option
    return correct, (question.points if correct else 0.0), True


def grade_true_false(question: Question, given: Any) -> Tuple[bool, float, bool]:
    return grade_multiple_choice(question, given)


def grade_multiple_select(question: Question, given: Any) -> Tuple[bool, float, bool]:
    if not isinstance(given, list):
        return False, 0.0, True
    given_set = set(given)
    correct_set = set(question.correct_options or [])
    if given_set == correct_set:
        return True, question.points, True
    if question.partial_scoring and correct_set:
        right = len(given_set & correct_set)
        wrong = len(given_set - correct_set)
        fraction = max(0, right - wrong) / len(correct_set)
        return False, round(question.points * fraction, 2), True
    return False, 0.0, True


def grade_short_answer(question: Question, given: Any) -> Tuple[bool, float, bool]:
    if not isinstance(given, str) or not given.strip():
        return False, 0.0, True
    candidate = given if question.case_sensitive else given.strip().lower()
    for expected in (question.expected_answers or []):
        target = expected if question.case_sensitive else expected.strip().lower()
        if candidate == target:
            return True, question.points, True
    return False, 0.0, True


def grade_essay(question: Question, given: Any) -> Tuple[bool, float, bool]:
    # Always manual — never contributes to the automatic score.
    return False, 0.0, False


def grade_matching(question: Question, given: Any) -> Tuple[bool, float, bool]:
    mapping = (question.matching_data or {}).get("correct_mapping") or {}
    if not isinstance(given, dict) or not mapping:
        return False, 0.0, True
    given_norm = {str(k): v for k, v in given.items()}
    mapping_norm = {str(k): v for k, v in mapping.items()}
    if given_norm == mapping_norm:
        return True, question.points, True
    return False, 0.0, True


GRADERS = {
    "multiple_choice": grade_multiple_choice,
    "true_false": grade_true_false,
    "multiple_select": grade_multiple_select,
    "short_answer": grade_short_answer,
    "essay": grade_essay,
    "matching": grade_matching,
}


def grade_question(question: Question, given: Any) -> Tuple[bool, float, bool]:
    grader = GRADERS.get(question.question_type, grade_multiple_choice)
    return grader(question, given)


def score_attempt(questions, answers: Dict[int, Any]):
    """Grade every question in one pass.

    Returns a deterministic summary derived only from stored answers and
    question definitions. Essay questions are excluded from auto-final
    grading and are counted separately so they can remain in
    "grading_pending" until a teacher scores them.
    """
    summary = {
        "earned_points": 0.0,
        "max_points": 0.0,
        "correct_answers": 0,
        "incorrect_answers": 0,
        "partial_answers": 0,
        "unanswered_questions": 0,
        "essay_pending": 0,
        "gradable_questions": 0,
    }
    for q in questions:
        given = answers.get(q.id)
        is_correct, points, autograded = grade_question(q, given)
        if not autograded:
            if given not in (None, ""):
                summary["essay_pending"] += 1
            continue
        summary["gradable_questions"] += 1
        summary["max_points"] += float(q.points or 0)
        summary["earned_points"] += float(points or 0)
        if given in (None, "", []):
            summary["unanswered_questions"] += 1
        elif is_correct:
            summary["correct_answers"] += 1
        elif points and float(points) > 0:
            summary["partial_answers"] += 1
        else:
            summary["incorrect_answers"] += 1
    return summary
