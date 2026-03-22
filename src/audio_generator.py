"""Audio generator — converts text to speech using gTTS."""

from __future__ import annotations

import os
import tempfile
from typing import Optional

from .config import VideoConfig, DEFAULT_CONFIG


def _gtts_available() -> bool:
    try:
        from gtts import gTTS  # noqa: F401
        return True
    except ImportError:
        return False


def generate_audio(text: str, cfg: VideoConfig = DEFAULT_CONFIG) -> Optional[str]:
    """
    Convert *text* to a temporary MP3 file using gTTS and return its path.

    Returns ``None`` when audio is disabled in *cfg* or when gTTS is not
    available / network is unavailable.  The caller is responsible for
    deleting the returned temp file after use.
    """
    if not cfg.audio_enabled:
        return None
    if not _gtts_available():
        return None
    try:
        from gtts import gTTS

        tts = gTTS(text=text, lang=cfg.audio_lang, slow=False)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tts.save(tmp.name)
        tmp.close()
        return tmp.name
    except Exception:
        return None


def build_question_narration(question: "MCQQuestion", q_number: int) -> str:
    """Build the TTS script for one question (question + options)."""
    from .models import MCQQuestion

    parts = [f"Question {q_number}.", question.question]
    for label, text in question.labeled_options():
        parts.append(f"{label}: {text}.")
    return "  ".join(parts)


def build_answer_narration(question: "MCQQuestion") -> str:
    """Build the TTS script for the answer reveal."""
    from .models import MCQQuestion

    text = (
        f"The correct answer is {question.correct_label}: {question.correct_text}."
    )
    if question.explanation:
        text += f"  {question.explanation}"
    return text
