"""Video configuration — dimensions, colours, fonts, timing."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Tuple


# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------

_FONT_SEARCH_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/lato/Lato-Bold.ttf",
    "/usr/share/fonts/truetype/lato/Lato-Regular.ttf",
    "/System/Library/Fonts/Helvetica.ttc",  # macOS fallback
    "C:/Windows/Fonts/arialbd.ttf",  # Windows fallback
]


def _find_font(bold: bool = True) -> str:
    """Return the path to the best available TTF font, or empty string for default."""
    candidates = _FONT_SEARCH_PATHS if bold else _FONT_SEARCH_PATHS[1::2]
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


# ---------------------------------------------------------------------------
# VideoConfig
# ---------------------------------------------------------------------------

COLOUR = Tuple[int, int, int]
RGBA = Tuple[int, int, int, int]


@dataclass
class VideoConfig:
    """All tuneable parameters for the generated video."""

    # --- Resolution (9:16 vertical shorts format) ---
    width: int = 1080
    height: int = 1920
    fps: int = 30

    # --- Background gradient colours (top → bottom) ---
    bg_top: COLOUR = field(default_factory=lambda: (15, 12, 41))
    bg_bottom: COLOUR = field(default_factory=lambda: (48, 43, 99))

    # --- Accent colours ---
    accent_color: COLOUR = field(default_factory=lambda: (108, 92, 231))
    correct_color: COLOUR = field(default_factory=lambda: (0, 184, 148))
    wrong_color: COLOUR = field(default_factory=lambda: (214, 48, 49))
    text_color: COLOUR = field(default_factory=lambda: (255, 255, 255))
    muted_color: COLOUR = field(default_factory=lambda: (178, 190, 195))
    option_bg: RGBA = field(default_factory=lambda: (255, 255, 255, 25))

    # --- Fonts ---
    font_bold: str = field(default_factory=lambda: _find_font(bold=True))
    font_regular: str = field(default_factory=lambda: _find_font(bold=False))

    # --- Font sizes ---
    font_size_title: int = 72
    font_size_question: int = 58
    font_size_option: int = 50
    font_size_label: int = 44
    font_size_small: int = 40

    # --- Timing (seconds per segment) ---
    question_duration: float = 4.0   # question + options display
    think_duration: float = 3.0      # "Think…" pause
    answer_duration: float = 3.5     # answer reveal

    # --- Layout ---
    padding: int = 80                # horizontal margin
    option_radius: int = 24          # rounded-rect corner radius

    # --- Audio ---
    audio_enabled: bool = True       # set False to skip TTS (faster, offline)
    audio_lang: str = "en"

    @property
    def size(self) -> Tuple[int, int]:
        return (self.width, self.height)

    @property
    def total_duration_per_question(self) -> float:
        return self.question_duration + self.think_duration + self.answer_duration


# Shared default instance — callers can override individual fields.
DEFAULT_CONFIG = VideoConfig()
