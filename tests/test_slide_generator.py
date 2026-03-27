"""Tests for src/slide_generator.py."""

import pytest
from PIL import Image

from src.config import VideoConfig
from src.models import MCQQuestion, Quiz
from src.slide_generator import (
    _PROMO_BANNER_H,
    make_answer_key_slide,
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

    def test_identical_to_question_slide(self):
        q = sample_question()
        q_img = make_question_slide(q, 1, 3, SMALL_CFG)
        t_img = make_think_slide(q, 1, 3, SMALL_CFG)
        # Think slide now shows the question without overlay
        assert list(q_img.getdata()) == list(t_img.getdata())


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


class TestMakeAnswerKeySlide:
    def test_returns_pil_image(self):
        qs = [sample_question()]
        img = make_answer_key_slide(qs, 0, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_correct_size(self):
        qs = [sample_question()]
        img = make_answer_key_slide(qs, 0, 1, SMALL_CFG)
        assert img.size == (540, 960)

    def test_is_rgb(self):
        qs = [sample_question()]
        img = make_answer_key_slide(qs, 0, 1, SMALL_CFG)
        assert img.mode == "RGB"

    def test_multiple_questions(self):
        qs = [sample_question(question=f"Q{i}?", correct_option=i % 4) for i in range(5)]
        img = make_answer_key_slide(qs, 0, 1, SMALL_CFG)
        assert isinstance(img, Image.Image)

    def test_pagination(self):
        qs = [sample_question(question=f"Q{i}?") for i in range(5)]
        img_p0 = make_answer_key_slide(qs, 0, 2, SMALL_CFG)
        img_p1 = make_answer_key_slide(qs, 1, 2, SMALL_CFG)
        assert isinstance(img_p0, Image.Image)
        assert isinstance(img_p1, Image.Image)


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


class TestDynamicTiming:
    """Tests for VideoConfig.compute_*_duration methods."""

    def test_short_question_gets_minimum_duration(self):
        cfg = VideoConfig()
        dur = cfg.compute_question_duration("Hi?", ["A", "B", "C", "D"])
        assert dur == cfg.min_question_duration

    def test_long_question_gets_capped_duration(self):
        cfg = VideoConfig()
        long_text = " ".join(["word"] * 500)
        dur = cfg.compute_question_duration(long_text, ["A", "B", "C", "D"])
        assert dur == cfg.max_question_duration

    def test_medium_question_between_min_max(self):
        cfg = VideoConfig()
        medium = "What is the primary function of a cellular network base station in modern telecommunications?"
        opts = ["Route calls", "Amplify signals", "Provide wireless coverage", "Store data"]
        dur = cfg.compute_question_duration(medium, opts)
        assert cfg.min_question_duration <= dur <= cfg.max_question_duration

    def test_dynamic_timing_disabled_returns_fixed(self):
        cfg = VideoConfig(dynamic_timing=False, question_duration=5.0)
        dur = cfg.compute_question_duration("Any text?", ["A", "B", "C", "D"])
        assert dur == 5.0

    def test_think_duration_dynamic(self):
        cfg = VideoConfig(dynamic_timing=True)
        assert cfg.compute_think_duration() == 2.0

    def test_think_duration_disabled(self):
        cfg = VideoConfig(dynamic_timing=False, think_duration=3.0)
        assert cfg.compute_think_duration() == 3.0

    def test_answer_duration_with_explanation(self):
        cfg = VideoConfig()
        dur = cfg.compute_answer_duration("Paris", "Paris has been the capital since 987 AD.")
        assert cfg.min_answer_duration <= dur <= cfg.max_answer_duration

    def test_answer_duration_without_explanation(self):
        cfg = VideoConfig()
        dur = cfg.compute_answer_duration("Yes")
        assert dur == cfg.min_answer_duration


class TestBranding:
    """Tests for watermark + promo-banner rendering on slides."""

    BRANDED_CFG = VideoConfig(
        width=540, height=960, fps=30,
        watermark_text="apnatestprep.com",
        banner_enabled=True,
        banner_text="Free Mock | apnatestprep.com",
    )
    UNBRANDED_CFG = VideoConfig(
        width=540, height=960, fps=30,
        watermark_text="",
        banner_enabled=False,
    )

    def test_branded_intro_is_rgb(self):
        img = make_intro_slide("Quiz", 3, self.BRANDED_CFG)
        assert img.mode == "RGB"

    def test_branded_question_is_rgb(self):
        q = sample_question()
        img = make_question_slide(q, 1, 1, self.BRANDED_CFG)
        assert img.mode == "RGB"

    def test_branded_answer_is_rgb(self):
        q = sample_question()
        img = make_answer_slide(q, 1, 1, self.BRANDED_CFG)
        assert img.mode == "RGB"

    def test_branded_outro_is_rgb(self):
        img = make_outro_slide("Quiz", self.BRANDED_CFG)
        assert img.mode == "RGB"

    def test_branded_answer_key_is_rgb(self):
        qs = [sample_question()]
        img = make_answer_key_slide(qs, 0, 1, self.BRANDED_CFG)
        assert img.mode == "RGB"

    def test_unbranded_slides_still_work(self):
        img = make_intro_slide("Quiz", 3, self.UNBRANDED_CFG)
        assert isinstance(img, Image.Image)

    def test_banner_region_is_darker(self):
        """The promo-banner paints a semi-transparent black bar at the bottom."""
        img = make_intro_slide("Quiz", 3, self.BRANDED_CFG)
        # Sample a pixel inside the banner region
        banner_y = self.BRANDED_CFG.height - _PROMO_BANNER_H // 2
        px = img.getpixel((self.BRANDED_CFG.width // 2, banner_y))
        # The banner overlay darkens the gradient; R+G+B should be low.
        # Threshold chosen so even a bright gradient pixel is visibly darkened.
        max_brightness = 300
        assert sum(px[:3]) < max_brightness
