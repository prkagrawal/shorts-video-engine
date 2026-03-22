"""Tests for src/models.py."""

import pytest
from pydantic import ValidationError

from src.models import MCQQuestion, Quiz, OPTION_LABELS


# ---------------------------------------------------------------------------
# MCQQuestion tests
# ---------------------------------------------------------------------------

def make_question(**kwargs):
    defaults = dict(
        question="What is 2 + 2?",
        options=["3", "4", "5", "6"],
        correct_option=1,
    )
    defaults.update(kwargs)
    return MCQQuestion(**defaults)


class TestMCQQuestion:
    def test_basic_creation(self):
        q = make_question()
        assert q.question == "What is 2 + 2?"
        assert q.options == ["3", "4", "5", "6"]
        assert q.correct_option == 1

    def test_correct_label(self):
        q = make_question(correct_option=0)
        assert q.correct_label == "A"
        q2 = make_question(correct_option=3)
        assert q2.correct_label == "D"

    def test_correct_text(self):
        q = make_question(correct_option=1)
        assert q.correct_text == "4"

    def test_labeled_options(self):
        q = make_question()
        labeled = q.labeled_options()
        assert labeled == [("A", "3"), ("B", "4"), ("C", "5"), ("D", "6")]

    def test_explanation_optional(self):
        q = make_question()
        assert q.explanation is None
        q2 = make_question(explanation="Because 2+2=4")
        assert q2.explanation == "Because 2+2=4"

    def test_requires_exactly_four_options(self):
        with pytest.raises(ValidationError):
            MCQQuestion(question="Q?", options=["A", "B", "C"], correct_option=0)
        with pytest.raises(ValidationError):
            MCQQuestion(question="Q?", options=["A", "B", "C", "D", "E"], correct_option=0)

    def test_blank_question_rejected(self):
        with pytest.raises(ValidationError):
            MCQQuestion(question="   ", options=["A", "B", "C", "D"], correct_option=0)

    def test_empty_option_rejected(self):
        with pytest.raises(ValidationError):
            MCQQuestion(question="Q?", options=["A", "", "C", "D"], correct_option=0)

    def test_correct_option_bounds(self):
        with pytest.raises(ValidationError):
            make_question(correct_option=-1)
        with pytest.raises(ValidationError):
            make_question(correct_option=4)

    def test_all_correct_options(self):
        for i in range(4):
            q = make_question(correct_option=i)
            assert q.correct_label == OPTION_LABELS[i]


# ---------------------------------------------------------------------------
# Quiz tests
# ---------------------------------------------------------------------------

def make_quiz(**kwargs):
    defaults = dict(
        title="Test Quiz",
        questions=[make_question(question=f"Q{i}?") for i in range(3)],
    )
    defaults.update(kwargs)
    return Quiz(**defaults)


class TestQuiz:
    def test_basic_creation(self):
        q = make_quiz()
        assert q.title == "Test Quiz"
        assert len(q.questions) == 3

    def test_default_title(self):
        q = Quiz(questions=[make_question()])
        assert q.title == "MCQ Quiz"

    def test_default_hashtags(self):
        q = make_quiz()
        assert "#shorts" in q.hashtags
        assert "#quiz" in q.hashtags

    def test_custom_hashtags(self):
        q = make_quiz(hashtags=["#science", "#trivia"])
        assert "#science" in q.hashtags

    def test_min_one_question(self):
        with pytest.raises(ValidationError):
            Quiz(title="Empty", questions=[])

    def test_max_ten_questions(self):
        with pytest.raises(ValidationError):
            Quiz(title="Too many", questions=[make_question(question=f"Q{i}?") for i in range(11)])

    def test_exactly_ten_questions_allowed(self):
        q = Quiz(title="Max", questions=[make_question(question=f"Q{i}?") for i in range(10)])
        assert len(q.questions) == 10

    def test_exactly_one_question_allowed(self):
        q = Quiz(title="Min", questions=[make_question()])
        assert len(q.questions) == 1
