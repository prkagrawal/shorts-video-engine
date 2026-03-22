# Shorts Video Engine 🎬

Generate YouTube / Instagram **Shorts-format vertical videos** (1080×1920, 9:16) from MCQ quiz questions — no video-editing software required.

![Slide preview](https://github.com/user-attachments/assets/ec6981c2-de53-4481-b722-2eed54d94292)

---

## Features

- 📝 **1–10 MCQ questions** per video
- 🖼️ **5 slide types** per question: intro → question+options → think pause → answer reveal → outro
- 🎨 **Dark gradient design** with accent colours, rounded option pills, and correct-answer highlight
- 🔊 **Optional TTS audio** (Google TTS via `gTTS`) — disable with `--no-audio` for offline use
- 📦 Three input modes: **JSON file**, **interactive CLI**, or built-in **demo**
- ⚙️ Fully configurable resolution, FPS, and slide durations
- 🌐 **Static web app** — runs entirely in the browser, no server needed, deployable to Vercel free tier

---

## Quick Start

### 1. Static web app (recommended — works on any device, no install)

Open [`web/index.html`](web/index.html) directly in any modern browser, or deploy it to Vercel:

```bash
# Install the Vercel CLI once
npm install -g vercel

# Deploy — generates a free public HTTPS URL
vercel --prod
```

Vercel serves `web/` as a fully static site — **no server, no Python, no cost**. Open the URL on your phone, tablet, or laptop, fill in the quiz, hit Generate, and download the MP4. Video generation runs entirely in the browser using the [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) and [VideoEncoder (WebCodecs)](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder).

![Web interface](https://github.com/user-attachments/assets/0578f7cd-41e7-4b20-b511-4d2141178a01)

#### Browser requirements

| Browser | Min version | Notes |
|---|---|---|
| Chrome / Edge | 99+ | Full support (MP4 output) |
| Safari | 16.4+ | Full support (MP4 output) |
| Firefox | 130+ | Full support (MP4 output) |
| Older browsers | any | Automatic WebM fallback via MediaRecorder |

> **Mobile tip:** Choose **Fast 540p** quality for quicker generation on older phones.  
> Video is generated silently — add music or a voiceover in any editor after downloading.

### 2. Local Flask server (optional — adds TTS audio support)

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

The Flask server generates MP4s with optional Google TTS audio and streams them directly to the browser.

### 3. CLI

```bash
# Install dependencies
pip install -r requirements.txt

# Demo video
python main.py --demo --no-audio --output output/demo.mp4

# From a JSON file
python main.py --input examples/sample_questions.json --output output/quiz.mp4

# Interactive mode
python main.py --interactive --output output/my_quiz.mp4
```

---

## JSON Input Format

```json
{
  "title": "Science Quiz",
  "questions": [
    {
      "question": "What is the chemical symbol for water?",
      "options": ["HO", "H2O", "O2H", "H2O2"],
      "correct_option": 1,
      "explanation": "Water is made of two hydrogen and one oxygen atom: H2O."
    }
  ],
  "hashtags": ["#shorts", "#quiz", "#science"]
}
```

| Field | Type | Description |
|---|---|---|
| `title` | string | Shown on the intro and outro slides |
| `questions` | array | 1–10 MCQ question objects |
| `questions[].question` | string | The question text |
| `questions[].options` | array[4] | Exactly four answer strings (A, B, C, D) |
| `questions[].correct_option` | int | 0-based index of the correct answer (0=A … 3=D) |
| `questions[].explanation` | string? | Optional note shown on the answer slide |
| `hashtags` | array | Added to the CLI output as copy-paste suggestions |

See [`examples/sample_questions.json`](examples/sample_questions.json) for a full 5-question example.

---

## CLI Options

```
python main.py [--input FILE | --interactive | --demo]
               [--output FILE]
               [--no-audio]
               [--width PX] [--height PX] [--fps N]
               [--question-duration SECS]
               [--think-duration SECS]
               [--answer-duration SECS]
```

| Option | Default | Description |
|---|---|---|
| `--input FILE` | — | JSON quiz file |
| `--interactive` | — | Enter questions via prompts |
| `--demo` | — | Built-in 3-question geography quiz |
| `--output FILE` | `output/quiz.mp4` | Output video path |
| `--no-audio` | off | Skip TTS (faster, works offline) |
| `--width` | 1080 | Video width in pixels |
| `--height` | 1920 | Video height in pixels |
| `--fps` | 30 | Frames per second |
| `--question-duration` | 4.0 | Seconds per question slide |
| `--think-duration` | 3.0 | Seconds for the think pause |
| `--answer-duration` | 3.5 | Seconds per answer slide |

---

## Project Structure

```
shorts-video-engine/
├── web/
│   └── index.html         # Static web app (no server needed, deployable to Vercel)
├── src/
│   ├── models.py          # Pydantic data models (MCQQuestion, Quiz)
│   ├── config.py          # VideoConfig (resolution, colours, fonts, timing)
│   ├── slide_generator.py # PIL-based slide image generation
│   ├── audio_generator.py # gTTS text-to-speech helpers
│   └── video_engine.py    # MoviePy video assembly
├── templates/
│   └── index.html         # Flask web UI (served by app.py)
├── tests/
│   ├── test_models.py
│   ├── test_slide_generator.py
│   └── test_video_engine.py
├── examples/
│   └── sample_questions.json
├── app.py                 # Flask web server (optional, for TTS audio)
├── main.py                # CLI entry point
├── vercel.json            # Vercel deployment config (serves web/)
├── .vercelignore          # Files excluded from Vercel bundle
└── requirements.txt
```

---

## Running Tests

```bash
pip install pytest
pytest tests/ -v
```

---

## Requirements

- **Static web app**: any modern browser — no Python or FFmpeg needed
- **Flask server / CLI**: Python 3.10+, FFmpeg (system package), see [`requirements.txt`](requirements.txt)
