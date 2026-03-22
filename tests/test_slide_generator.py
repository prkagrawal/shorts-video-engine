"""Tests for src/slide_generator.py."""

import pytest
from PIL import Image

from src.config import VideoConfig
from src.models import MCQQuestion, Quiz
from src.slide_generator import (
    make_answer_slide,
    make_intro_slide,
    make_outro_slide,
    make_question_slide,
    make_think_slide,
    slides_for_question,
)

# Use a small resolution for speed
SMALL_CFG = VideoConfig(width=540, height=960, fps=30)


def sample_question(**kwargs) -> MCQQuestion:
    defaults = dict(
        question="What is the capital of France?",
        options=["London", "Berlin", "Paris", "Madrid"],
        correct_option=2,
        explanation="Paris has been the capital since 987 AD.",
    )
    defaults.update(kwargs)
    return MCQQuestion(**defaults)


class TestMakeIntroSlide:
    def test_returns_pil_image(self):
        img = make_intro_slide("My Quiz", 5, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_correct_size(self):
        img = make_intro_slide("My Quiz", 5, SMALL_CFG)
        assert img.size == (540, 960)

    def test_is_rgb(self):
        img = make_intro_slide("My Quiz", 5, SMALL_CFG)
        assert img.mode == "RGB"


class TestMakeQuestionSlide:
    def test_returns_pil_image(self):
        q = sample_question()
        img = make_question_slide(q, 1, 3, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_correct_size(self):
        q = sample_question()
        img = make_question_slide(q, 1, 3, SMALL_CFG)
        assert img.size == (540, 960)

    def test_various_question_numbers(self):
        q = sample_question()
        for i in range(1, 11):
            img = make_question_slide(q, i, 10, SMALL_CFG)
            assert isinstance(img, Image.Image)

    def test_no_explanation_question(self):
        q = sample_question(explanation=None)
        img = make_question_slide(q, 1, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_long_question_text(self):
        q = sample_question(question="This is a very long question that should wrap across multiple lines when rendered on the slide image correctly?")
        img = make_question_slide(q, 1, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)


class TestMakeThinkSlide:
    def test_returns_pil_image(self):
        q = sample_question()
        img = make_think_slide(q, 1, 3, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_is_rgb(self):
        q = sample_question()
        img = make_think_slide(q, 1, 3, SMALL_CFG)
        assert img.mode == "RGB"

    def test_different_from_question_slide(self):
        q = sample_question()
        q_img = make_question_slide(q, 1, 3, SMALL_CFG)
        t_img = make_think_slide(q, 1, 3, SMALL_CFG)
        # Think slide has an overlay, so pixels will differ
        import numpy as np
        assert not (np.array(q_img) == np.array(t_img)).all()


class TestMakeAnswerSlide:
    def test_returns_pil_image(self):
        q = sample_question()
        img = make_answer_slide(q, 1, 3, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_correct_size(self):
        q = sample_question()
        img = make_answer_slide(q, 1, 3, SMALL_CFG)
        assert img.size == (540, 960)

    def test_with_explanation(self):
        q = sample_question(explanation="Paris is in France!")
        img = make_answer_slide(q, 1, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_without_explanation(self):
        q = sample_question(explanation=None)
        img = make_answer_slide(q, 1, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_all_correct_options(self):
        for i in range(4):
            q = sample_question(correct_option=i)
            img = make_answer_slide(q, 1, 1, SMALL_CFG)
            assert isinstance(img, Image.Image)


class TestMakeOutroSlide:
    def test_returns_pil_image(self):
        img = make_outro_slide("My Quiz", SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_correct_size(self):
        img = make_outro_slide("My Quiz", SMALL_CFG)
        assert img.size == (540, 960)


class TestSlidesForQuestion:
    def test_returns_three_slides(self):
        q = sample_question()
        slides = slides_for_question(q, 1, 3, SMALL_CFG)
        assert len(slides) == 3

    def test_all_pil_images(self):
        q = sample_question()
        slides = slides_for_question(q, 1, 3, SMALL_CFG)
        for slide in slides:
            assert isinstance(slide, Image.Image)

    def test_all_correct_size(self):
        q = sample_question()
        slides = slides_for_question(q, 1, 3, SMALL_CFG)
        for slide in slides:
            assert slide.size == (540, 960)
