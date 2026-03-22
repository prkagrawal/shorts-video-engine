"""Tests for src/video_engine.py — uses a tiny resolution and no audio."""

import os
import tempfile

import pytest

from src.config import VideoConfig
from src.models import MCQQuestion, Quiz
from src.video_engine import _pil_to_clip, generate_video

# Minimal config: tiny resolution, no audio, 1 fps, very short clips
FAST_CFG = VideoConfig(
    width=180,
    height=320,
    fps=1,
    question_duration=0.5,
    think_duration=0.5,
    answer_duration=0.5,
    audio_enabled=False,
)


def _sample_quiz(n: int = 2) -> Quiz:
    questions = [
        MCQQuestion(
            question=f"Question number {i}?",
            options=[f"Opt{i}A", f"Opt{i}B", f"Opt{i}C", f"Opt{i}D"],
            correct_option=i % 4,
        )
        for i in range(1, n + 1)
    ]
    return Quiz(title="Test Quiz", questions=questions)


class TestPilToClip:
    def test_clip_has_correct_size(self):
        from src.slide_generator import make_intro_slide
        img = make_intro_slide("Title", 3, FAST_CFG)
        clip = _pil_to_clip(img, 1.0, 1)
        assert clip.w == FAST_CFG.width
        assert clip.h == FAST_CFG.height

    def test_clip_has_correct_duration(self):
        from src.slide_generator import make_intro_slide
        img = make_intro_slide("Title", 3, FAST_CFG)
        clip = _pil_to_clip(img, 2.0, 1)
        assert clip.duration == pytest.approx(2.0)


class TestGenerateVideo:
    def test_creates_mp4_file(self):
        quiz = _sample_quiz(1)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = os.path.join(tmpdir, "test.mp4")
            result = generate_video(quiz, out, FAST_CFG)
            assert os.path.isfile(result)
            assert result.endswith(".mp4")
            assert os.path.getsize(result) > 0

    def test_output_file_path_returned(self):
        quiz = _sample_quiz(1)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = os.path.join(tmpdir, "test.mp4")
            result = generate_video(quiz, out, FAST_CFG)
            assert os.path.abspath(out) == result

    def test_creates_parent_directory_if_missing(self):
        quiz = _sample_quiz(1)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = os.path.join(tmpdir, "subdir", "nested", "test.mp4")
            result = generate_video(quiz, out, FAST_CFG)
            assert os.path.isfile(result)

    def test_two_questions(self):
        quiz = _sample_quiz(2)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = os.path.join(tmpdir, "test2.mp4")
            result = generate_video(quiz, out, FAST_CFG)
            assert os.path.isfile(result)
            assert os.path.getsize(result) > 0

    def test_quiz_with_explanation(self):
        quiz = Quiz(
            title="Explained Quiz",
            questions=[
                MCQQuestion(
                    question="What is 1+1?",
                    options=["1", "2", "3", "4"],
                    correct_option=1,
                    explanation="Simple addition: 1 plus 1 equals 2.",
                )
            ],
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            out = os.path.join(tmpdir, "explained.mp4")
            result = generate_video(quiz, out, FAST_CFG)
            assert os.path.isfile(result)
