import unittest
from types import SimpleNamespace

from app.services.question_types import score_attempt


def q(**kwargs):
    return SimpleNamespace(**kwargs)


class QuestionTypeGradingTests(unittest.TestCase):
    def test_multiple_choice_grades_correct_and_wrong(self):
        question = q(id=1, question_type="multiple_choice", points=2, correct_option=1)
        summary = score_attempt([question], {1: 1})
        self.assertEqual(summary["earned_points"], 2)
        self.assertEqual(summary["max_points"], 2)
        self.assertEqual(summary["correct_answers"], 1)
        self.assertEqual(summary["incorrect_answers"], 0)
        self.assertEqual(summary["partial_answers"], 0)
        self.assertEqual(summary["unanswered_questions"], 0)

        wrong = score_attempt([question], {1: 0})
        self.assertEqual(wrong["earned_points"], 0)
        self.assertEqual(wrong["incorrect_answers"], 1)

    def test_true_false_grades_using_same_rule(self):
        question = q(id=1, question_type="true_false", points=1, correct_option=0)
        summary = score_attempt([question], {1: 0})
        self.assertEqual(summary["correct_answers"], 1)
        self.assertEqual(summary["earned_points"], 1)

    def test_multiple_select_full_and_partial_credit(self):
        question = q(
            id=1,
            question_type="multiple_select",
            points=4,
            correct_options=[0, 2],
            partial_scoring=True,
        )
        full = score_attempt([question], {1: [0, 2]})
        self.assertEqual(full["earned_points"], 4)
        self.assertEqual(full["correct_answers"], 1)

        partial = score_attempt([question], {1: [0]})
        self.assertEqual(partial["earned_points"], 2)
        self.assertEqual(partial["partial_answers"], 1)

        wrong = score_attempt([question], {1: [1, 3]})
        self.assertEqual(wrong["earned_points"], 0)
        self.assertEqual(wrong["incorrect_answers"], 1)

    def test_short_answer_is_deterministic_and_case_insensitive_by_default(self):
        question = q(
            id=1,
            question_type="short_answer",
            points=3,
            expected_answers=["FastAPI", "Fast Api"],
            case_sensitive=False,
        )
        summary = score_attempt([question], {1: "fastapi"})
        self.assertEqual(summary["earned_points"], 3)
        self.assertEqual(summary["correct_answers"], 1)

        wrong = score_attempt([question], {1: "Flask"})
        self.assertEqual(wrong["earned_points"], 0)
        self.assertEqual(wrong["incorrect_answers"], 1)

    def test_matching_grades_exact_mapping_only(self):
        question = q(
            id=1,
            question_type="matching",
            points=5,
            matching_data={"correct_mapping": {"0": 1, "1": 0}},
        )
        summary = score_attempt([question], {1: {"0": 1, "1": 0}})
        self.assertEqual(summary["earned_points"], 5)
        self.assertEqual(summary["correct_answers"], 1)

        wrong = score_attempt([question], {1: {"0": 0, "1": 1}})
        self.assertEqual(wrong["earned_points"], 0)
        self.assertEqual(wrong["incorrect_answers"], 1)

    def test_essay_is_not_auto_graded_and_marks_pending(self):
        essay = q(id=1, question_type="essay", points=10)
        summary = score_attempt([essay], {1: "long response"})
        self.assertEqual(summary["earned_points"], 0)
        self.assertEqual(summary["max_points"], 0)
        self.assertEqual(summary["essay_pending"], 1)
        self.assertEqual(summary["gradable_questions"], 0)


if __name__ == "__main__":
    unittest.main()
