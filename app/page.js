'use client';

import { useState, useCallback } from 'react';
import styles from './page.module.css';

const DEFAULT_QUESTION = () => ({
  question: '',
  options: ['', '', '', ''],
  correctOption: 0,
  explanation: '',
});

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const SAMPLE_JSON = `{
  "title": "My Quiz",
  "questions": [
    {
      "question": "What is the capital of France?",
      "options": ["London", "Berlin", "Paris", "Madrid"],
      "correct_option": 2,
      "explanation": "Paris has been the capital since 987 AD."
    }
  ],
  "hashtags": ["#shorts", "#quiz"]
}`;

export default function Home() {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([DEFAULT_QUESTION()]);
  const [hashtags, setHashtags] = useState('#shorts #quiz #mcq');
  const [status, setStatus] = useState('idle'); // idle | generating | done | error
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [inputMode, setInputMode] = useState('form'); // 'form' | 'json'
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');

  // --- Question helpers ---

  const updateQuestion = useCallback((qi, field, value) => {
    setQuestions((qs) => qs.map((q, i) => i === qi ? { ...q, [field]: value } : q));
  }, []);

  const updateOption = useCallback((qi, oi, value) => {
    setQuestions((qs) => qs.map((q, i) => {
      if (i !== qi) return q;
      const opts = [...q.options];
      opts[oi] = value;
      return { ...q, options: opts };
    }));
  }, []);

  const addQuestion = () => {
    if (questions.length < 10) setQuestions((qs) => [...qs, DEFAULT_QUESTION()]);
  };

  const removeQuestion = (qi) => {
    if (questions.length > 1) setQuestions((qs) => qs.filter((_, i) => i !== qi));
  };

  // --- JSON helpers ---

  const parseJsonInput = (raw) => {
    const data = JSON.parse(raw);
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('JSON must contain a non-empty "questions" array');
    }
    if (data.questions.length > 10) {
      throw new Error('Maximum 10 questions allowed');
    }
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      if (!q.question || typeof q.question !== 'string') {
        throw new Error(`Question ${i + 1}: missing or invalid "question" text`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question ${i + 1}: must have exactly 4 options`);
      }
      if (typeof q.correct_option !== 'number' || q.correct_option < 0 || q.correct_option > 3) {
        throw new Error(`Question ${i + 1}: "correct_option" must be 0–3`);
      }
    }
    return {
      title: (data.title || 'Quiz').trim(),
      questions: data.questions.map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => String(o).trim()),
        correctOption: q.correct_option,
        explanation: q.explanation ? q.explanation.trim() : null,
      })),
      hashtags: Array.isArray(data.hashtags)
        ? data.hashtags
        : (data.hashtags || '#shorts #quiz #mcq').split(/[\s,]+/).filter(Boolean),
    };
  };

  const loadJsonToForm = () => {
    setJsonError('');
    try {
      const parsed = parseJsonInput(jsonInput);
      setTitle(parsed.title);
      setQuestions(parsed.questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation || '',
      })));
      setHashtags(parsed.hashtags.join(' '));
      setInputMode('form');
    } catch (err) {
      setJsonError(err.message);
    }
  };

  // --- Generate ---

  const handleGenerate = async () => {
    setStatus('generating');
    setProgress(0);
    setVideoUrl(null);
    setErrorMsg('');

    try {
      const { generateVideo } = await import('../lib/engine');

      let quiz;
      if (inputMode === 'json') {
        quiz = parseJsonInput(jsonInput);
      } else {
        quiz = {
          title: title.trim() || 'Quiz',
          questions: questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctOption: q.correctOption,
            explanation: q.explanation.trim() || null,
          })),
          hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
        };
      }

      const blob = await generateVideo(quiz, { fps: 30 }, (p) => setProgress(p));
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Unknown error');
      setStatus('error');
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${title.trim() || 'quiz'}.mp4`;
    a.click();
  };

  // --- Render ---

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.logo}>🎬 Shorts Video Engine</h1>
        <p className={styles.tagline}>Generate quiz Shorts videos in your browser — no upload required</p>
      </header>

      <div className={styles.container}>
        {/* Input mode toggle */}
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${inputMode === 'form' ? styles.modeBtnActive : ''}`}
            onClick={() => setInputMode('form')}
          >
            📝 Form
          </button>
          <button
            className={`${styles.modeBtn} ${inputMode === 'json' ? styles.modeBtnActive : ''}`}
            onClick={() => setInputMode('json')}
          >
            {'{ } JSON'}
          </button>
        </div>

        {inputMode === 'json' ? (
          /* JSON input */
          <section className={styles.card}>
            <label className={styles.label}>Paste Quiz JSON</label>
            <textarea
              className={styles.jsonTextarea}
              rows={14}
              placeholder={SAMPLE_JSON}
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setJsonError(''); }}
            />
            {jsonError && <p className={styles.error}>{jsonError}</p>}
            <button className={styles.addBtn} onClick={loadJsonToForm}>
              Load into Form Editor →
            </button>
          </section>
        ) : (
          /* Form input */
          <>
            {/* Quiz title */}
            <section className={styles.card}>
              <label className={styles.label}>Quiz Title</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Geography Quiz"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </section>

            {/* Questions */}
            {questions.map((q, qi) => (
              <section key={qi} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.qLabel}>Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button className={styles.removeBtn} onClick={() => removeQuestion(qi)} title="Remove question">✕</button>
                  )}
                </div>

                <label className={styles.label}>Question text</label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="What is the capital of France?"
                  value={q.question}
                  onChange={(e) => updateQuestion(qi, 'question', e.target.value)}
                />

                <label className={styles.label}>Options</label>
                {q.options.map((opt, oi) => (
                  <div key={oi} className={styles.optionRow}>
                    <button
                      className={`${styles.optionLabel} ${q.correctOption === oi ? styles.optionLabelCorrect : ''}`}
                      onClick={() => updateQuestion(qi, 'correctOption', oi)}
                      title="Mark as correct"
                    >
                      {OPTION_LABELS[oi]}
                    </button>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder={`Option ${OPTION_LABELS[oi]}`}
                      value={opt}
                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                    />
                  </div>
                ))}
                <p className={styles.hint}>Click A / B / C / D to mark the correct answer</p>

                <label className={styles.label}>Explanation (optional)</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Short explanation shown after the answer…"
                  value={q.explanation}
                  onChange={(e) => updateQuestion(qi, 'explanation', e.target.value)}
                />
              </section>
            ))}

            {questions.length < 10 && (
              <button className={styles.addBtn} onClick={addQuestion}>+ Add Question</button>
            )}

            {/* Hashtags */}
            <section className={styles.card}>
              <label className={styles.label}>Hashtags</label>
              <input
                className={styles.input}
                type="text"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
            </section>
          </>
        )}

        {/* Generate button */}
        <button
          className={styles.generateBtn}
          onClick={handleGenerate}
          disabled={status === 'generating'}
        >
          {status === 'generating' ? `Generating… ${Math.round(progress * 100)}%` : '🎬 Generate Video'}
        </button>

        {status === 'generating' && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {status === 'error' && (
          <p className={styles.error}>Error: {errorMsg}</p>
        )}

        {status === 'done' && videoUrl && (
          <div className={styles.result}>
            <p className={styles.successMsg}>✅ Video ready!</p>
            <video className={styles.preview} src={videoUrl} controls playsInline />
            <button className={styles.downloadBtn} onClick={handleDownload}>⬇️ Download MP4</button>
            {hashtags && (
              <p className={styles.hashtagsDisplay}>{hashtags}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
