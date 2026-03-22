"""Data models for the Shorts Video Engine."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


OPTION_LABELS = ["A", "B", "C", "D"]


class MCQQuestion(BaseModel):
    """A single multiple-choice question with four options and one correct answer."""

    question: str = Field(..., min_length=1, description="The question text")
    options: List[str] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Exactly four answer options (A, B, C, D)",
    )
    correct_option: int = Field(
        ...,
        ge=0,
        le=3,
        description="0-based index of the correct option (0=A, 1=B, 2=C, 3=D)",
    )
    explanation: Optional[str] = Field(
        None, description="Optional explanation shown after the answer"
    )

    @field_validator("options")
    @classmethod
    def options_not_empty(cls, v: List[str]) -> List[str]:
        for option in v:
            if not option.strip():
                raise ValueError("Each option must be a non-empty string")
        return v

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be blank")
        return v

    @property
    def correct_label(self) -> str:
        """Letter label (A/B/C/D) for the correct option."""
        return OPTION_LABELS[self.correct_option]

    @property
    def correct_text(self) -> str:
        """Full text of the correct option."""
        return self.options[self.correct_option]

    def labeled_options(self) -> List[tuple[str, str]]:
        """Return list of (label, text) tuples, e.g. [('A', 'Paris'), ...]."""
        return list(zip(OPTION_LABELS, self.options))


class Quiz(BaseModel):
    """A collection of MCQ questions that will become a single shorts video."""

    title: str = Field(
        "MCQ Quiz", description="Title shown at the start of the video"
    )
    questions: List[MCQQuestion] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Between 1 and 10 MCQ questions",
    )
    hashtags: List[str] = Field(
        default_factory=lambda: ["#shorts", "#quiz", "#mcq"],
        description="Hashtags for the video description",
    )

    @model_validator(mode="after")
    def check_question_count(self) -> "Quiz":
        if not (1 <= len(self.questions) <= 10):
            raise ValueError("A quiz must have between 1 and 10 questions")
        return self
