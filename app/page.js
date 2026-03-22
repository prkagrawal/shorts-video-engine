'use client';

import { useState, useRef, useCallback } from 'react';
import {
  buildSlides,
  encodeMP4,
  encodeMediaRecorder,
  validateQuiz,
  RESOLUTIONS,
  MAX_QUESTIONS,
} from '../lib/engine';

/* ── helpers ── */

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function newQuestion() {
  return {
    id: crypto.randomUUID(),
    question: '',
    options: ['', '', '', ''],
    correct_option: 0,
    explanation: '',
  };
}

/* ═══════════════════════════════════════════════════════════
   QUESTION BLOCK COMPONENT
   ═══════════════════════════════════════════════════════════ */

function QuestionBlock({ q, index, total, onUpdate, onRemove }) {
  const n = q.id;

  const updateOption = (i, val) => {
    const opts = [...q.options];
    opts[i] = val;
    onUpdate(n, 'options', opts);
  };

  return (
    <div className="question-block" id={`q-block-${n}`}>
      <h3>Question {index + 1}</h3>
      {total > 1 && (
        <button className="remove-q" title="Remove" onClick={() => onRemove(n)}>✕</button>
      )}

      <label>Question text</label>
      <input
        type="text"
        value={q.question}
        placeholder="Enter your question…"
        onChange={e => onUpdate(n, 'question', e.target.value)}
      />

      <label>Options</label>
      <div className="options-grid">
        {OPTION_LABELS.map((label, i) => (
          <div className="option-row" key={label}>
            <span className="opt-label">{label}</span>
            <input
              type="text"
              value={q.options[i]}
              placeholder={`Option ${label}`}
              className="mb-0"
              onChange={e => updateOption(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="correct-row">
        <span className="correct-row-label" style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
          Correct answer:
        </span>
        {OPTION_LABELS.map((label, i) => (
          <label
            key={label}
            style={{
              display: 'inline-flex', alignItems: 'center',
              gap: '.25rem', marginRight: '.6rem', cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={`correct-${n}`}
              value={i}
              checked={q.correct_option === i}
              onChange={() => onUpdate(n, 'correct_option', i)}
            />
            {label}
          </label>
        ))}
      </div>

      <label>
        Explanation <span className="text-muted">(optional)</span>
      </label>
      <input
        type="text"
        value={q.explanation}
        placeholder="Brief explanation shown after the answer…"
        onChange={e => onUpdate(n, 'explanation', e.target.value)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function Home() {
  /* — Quiz input state — */
  const [tab, setTab]             = useState('form');
  const [quizTitle, setQuizTitle] = useState('MCQ Quiz');
  const [hashtags, setHashtags]   = useState('#shorts, #quiz, #mcq');
  const [questions, setQuestions] = useState([newQuestion()]);
  const [jsonInput, setJsonInput] = useState('');

  /* — Config state — */
  const [questionDuration, setQuestionDuration] = useState(4.0);
  const [thinkDuration,    setThinkDuration]    = useState(3.0);
  const [answerDuration,   setAnswerDuration]   = useState(3.5);
  const [quality, setQuality]                   = useState('hd');

  /* — Generation state — */
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [progressFrac,   setProgressFrac]   = useState(0);
  const [progressLabel,  setProgressLabel]  = useState('');
  const [showProgress,   setShowProgress]   = useState(false);
  const [videoUrl,       setVideoUrl]       = useState(null);
  const [videoFilename,  setVideoFilename]  = useState('quiz_video.mp4');
  const [error,          setError]          = useState(null);
  const [elapsed,        setElapsed]        = useState(null);

  const prevBlobUrl = useRef(null);

  /* ── Question management ── */

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) {
      alert(`Maximum ${MAX_QUESTIONS} questions allowed.`);
      return;
    }
    setQuestions(qs => [...qs, newQuestion()]);
  };

  const removeQuestion = useCallback(id => {
    setQuestions(qs => qs.filter(q => q.id !== id));
  }, []);

  const updateQuestion = useCallback((id, field, value) => {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, [field]: value } : q));
  }, []);

  /* ── JSON file upload ── */

  const handleJsonFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setJsonInput(ev.target.result);
    reader.readAsText(file);
  };

  /* ── Build validated quiz payload from current state ── */

  const buildPayload = () => {
    if (tab === 'json') {
      const raw = jsonInput.trim();
      if (!raw) throw new Error('Please enter or upload a JSON quiz.');
      let quiz = JSON.parse(raw);
      if (quiz.quiz) quiz = quiz.quiz;
      validateQuiz(quiz);
      return {
        quiz,
        cfg: { question_duration: questionDuration, think_duration: thinkDuration, answer_duration: answerDuration, quality },
      };
    }

    if (!questions.length) throw new Error('Add at least one question.');
    for (const [i, q] of questions.entries()) {
      if (!q.question.trim()) throw new Error(`Question ${i + 1} text is empty.`);
      if (q.options.some(o => !o.trim())) throw new Error(`Question ${i + 1}: all four options must be non-empty.`);
    }

    const quiz = {
      title: quizTitle.trim() || 'MCQ Quiz',
      questions: questions.map(q => ({
        question: q.question,
        options: q.options,
        correct_option: q.correct_option,
        ...(q.explanation.trim() ? { explanation: q.explanation } : {}),
      })),
      hashtags: hashtags.split(',').map(t => t.trim()).filter(Boolean),
    };
    validateQuiz(quiz);

    return {
      quiz,
      cfg: { question_duration: questionDuration, think_duration: thinkDuration, answer_duration: answerDuration, quality },
    };
  };

  /* ── Video generation ── */

  const startGeneration = async () => {
    let payload;
    try { payload = buildPayload(); }
    catch (e) { alert(e.message); return; }

    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = null;
    }
    setVideoUrl(null);
    setError(null);
    setElapsed(null);
    setIsGenerating(true);
    setShowProgress(true);
    setProgressFrac(0);
    setProgressLabel('Starting…');

    const t0 = Date.now();

    try {
      const res = RESOLUTIONS[quality] ?? RESOLUTIONS.hd;

      /* Phase 1 — render slides (0 → 40%) */
      const slideData = await buildSlides(
        payload.quiz, payload.cfg,
        (p, label) => { setProgressFrac(p * 0.4); setProgressLabel(label); },
      );

      /* Phase 2 — encode (40 → 100%) */
      let blob, ext;
      const useWebCodecs = typeof VideoEncoder !== 'undefined';

      if (useWebCodecs) {
        try {
          const buf = await encodeMP4(
            slideData, res,
            (p, label) => { setProgressFrac(0.4 + p * 0.6); setProgressLabel(label); },
            quality,
          );
          blob = new Blob([buf], { type: 'video/mp4' });
          ext  = 'mp4';
        } catch {
          /* VideoEncoder failed — fall back to MediaRecorder */
          const b = await encodeMediaRecorder(
            slideData, res,
            (p, label) => { setProgressFrac(0.4 + p * 0.6); setProgressLabel(label); },
          );
          blob = b;
          ext  = b.type.includes('mp4') ? 'mp4' : 'webm';
        }
      } else {
        const b = await encodeMediaRecorder(
          slideData, res,
          (p, label) => { setProgressFrac(0.4 + p * 0.6); setProgressLabel(label); },
        );
        blob = b;
        ext  = b.type.includes('mp4') ? 'mp4' : 'webm';
      }

      const url = URL.createObjectURL(blob);
      prevBlobUrl.current = url;

      const took = ((Date.now() - t0) / 1000).toFixed(1);
      setProgressFrac(1);
      setProgressLabel(`✅ Done in ${took}s`);
      setElapsed(took);
      setVideoUrl(url);
      setVideoFilename(`quiz_video.${ext}`);

    } catch (e) {
      console.error(e);
      setError(`Generation failed: ${e.message || e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const resetUI = () => {
    setVideoUrl(null);
    setShowProgress(false);
    setError(null);
    setElapsed(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Render ── */

  return (
    <>
      <h1>🎬 Shorts Video Engine</h1>
      <p className="subtitle">Generate MCQ quiz Short videos · runs entirely in your browser</p>

      {/* ── Quiz Input ── */}
      <div className="card">
        <h2>📝 Quiz Input</h2>

        <div className="tabs">
          <button
            className={`tab-btn${tab === 'form' ? ' active' : ''}`}
            onClick={() => setTab('form')}
          >
            Form Builder
          </button>
          <button
            className={`tab-btn${tab === 'json' ? ' active' : ''}`}
            onClick={() => setTab('json')}
          >
            JSON / File Upload
          </button>
        </div>

        {/* Form tab */}
        <div className={`tab-panel${tab === 'form' ? ' active' : ''}`}>
          <label htmlFor="quiz-title">Quiz title</label>
          <input
            type="text"
            id="quiz-title"
            value={quizTitle}
            placeholder="e.g. Science Quiz"
            onChange={e => setQuizTitle(e.target.value)}
          />

          <label>Hashtags <span className="text-muted">(comma-separated)</span></label>
          <input
            type="text"
            value={hashtags}
            onChange={e => setHashtags(e.target.value)}
          />

          {questions.map((q, idx) => (
            <QuestionBlock
              key={q.id}
              q={q}
              index={idx}
              total={questions.length}
              onUpdate={updateQuestion}
              onRemove={removeQuestion}
            />
          ))}

          <button className="btn btn-secondary btn-sm mt-1" onClick={addQuestion}>
            ＋ Add Question
          </button>
          <span className="text-muted" style={{ marginLeft: '.5rem' }}>
            up to {MAX_QUESTIONS} questions
          </span>
        </div>

        {/* JSON tab */}
        <div className={`tab-panel${tab === 'json' ? ' active' : ''}`}>
          <label
            className="file-drop"
            style={{ cursor: 'pointer' }}
          >
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleJsonFile}
            />
            <p>📂 Click or tap to open a <strong>.json</strong> file</p>
            <p className="text-muted mt-1">or paste JSON directly below</p>
          </label>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            style={{
              minHeight: '200px', marginTop: '.75rem',
              fontFamily: 'monospace', fontSize: '.8rem',
            }}
            placeholder={`{"title":"My Quiz","questions":[{"question":"...","options":["A","B","C","D"],"correct_option":0}]}`}
          />
        </div>
      </div>

      {/* ── Video Settings ── */}
      <div className="card">
        <h2>⚙️ Video Settings</h2>
        <div className="config-row">
          <div>
            <label>Question slide (s)</label>
            <input
              type="number"
              value={questionDuration}
              step="0.5"
              min="1"
              onChange={e => setQuestionDuration(Math.max(1, parseFloat(e.target.value) || 4))}
            />
          </div>
          <div>
            <label>Think pause (s)</label>
            <input
              type="number"
              value={thinkDuration}
              step="0.5"
              min="1"
              onChange={e => setThinkDuration(Math.max(1, parseFloat(e.target.value) || 3))}
            />
          </div>
          <div>
            <label>Answer slide (s)</label>
            <input
              type="number"
              value={answerDuration}
              step="0.5"
              min="1"
              onChange={e => setAnswerDuration(Math.max(1, parseFloat(e.target.value) || 3.5))}
            />
          </div>
          <div>
            <label>Quality</label>
            <select value={quality} onChange={e => setQuality(e.target.value)}>
              <option value="hd">HD 1080p</option>
              <option value="fast">Fast 540p</option>
            </select>
          </div>
        </div>
        <p className="info-note">
          🔇 Video is generated without audio. Add your own music or voiceover in any editor after downloading.
        </p>
      </div>

      {/* ── Generate button ── */}
      <div className="center">
        <button
          className="btn btn-primary"
          style={{ fontSize: '1.1rem', padding: '.8rem 2.5rem' }}
          disabled={isGenerating}
          onClick={startGeneration}
        >
          🚀 Generate Video
        </button>
      </div>

      {/* ── Progress ── */}
      {showProgress && (
        <div className="card">
          <div className="status-box">
            {isGenerating && <div className="spinner" />}
            <p className={`status-text${error ? ' status-error' : ''}`}>
              {error ?? progressLabel}
            </p>
            {!error && (
              <>
                <div className="progress-wrap">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round(progressFrac * 100)}%` }}
                  />
                </div>
                <p className="progress-label">
                  {progressFrac > 0 ? `${Math.round(progressFrac * 100)}%` : ''}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Video Player + Download ── */}
      {videoUrl && (
        <div className="card">
          <h2>▶️ Your Video</h2>
          <video src={videoUrl} controls playsInline />
          <div className="video-actions">
            <a
              className="btn btn-success"
              href={videoUrl}
              download={videoFilename}
            >
              ⬇️ Download {videoFilename.endsWith('.webm') ? 'WebM' : 'MP4'}
            </a>
            <button className="btn btn-secondary" onClick={resetUI}>
              🔄 Make Another
            </button>
          </div>
        </div>
      )}
    </>
  );
}
