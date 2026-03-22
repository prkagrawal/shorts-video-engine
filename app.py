#!/usr/bin/env python3
"""
Shorts Video Engine — Web Interface.

Start the server:
    python app.py

Then open http://localhost:5000 in any browser (desktop or mobile).
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from pathlib import Path
from typing import Optional, TypedDict

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_file,
)
from pydantic import ValidationError

from src.config import VideoConfig
from src.models import MCQQuestion, Quiz
from src.video_engine import generate_video

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------

app = Flask(__name__)

# Directory where generated videos are stored temporarily
OUTPUT_DIR = Path("output") / "web"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class JobRecord(TypedDict):
    status: str          # "queued" | "running" | "done" | "error"
    output: Optional[str]
    error: Optional[str]


# In-memory job registry  {job_id: JobRecord}
_jobs: dict[str, JobRecord] = {}
_jobs_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

def _run_job(job_id: str, quiz: Quiz, cfg: VideoConfig) -> None:
    output_path = str(OUTPUT_DIR / f"{job_id}.mp4")
    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"
        generate_video(quiz, output_path, cfg)
        with _jobs_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["output"] = output_path
    except Exception as exc:  # noqa: BLE001
        logger.exception("Job %s failed", job_id)
        with _jobs_lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate() -> Response:
    """Accept a quiz payload (JSON body) and start video generation."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    try:
        quiz = Quiz.model_validate(data.get("quiz", data))
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 422

    # Video config overrides (all optional)
    cfg_overrides = data.get("config", {})
    cfg = VideoConfig(
        audio_enabled=cfg_overrides.get("audio_enabled", False),
        question_duration=float(cfg_overrides.get("question_duration", 4.0)),
        think_duration=float(cfg_overrides.get("think_duration", 3.0)),
        answer_duration=float(cfg_overrides.get("answer_duration", 3.5)),
    )

    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {"status": "queued", "output": None, "error": None}

    thread = threading.Thread(target=_run_job, args=(job_id, quiz, cfg), daemon=True)
    thread.start()

    return jsonify({"job_id": job_id}), 202


@app.route("/status/<job_id>")
def status(job_id: str) -> Response:
    """Return the current status of a generation job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({"status": job["status"], "error": job.get("error")})


@app.route("/video/<job_id>")
def video(job_id: str) -> Response:
    """Stream the generated video (for in-browser playback)."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job["status"] != "done":
        return jsonify({"error": "Video not ready"}), 404
    return send_file(job["output"], mimetype="video/mp4", conditional=True)


@app.route("/download/<job_id>")
def download(job_id: str) -> Response:
    """Serve the generated video as a download attachment."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job["status"] != "done":
        return jsonify({"error": "Video not ready"}), 404
    return send_file(
        job["output"],
        mimetype="video/mp4",
        as_attachment=True,
        download_name="quiz_video.mp4",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
