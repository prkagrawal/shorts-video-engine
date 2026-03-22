#!/usr/bin/env python3
"""
Shorts Video Engine — CLI entry point.

Usage examples
--------------
# Generate from a JSON file:
    python main.py --input examples/sample_questions.json --output output/quiz.mp4

# Interactive mode (enter questions one by one):
    python main.py --interactive --output output/quiz.mp4

# Quick demo with built-in sample questions (no internet / audio):
    python main.py --demo --no-audio --output output/demo.mp4
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from src.config import VideoConfig
from src.models import MCQQuestion, Quiz
from src.video_engine import generate_video


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _quiz_from_json(path: str) -> Quiz:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return Quiz.model_validate(data)


def _quiz_interactive() -> Quiz:
    """Prompt the user to enter questions interactively."""
    print("\n=== Shorts Video Engine — Interactive Mode ===")
    title = input("Quiz title [MCQ Quiz]: ").strip() or "MCQ Quiz"

    n = 0
    while not (1 <= n <= 10):
        try:
            n = int(input("How many questions? (1-10): "))
        except ValueError:
            print("  Please enter a number between 1 and 10.")

    questions = []
    for i in range(1, n + 1):
        print(f"\n--- Question {i} ---")
        q_text = ""
        while not q_text:
            q_text = input("Question: ").strip()

        options = []
        for label in ["A", "B", "C", "D"]:
            opt = ""
            while not opt:
                opt = input(f"Option {label}: ").strip()
            options.append(opt)

        correct = -1
        while correct not in range(4):
            raw = input("Correct option (A/B/C/D): ").strip().upper()
            if raw in "ABCD" and len(raw) == 1:
                correct = ord(raw) - ord("A")
            else:
                print("  Enter A, B, C, or D.")

        expl = input("Explanation (optional, press Enter to skip): ").strip() or None
        questions.append(
            MCQQuestion(
                question=q_text,
                options=options,
                correct_option=correct,
                explanation=expl,
            )
        )

    hashtags_raw = input("\nHashtags (comma-separated, or press Enter for defaults): ").strip()
    hashtags = [t.strip() for t in hashtags_raw.split(",") if t.strip()] or ["#shorts", "#quiz", "#mcq"]

    return Quiz(title=title, questions=questions, hashtags=hashtags)


def _demo_quiz() -> Quiz:
    """Return a built-in demo quiz for quick testing."""
    return Quiz(
        title="Geography Quiz",
        questions=[
            MCQQuestion(
                question="What is the capital of France?",
                options=["London", "Berlin", "Paris", "Madrid"],
                correct_option=2,
                explanation="Paris has been the capital of France since 987 AD.",
            ),
            MCQQuestion(
                question="Which is the largest ocean on Earth?",
                options=["Atlantic", "Indian", "Arctic", "Pacific"],
                correct_option=3,
                explanation="The Pacific Ocean covers about 165 million square kilometres.",
            ),
            MCQQuestion(
                question="Mount Everest is located in which mountain range?",
                options=["Andes", "Alps", "Himalayas", "Rockies"],
                correct_option=2,
                explanation="Mount Everest sits on the Nepal–Tibet border in the Himalayas.",
            ),
        ],
        hashtags=["#shorts", "#quiz", "#geography", "#trivia"],
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a YouTube/Instagram Shorts video from MCQ questions.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", "-i", metavar="FILE", help="Path to a JSON file with quiz questions")
    source.add_argument("--interactive", action="store_true", help="Enter questions interactively")
    source.add_argument("--demo", action="store_true", help="Use built-in demo questions")

    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        default="output/quiz.mp4",
        help="Output MP4 file path (default: output/quiz.mp4)",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Disable TTS audio (faster, works offline)",
    )
    parser.add_argument(
        "--width", type=int, default=1080, help="Video width in pixels (default: 1080)"
    )
    parser.add_argument(
        "--height", type=int, default=1920, help="Video height in pixels (default: 1920)"
    )
    parser.add_argument(
        "--fps", type=int, default=30, help="Frames per second (default: 30)"
    )
    parser.add_argument(
        "--question-duration", type=float, default=4.0, metavar="SECS",
        help="Seconds to display each question slide (default: 4.0)",
    )
    parser.add_argument(
        "--think-duration", type=float, default=3.0, metavar="SECS",
        help="Seconds for the think pause (default: 3.0)",
    )
    parser.add_argument(
        "--answer-duration", type=float, default=3.5, metavar="SECS",
        help="Seconds to display each answer slide (default: 3.5)",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)

    # Build quiz
    if args.input:
        try:
            quiz = _quiz_from_json(args.input)
        except (FileNotFoundError, json.JSONDecodeError, Exception) as exc:
            print(f"ERROR loading {args.input}: {exc}", file=sys.stderr)
            return 1
    elif args.interactive:
        quiz = _quiz_interactive()
    else:
        quiz = _demo_quiz()

    # Build config
    cfg = VideoConfig(
        width=args.width,
        height=args.height,
        fps=args.fps,
        question_duration=args.question_duration,
        think_duration=args.think_duration,
        answer_duration=args.answer_duration,
        audio_enabled=not args.no_audio,
    )

    print(f"\n📽  Generating video: {args.output}")
    print(f"    Quiz  : {quiz.title}")
    print(f"    Questions : {len(quiz.questions)}")
    print(f"    Resolution: {cfg.width}×{cfg.height}  {cfg.fps}fps")
    print(f"    Audio : {'enabled' if cfg.audio_enabled else 'disabled'}")
    print()

    try:
        out = generate_video(quiz, args.output, cfg)
        print(f"\n✅  Video saved to: {out}")
        if quiz.hashtags:
            print(f"\n   Suggested hashtags: {' '.join(quiz.hashtags)}")
        return 0
    except Exception as exc:
        print(f"ERROR generating video: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    sys.exit(main())
