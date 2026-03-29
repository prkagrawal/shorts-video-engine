"""Video engine — assembles slides and audio into an MP4 shorts video."""

from __future__ import annotations

import os
import tempfile
from typing import List, Optional

import numpy as np
from moviepy import AudioFileClip, ImageClip, concatenate_videoclips

from .audio_generator import (
    build_answer_narration,
    build_question_narration,
    generate_audio,
)
from .config import VideoConfig, DEFAULT_CONFIG
from .models import MCQQuestion, Quiz
from .slide_generator import (
    _AK_BANNER_H,
    _AK_BOTTOM_PAD,
    _AK_ROW_H,
    _AK_TOP_MARGIN,
    make_answer_key_slide,
    make_answer_slide,
    make_intro_slide,
    make_outro_slide,
    make_question_slide,
    make_think_slide,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _pil_to_clip(pil_img, duration: float, fps: int) -> ImageClip:
    """Convert a PIL Image to a MoviePy ImageClip of the given duration."""
    arr = np.array(pil_img.convert("RGB"))
    return ImageClip(arr, duration=duration).with_fps(fps)


def _audio_clip_for_text(
    text: str,
    target_duration: float,
    cfg: VideoConfig,
) -> Optional[AudioFileClip]:
    """Generate a TTS audio clip for *text*, capped to *target_duration*."""
    audio_path = generate_audio(text, cfg)
    if not audio_path:
        return None
    try:
        clip = AudioFileClip(audio_path)
        if clip.duration > target_duration:
            clip = clip.subclipped(0, target_duration)
        return clip
    except Exception:
        return None
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass


def _build_question_clips(
    question: MCQQuestion,
    q_number: int,
    total: int,
    cfg: VideoConfig,
) -> List[ImageClip]:
    """Build the three video clips (question, think, answer) for one MCQ."""
    clips = []

    # Compute per-question dynamic durations
    q_dur = cfg.compute_question_duration(question.question, question.options)
    t_dur = cfg.compute_think_duration()
    a_dur = cfg.compute_answer_duration(
        question.correct_text,
        question.explanation,
    )

    # 1. Question + options slide
    q_img = make_question_slide(question, q_number, total, cfg)
    q_clip = _pil_to_clip(q_img, q_dur, cfg.fps)
    if cfg.audio_enabled:
        narration = build_question_narration(question, q_number)
        audio = _audio_clip_for_text(narration, q_dur, cfg)
        if audio:
            q_clip = q_clip.with_audio(audio)
    clips.append(q_clip)

    # 2. Think slide (silent pause)
    t_img = make_think_slide(question, q_number, total, cfg)
    t_clip = _pil_to_clip(t_img, t_dur, cfg.fps)
    clips.append(t_clip)

    # 3. Answer slide
    a_img = make_answer_slide(question, q_number, total, cfg)
    a_clip = _pil_to_clip(a_img, a_dur, cfg.fps)
    if cfg.audio_enabled:
        narration = build_answer_narration(question)
        audio = _audio_clip_for_text(narration, a_dur, cfg)
        if audio:
            a_clip = a_clip.with_audio(audio)
    clips.append(a_clip)

    return clips


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_video(
    quiz: Quiz,
    output_path: str,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> str:
    """
    Generate a shorts-format MP4 video from *quiz* and write it to *output_path*.

    Returns the absolute path to the written file.
    """
    clips: List[ImageClip] = []

    # Intro
    intro_img = make_intro_slide(quiz.title, len(quiz.questions), cfg)
    intro_clip = _pil_to_clip(intro_img, cfg.question_duration, cfg.fps)
    clips.append(intro_clip)

    # One segment per question
    for idx, question in enumerate(quiz.questions, start=1):
        q_clips = _build_question_clips(question, idx, len(quiz.questions), cfg)
        clips.extend(q_clips)

    # Answer key
    start_y = _AK_BANNER_H + _AK_TOP_MARGIN
    max_per_page = max(1, (cfg.height - start_y - _AK_BOTTOM_PAD) // _AK_ROW_H)
    total_pages = -(-len(quiz.questions) // max_per_page)  # ceil division
    for p in range(total_pages):
        ak_img = make_answer_key_slide(quiz.questions, p, total_pages, cfg)
        ak_clip = _pil_to_clip(ak_img, cfg.answer_duration, cfg.fps)
        clips.append(ak_clip)

    # Outro
    outro_img = make_outro_slide(quiz.title, cfg)
    outro_clip = _pil_to_clip(outro_img, cfg.question_duration, cfg.fps)
    clips.append(outro_clip)

    # Concatenate all clips
    final = concatenate_videoclips(clips, method="compose")

    # Write output
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    final.write_videofile(
        output_path,
        fps=cfg.fps,
        codec="libx264",
        audio_codec="aac",
        logger=None,
        ffmpeg_params=[
            "-g", str(cfg.fps),
            "-keyint_min", str(cfg.fps),
            "-sc_threshold", "0",
            "-movflags", "+faststart",
        ],
    )

    return os.path.abspath(output_path)
