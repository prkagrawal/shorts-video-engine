#!/usr/bin/env python3
"""
Shorts Video Engine — Web Interface (Vercel-compatible).

Start locally:
    python app.py

Deploy to Vercel:
    vercel deploy
    # Requires Vercel Pro (60 s) or Enterprise (300 s) for sufficient timeout.
    # Hobby (10 s) is too short for video generation.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from flask import Flask, Response, after_this_request, jsonify, render_template, request, send_file
from pydantic import ValidationError

from src.config import VideoConfig
from src.models import Quiz
from src.video_engine import generate_video

# ---------------------------------------------------------------------------
# Ensure FFmpeg is on PATH (imageio-ffmpeg bundles a static binary so the app
# works on platforms that don't ship FFmpeg, e.g. Vercel's Lambda runtime).
# ---------------------------------------------------------------------------
try:
    import imageio_ffmpeg  # type: ignore[import-untyped]
    _ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    _ffmpeg_dir = str(Path(_ffmpeg_exe).parent)
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception:  # noqa: BLE001
    logger.warning(
        "imageio-ffmpeg not available; falling back to system FFmpeg. "
        "Install imageio-ffmpeg for guaranteed FFmpeg availability on serverless platforms."
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------

app = Flask(__name__)

# /tmp is writable on every platform (local, Docker, Vercel, Railway, Render…).
# On Vercel, the normal filesystem is read-only except for /tmp.
_TMP_DIR = Path(os.environ.get("TMPDIR", "/tmp")) / "svengine"


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate() -> Response:
    """Validate the quiz, generate the video synchronously, and return it."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    try:
        quiz = Quiz.model_validate(data.get("quiz", data))
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 422

    cfg_overrides = data.get("config", {})
    cfg = VideoConfig(
        audio_enabled=cfg_overrides.get("audio_enabled", False),
        question_duration=float(cfg_overrides.get("question_duration", 4.0)),
        think_duration=float(cfg_overrides.get("think_duration", 3.0)),
        answer_duration=float(cfg_overrides.get("answer_duration", 3.5)),
    )

    _TMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(_TMP_DIR / f"{uuid.uuid4().hex}.mp4")

    try:
        generate_video(quiz, output_path, cfg)
    except Exception as exc:
        logger.exception("Video generation failed for quiz %r", quiz.title)
        try:
            os.unlink(output_path)
        except OSError:
            pass
        return jsonify({"error": str(exc)}), 500

    # Schedule temp-file cleanup after the response is fully sent.
    @after_this_request
    def _cleanup(response: Response) -> Response:
        try:
            os.unlink(output_path)
        except OSError:
            pass
        return response

    return send_file(
        output_path,
        mimetype="video/mp4",
        as_attachment=False,
        download_name="quiz_video.mp4",
        conditional=False,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
