"""Slide generator — creates PIL Image frames for each quiz segment."""

from __future__ import annotations

import textwrap
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont

from .config import VideoConfig, DEFAULT_CONFIG, COLOUR
from .models import MCQQuestion, OPTION_LABELS


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a TTF font; fall back to PIL's built-in default scaled font."""
    if path:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            pass
    return ImageFont.load_default(size=size)


def _gradient_background(cfg: VideoConfig) -> Image.Image:
    """Create a vertical linear gradient background image."""
    img = Image.new("RGB", cfg.size)
    draw = ImageDraw.Draw(img)
    r1, g1, b1 = cfg.bg_top
    r2, g2, b2 = cfg.bg_bottom
    for y in range(cfg.height):
        t = y / (cfg.height - 1)
        r = int(r1 + (r2 - r1) * t)
        g = int(g1 + (g2 - g1) * t)
        b = int(b1 + (b2 - b1) * t)
        draw.line([(0, y), (cfg.width, y)], fill=(r, g, b))
    return img


def _draw_text_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    fill: COLOUR,
    max_width: int,
    line_spacing: int = 8,
    anchor: str = "lt",
) -> int:
    """Wrap *text* to *max_width* pixels, draw it, and return the bottom y coordinate."""
    avg_char_width = font.getlength("W")
    chars_per_line = max(1, int(max_width / avg_char_width))
    lines = textwrap.wrap(text, width=chars_per_line)
    current_y = y
    for line in lines:
        draw.text((x, current_y), line, font=font, fill=fill, anchor=anchor)
        bbox = font.getbbox(line)
        line_height = bbox[3] - bbox[1]
        current_y += line_height + line_spacing
    return current_y


def _rounded_rect(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[int, int, int, int],
    radius: int,
    fill: Tuple[int, ...],
) -> None:
    """Draw a rounded rectangle on *draw*."""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


# ---------------------------------------------------------------------------
# Public slide-creation functions
# ---------------------------------------------------------------------------

def make_intro_slide(quiz_title: str, total_questions: int, cfg: VideoConfig = DEFAULT_CONFIG) -> Image.Image:
    """Title card shown at the very beginning of the video."""
    img = _gradient_background(cfg)
    draw = ImageDraw.Draw(img)

    font_big = _load_font(cfg.font_bold, cfg.font_size_title)
    font_sub = _load_font(cfg.font_bold, cfg.font_size_small)
    font_tiny = _load_font(cfg.font_regular, cfg.font_size_small - 8)

    cx = cfg.width // 2
    mid_y = cfg.height // 2 - 120

    # Decorative top bar
    bar_h = 12
    draw.rectangle([cfg.padding, mid_y - 220, cfg.width - cfg.padding, mid_y - 220 + bar_h], fill=cfg.accent_color)

    # Title
    _draw_text_wrapped(draw, quiz_title, cx, mid_y - 180, font_big, cfg.text_color, cfg.width - 2 * cfg.padding, anchor="mt")

    # Sub-title
    draw.text((cx, mid_y + 60), f"{total_questions} Questions", font=font_sub, fill=cfg.muted_color, anchor="mt")

    # Bottom bar
    draw.rectangle([cfg.padding, cfg.height - cfg.padding - bar_h, cfg.width - cfg.padding, cfg.height - cfg.padding], fill=cfg.accent_color)

    return img


def make_question_slide(
    question: MCQQuestion,
    q_number: int,
    total: int,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> Image.Image:
    """Slide showing the question and all four options."""
    img = _gradient_background(cfg)
    draw = ImageDraw.Draw(img)

    font_label = _load_font(cfg.font_bold, cfg.font_size_small - 4)
    font_q = _load_font(cfg.font_bold, cfg.font_size_question)
    font_opt_label = _load_font(cfg.font_bold, cfg.font_size_label)
    font_opt = _load_font(cfg.font_regular, cfg.font_size_option)

    pad = cfg.padding
    content_width = cfg.width - 2 * pad

    # --- Question counter pill ---
    pill_text = f"Q{q_number} of {total}"
    pill_w, pill_h = 260, 64
    pill_x = (cfg.width - pill_w) // 2
    pill_y = 120
    _rounded_rect(draw, (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h), 32, cfg.accent_color)
    draw.text((cfg.width // 2, pill_y + pill_h // 2), pill_text, font=font_label, fill=cfg.text_color, anchor="mm")

    # --- Question text ---
    q_top = pill_y + pill_h + 60
    q_bottom = _draw_text_wrapped(
        draw, question.question, pad, q_top, font_q, cfg.text_color, content_width, line_spacing=12
    )

    # --- Divider ---
    div_y = q_bottom + 40
    draw.line([(pad, div_y), (cfg.width - pad, div_y)], fill=cfg.accent_color, width=3)

    # --- Options ---
    opt_y = div_y + 50
    option_height = 110
    option_gap = 26
    option_label_colors = [cfg.accent_color, cfg.accent_color, cfg.accent_color, cfg.accent_color]

    for i, (label, text) in enumerate(question.labeled_options()):
        ox0 = pad
        oy0 = opt_y + i * (option_height + option_gap)
        ox1 = cfg.width - pad
        oy1 = oy0 + option_height

        # Background pill
        _rounded_rect(draw, (ox0, oy0, ox1, oy1), cfg.option_radius, (255, 255, 255, 30))

        # Label circle
        circle_r = 34
        cx_c = ox0 + 20 + circle_r
        cy_c = (oy0 + oy1) // 2
        draw.ellipse(
            [cx_c - circle_r, cy_c - circle_r, cx_c + circle_r, cy_c + circle_r],
            fill=option_label_colors[i],
        )
        draw.text((cx_c, cy_c), label, font=font_opt_label, fill=cfg.text_color, anchor="mm")

        # Option text
        text_x = cx_c + circle_r + 24
        text_y = cy_c
        draw.text((text_x, text_y), text, font=font_opt, fill=cfg.text_color, anchor="lm")

    return img


def make_think_slide(
    question: MCQQuestion,
    q_number: int,
    total: int,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> Image.Image:
    """Reading-time slide — shows the question and options without overlay."""
    return make_question_slide(question, q_number, total, cfg)


def make_answer_slide(
    question: MCQQuestion,
    q_number: int,
    total: int,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> Image.Image:
    """Slide revealing the correct answer with colour highlights."""
    img = _gradient_background(cfg)
    draw = ImageDraw.Draw(img)

    font_label = _load_font(cfg.font_bold, cfg.font_size_small - 4)
    font_q = _load_font(cfg.font_bold, cfg.font_size_question - 8)
    font_opt_label = _load_font(cfg.font_bold, cfg.font_size_label)
    font_opt = _load_font(cfg.font_regular, cfg.font_size_option - 4)
    font_result = _load_font(cfg.font_bold, cfg.font_size_title - 8)
    font_expl = _load_font(cfg.font_regular, cfg.font_size_small - 6)

    pad = cfg.padding
    content_width = cfg.width - 2 * pad
    cx = cfg.width // 2

    # --- Answer banner ---
    banner_h = 120
    draw.rectangle([0, 0, cfg.width, banner_h], fill=cfg.correct_color)
    draw.text((cx, banner_h // 2), "✓  CORRECT ANSWER", font=font_label, fill=(255, 255, 255), anchor="mm")

    # --- Question number ---
    draw.text((pad, banner_h + 40), f"Q{q_number}/{total}", font=font_label, fill=cfg.muted_color, anchor="lt")

    # --- Question text (smaller) ---
    q_top = banner_h + 100
    q_bottom = _draw_text_wrapped(
        draw, question.question, pad, q_top, font_q, cfg.text_color, content_width, line_spacing=10
    )

    # --- Options with correct highlighted ---
    opt_y = q_bottom + 50
    option_height = 100
    option_gap = 20

    for i, (label, text) in enumerate(question.labeled_options()):
        is_correct = i == question.correct_option
        ox0 = pad
        oy0 = opt_y + i * (option_height + option_gap)
        ox1 = cfg.width - pad
        oy1 = oy0 + option_height

        bg_color = (*cfg.correct_color, 220) if is_correct else (255, 255, 255, 20)
        _rounded_rect(draw, (ox0, oy0, ox1, oy1), cfg.option_radius, bg_color)

        circle_r = 30
        cx_c = ox0 + 18 + circle_r
        cy_c = (oy0 + oy1) // 2
        circle_fill = (255, 255, 255) if is_correct else cfg.accent_color
        draw.ellipse(
            [cx_c - circle_r, cy_c - circle_r, cx_c + circle_r, cy_c + circle_r],
            fill=circle_fill,
        )
        label_color = cfg.correct_color if is_correct else cfg.text_color
        draw.text((cx_c, cy_c), label, font=font_opt_label, fill=label_color, anchor="mm")

        text_color = (255, 255, 255) if is_correct else cfg.muted_color
        text_x = cx_c + circle_r + 20
        draw.text((text_x, cy_c), text, font=font_opt, fill=text_color, anchor="lm")

        if is_correct:
            draw.text((ox1 - 20, cy_c), "✓", font=font_opt_label, fill=(255, 255, 255), anchor="rm")

    # --- Explanation (if any) ---
    if question.explanation:
        expl_y = opt_y + 4 * (option_height + option_gap) + 40
        draw.line([(pad, expl_y), (cfg.width - pad, expl_y)], fill=cfg.muted_color, width=2)
        _draw_text_wrapped(
            draw,
            f"💡 {question.explanation}",
            pad,
            expl_y + 30,
            font_expl,
            cfg.muted_color,
            content_width,
        )

    return img


def make_answer_key_slide(
    questions: List[MCQQuestion],
    page_index: int = 0,
    total_pages: int = 1,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> Image.Image:
    """Answer-key slide listing all correct answers."""
    img = _gradient_background(cfg)
    draw = ImageDraw.Draw(img)

    font_header = _load_font(cfg.font_bold, cfg.font_size_label)
    font_num = _load_font(cfg.font_bold, cfg.font_size_small)
    font_label = _load_font(cfg.font_bold, cfg.font_size_small - 4)
    font_text = _load_font(cfg.font_regular, cfg.font_size_small - 2)

    cx = cfg.width // 2
    pad = cfg.padding
    content_width = cfg.width - 2 * pad

    # Header banner
    banner_h = 120
    draw.rectangle([0, 0, cfg.width, banner_h], fill=cfg.accent_color)
    header_text = (
        f"📋  ANSWER KEY  ({page_index + 1}/{total_pages})"
        if total_pages > 1
        else "📋  ANSWER KEY"
    )
    draw.text((cx, banner_h // 2), header_text, font=font_header, fill=(255, 255, 255), anchor="mm")

    # Answer rows
    start_y = banner_h + 40
    row_h = 140
    max_per_page = max(1, (cfg.height - start_y - 100) // row_h)
    start_idx = page_index * max_per_page
    page_questions = questions[start_idx : start_idx + max_per_page]

    for i, q in enumerate(page_questions):
        global_idx = start_idx + i
        y = start_y + i * row_h
        mid_y = y + row_h // 2

        # Row background
        _rounded_rect(draw, (pad, y + 8, cfg.width - pad, y + row_h - 8), 20, (255, 255, 255, 20))

        # Question number
        draw.text((pad + 20, mid_y), f"Q{global_idx + 1}.", font=font_num, fill=cfg.muted_color, anchor="lm")

        # Correct answer circle
        label_x = pad + 130
        circle_r = 30
        draw.ellipse(
            [label_x - circle_r, mid_y - circle_r, label_x + circle_r, mid_y + circle_r],
            fill=cfg.correct_color,
        )
        draw.text(
            (label_x, mid_y),
            OPTION_LABELS[q.correct_option],
            font=font_label,
            fill=(255, 255, 255),
            anchor="mm",
        )

        # Answer text
        draw.text(
            (label_x + circle_r + 20, mid_y),
            q.correct_text,
            font=font_text,
            fill=cfg.text_color,
            anchor="lm",
        )

    return img


def make_outro_slide(quiz_title: str, cfg: VideoConfig = DEFAULT_CONFIG) -> Image.Image:
    """Closing slide with call-to-action."""
    img = _gradient_background(cfg)
    draw = ImageDraw.Draw(img)

    font_big = _load_font(cfg.font_bold, cfg.font_size_title)
    font_mid = _load_font(cfg.font_bold, cfg.font_size_question - 10)
    font_small = _load_font(cfg.font_regular, cfg.font_size_small)

    cx = cfg.width // 2
    mid_y = cfg.height // 2

    draw.text((cx, mid_y - 200), "🎉", font=font_big, fill=cfg.text_color, anchor="mm")
    draw.text((cx, mid_y - 80), "That's a wrap!", font=font_big, fill=cfg.text_color, anchor="mm")
    draw.text((cx, mid_y + 40), quiz_title, font=font_mid, fill=cfg.accent_color, anchor="mm")
    draw.text((cx, mid_y + 160), "Like & Subscribe for more!", font=font_small, fill=cfg.muted_color, anchor="mm")
    draw.text((cx, mid_y + 240), "👍  🔔  📲", font=font_mid, fill=cfg.text_color, anchor="mm")

    return img


def slides_for_question(
    question: MCQQuestion,
    q_number: int,
    total: int,
    cfg: VideoConfig = DEFAULT_CONFIG,
) -> List[Image.Image]:
    """Return the ordered list of PIL slides for one question."""
    return [
        make_question_slide(question, q_number, total, cfg),
        make_think_slide(question, q_number, total, cfg),
        make_answer_slide(question, q_number, total, cfg),
    ]
