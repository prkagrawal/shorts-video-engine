/**
 * Shorts Video Engine — browser-side video generation
 *
 * Canvas 2D slide rendering (mirrors Python slide_generator.py exactly)
 * + WebCodecs / mp4-muxer H.264 MP4 encoding
 * + MediaRecorder WebM/MP4 fallback for older browsers
 *
 * All functions are pure: they accept and return data, no React deps.
 * Import this file only from 'use client' components (browser-only).
 */

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

export const RESOLUTIONS = { hd: { w: 1080, h: 1920 }, fast: { w: 540, h: 960 } };
export const MAX_QUESTIONS = 10;
export const SLIDES_PER_QUESTION = 3; // question + think + answer

const REF = { w: 1080, h: 1920 }; // reference canvas Python sizes are based on

/** Scale a value from the 1080×1920 reference to the current canvas size. */
const sx = (v, W) => v * W / REF.w;
const sy = (v, H) => v * H / REF.h;

const rgb  = ([r, g, b])    => `rgb(${r},${g},${b})`;
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

const PAL = {
  bgTop:   [15,  12,  41],
  bgBot:   [48,  43,  99],
  accent:  [108, 92,  231],
  correct: [0,   184, 148],
  text:    [255, 255, 255],
  muted:   [178, 190, 195],
};

/* ═══════════════════════════════════════════════════════════
   PRIMITIVE DRAWING HELPERS
   ═══════════════════════════════════════════════════════════ */

function drawBg(ctx) {
  const { width: W, height: H } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(PAL.bgTop));
  g.addColorStop(1, rgb(PAL.bgBot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function fillRR(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function fillCircle(ctx, cx, cy, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function hline(ctx, x0, x1, y, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw word-wrapped text, returning the y coordinate below the last line.
 * Caller's canvas state is fully restored via ctx.save / ctx.restore.
 */
function drawWrapped(ctx, text, x, y, maxW, font, fill, extraLeading = 0) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const sizePx = parseInt(font.match(/(\d+)px/)?.[1] ?? '40');
  const lineH = sizePx * 1.25 + extraLeading;
  const words = text.split(' ');
  let line = '', curY = y;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineH;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, curY); curY += lineH; }

  ctx.restore();
  return curY;
}

/* ═══════════════════════════════════════════════════════════
   SLIDE GENERATORS  (faithfully mirrors slide_generator.py)
   ═══════════════════════════════════════════════════════════ */

function drawIntroSlide(ctx, title, totalQ) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pad = sx(80, W), cw = W - 2 * pad;
  drawBg(ctx);
  ctx.save();

  const midY = H / 2 - sy(120, H);
  const barH = sy(12, H);

  ctx.fillStyle = rgb(PAL.accent);
  ctx.fillRect(pad, midY - sy(220, H), cw, barH);

  drawWrapped(ctx, title, pad, midY - sy(180, H), cw,
    `bold ${sx(72, W)}px system-ui,sans-serif`, rgb(PAL.text), sy(12, H));

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = rgb(PAL.muted);
  ctx.font = `bold ${sx(40, W)}px system-ui,sans-serif`;
  ctx.fillText(`${totalQ} Question${totalQ === 1 ? '' : 's'}`, W / 2, midY + sy(60, H));
  ctx.font = `${sx(32, W)}px system-ui,sans-serif`;
  ctx.fillText("Let's see how many you get right!", W / 2, midY + sy(130, H));

  ctx.fillStyle = rgb(PAL.accent);
  ctx.fillRect(pad, H - pad - barH, cw, barH);

  ctx.restore();
}

function drawQuestionSlide(ctx, q, qNum, total) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pad = sx(80, W), cw = W - 2 * pad, cx = W / 2;
  drawBg(ctx);
  ctx.save();

  const pillW = sx(260, W), pillH = sy(64, H), pillR = sx(32, W);
  const pillX = (W - pillW) / 2, pillY = sy(120, H);
  fillRR(ctx, pillX, pillY, pillW, pillH, pillR, rgb(PAL.accent));
  ctx.fillStyle = rgb(PAL.text);
  ctx.font = `bold ${sx(36, W)}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`Q${qNum} of ${total}`, cx, pillY + pillH / 2);

  const qTop = pillY + pillH + sy(60, H);
  const qBot = drawWrapped(ctx, q.question, pad, qTop, cw,
    `bold ${sx(58, W)}px system-ui,sans-serif`, rgb(PAL.text), sy(12, H));

  const divY = qBot + sy(40, H);
  hline(ctx, pad, W - pad, divY, rgb(PAL.accent), sx(3, W));

  const optTop = divY + sy(50, H);
  const optH   = sy(110, H), optGap = sy(26, H);
  const circR  = sx(34, W);
  const LABELS = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < Math.min(q.options.length, 4); i++) {
    const oy = optTop + i * (optH + optGap);
    fillRR(ctx, pad, oy, cw, optH, sx(24, W), 'rgba(255,255,255,0.07)');

    const cxC = pad + sx(20, W) + circR, cyC = oy + optH / 2;
    fillCircle(ctx, cxC, cyC, circR, rgb(PAL.accent));

    ctx.fillStyle = rgb(PAL.text);
    ctx.font = `bold ${sx(44, W)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxC, cyC);

    ctx.font = `${sx(50, W)}px system-ui,sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(q.options[i], cxC + circR + sx(24, W), cyC);
  }

  ctx.restore();
}

function drawThinkSlide(ctx, q, qNum, total) {
  drawQuestionSlide(ctx, q, qNum, total);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2, midY = H / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  ctx.font = `${sx(120, W)}px system-ui,sans-serif`;
  ctx.fillText('🤔', cx, midY - sy(60, H));

  ctx.font = `bold ${sx(100, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.text);
  ctx.fillText('Think…', cx, midY + sy(80, H));

  ctx.font = `${sx(50, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.muted);
  ctx.fillText("What's your answer?", cx, midY + sy(180, H));

  ctx.restore();
}

function drawAnswerSlide(ctx, q, qNum, total) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pad = sx(80, W), cw = W - 2 * pad, cx = W / 2;
  drawBg(ctx);
  ctx.save();

  const bannerH = sy(120, H);
  ctx.fillStyle = rgb(PAL.correct);
  ctx.fillRect(0, 0, W, bannerH);
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.font = `bold ${sx(40, W)}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✓  CORRECT ANSWER', cx, bannerH / 2);

  ctx.fillStyle = rgb(PAL.muted);
  ctx.font = `${sx(36, W)}px system-ui,sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`Q${qNum}/${total}`, pad, bannerH + sy(40, H));

  const qTop = bannerH + sy(100, H);
  const qBot = drawWrapped(ctx, q.question, pad, qTop, cw,
    `bold ${sx(50, W)}px system-ui,sans-serif`, rgb(PAL.text), sy(10, H));

  const optTop = qBot + sy(50, H);
  const optH   = sy(100, H), optGap = sy(20, H);
  const circR  = sx(30, W);
  const LABELS = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < Math.min(q.options.length, 4); i++) {
    const isCorrect = i === q.correct_option;
    const oy = optTop + i * (optH + optGap);
    fillRR(ctx, pad, oy, cw, optH, sx(24, W),
      isCorrect ? rgba(PAL.correct, 0.85) : 'rgba(255,255,255,0.08)');

    const cxC = pad + sx(18, W) + circR, cyC = oy + optH / 2;
    fillCircle(ctx, cxC, cyC, circR,
      isCorrect ? 'rgb(255,255,255)' : rgb(PAL.accent));

    ctx.fillStyle = isCorrect ? rgb(PAL.correct) : rgb(PAL.text);
    ctx.font = `bold ${sx(44, W)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxC, cyC);

    ctx.fillStyle = isCorrect ? 'rgb(255,255,255)' : rgb(PAL.muted);
    ctx.font = `${sx(46, W)}px system-ui,sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(q.options[i], cxC + circR + sx(20, W), cyC);

    if (isCorrect) {
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = `bold ${sx(44, W)}px system-ui,sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText('✓', W - pad - sx(20, W), cyC);
    }
  }

  if (q.explanation) {
    const explBaseY = optTop + 4 * (optH + optGap);
    const explLineY = explBaseY + sy(40, H);
    hline(ctx, pad, W - pad, explLineY, rgb(PAL.muted), sx(2, W));
    drawWrapped(ctx, `💡 ${q.explanation}`, pad, explLineY + sy(30, H), cw,
      `${sx(34, W)}px system-ui,sans-serif`, rgb(PAL.muted), sy(8, H));
  }

  ctx.restore();
}

function drawOutroSlide(ctx, title) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  drawBg(ctx);
  ctx.save();

  const cx = W / 2, midY = H / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  ctx.font = `${sx(120, W)}px system-ui,sans-serif`;
  ctx.fillText('🎉', cx, midY - sy(200, H));

  ctx.font = `bold ${sx(72, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.text);
  ctx.fillText("That's a wrap!", cx, midY - sy(80, H));

  ctx.font = `bold ${sx(48, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.accent);
  ctx.fillText(title, cx, midY + sy(40, H));

  ctx.font = `${sx(40, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.muted);
  ctx.fillText('Like & Subscribe for more!', cx, midY + sy(160, H));

  ctx.font = `${sx(60, W)}px system-ui,sans-serif`;
  ctx.fillStyle = rgb(PAL.text);
  ctx.fillText('👍  🔔  📲', cx, midY + sy(250, H));

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════
   SLIDE PIPELINE  →  [{ bitmap, duration }, ...]
   ═══════════════════════════════════════════════════════════ */

/**
 * Render every slide to ImageBitmaps, yielding between each one so
 * the browser stays responsive even on low-spec mobile devices.
 *
 * @param {object} quiz   - { title, questions: [{question, options, correct_option, explanation?}] }
 * @param {object} cfg    - { question_duration, think_duration, answer_duration, quality }
 * @param {function} onProgress - (fraction 0‥1, label) called after each slide
 * @returns {Promise<Array<{bitmap: ImageBitmap, duration: number}>>}
 */
export async function buildSlides(quiz, cfg, onProgress) {
  const { w, h } = RESOLUTIONS[cfg.quality] ?? RESOLUTIONS.hd;

  let offscreen;
  if (typeof OffscreenCanvas !== 'undefined') {
    offscreen = new OffscreenCanvas(w, h);
  } else {
    offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
  }
  const ctx = offscreen.getContext('2d');

  const slideData = [];
  const totalSlides = 2 + quiz.questions.length * SLIDES_PER_QUESTION;
  let rendered = 0;

  async function capture(drawFn, duration) {
    drawFn(ctx);
    const bitmap = await createImageBitmap(offscreen);
    slideData.push({ bitmap, duration });
    rendered++;
    onProgress(rendered / totalSlides, `Rendering slide ${rendered} of ${totalSlides}…`);
    await new Promise(r => setTimeout(r, 0)); // yield to keep UI alive
  }

  await capture(c => drawIntroSlide(c, quiz.title, quiz.questions.length), cfg.question_duration);

  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i], qNum = i + 1, total = quiz.questions.length;
    await capture(c => drawQuestionSlide(c, q, qNum, total), cfg.question_duration);
    await capture(c => drawThinkSlide(c, q, qNum, total),    cfg.think_duration);
    await capture(c => drawAnswerSlide(c, q, qNum, total),   cfg.answer_duration);
  }

  await capture(c => drawOutroSlide(c, quiz.title), cfg.question_duration);

  return slideData;
}

/* ═══════════════════════════════════════════════════════════
   MP4 ENCODING  via VideoEncoder + mp4-muxer
   Returns an ArrayBuffer of the finished MP4.
   ═══════════════════════════════════════════════════════════ */

/**
 * @param {Array<{bitmap: ImageBitmap, duration: number}>} slideData
 * @param {{ w: number, h: number }} res
 * @param {function} onProgress
 * @param {string} [quality='hd']  'hd' | 'fast' — used to select bitrate
 * @returns {Promise<ArrayBuffer>}
 */
export async function encodeMP4(slideData, res, onProgress, quality = 'hd') {
  const { w, h } = res;
  const FPS = 30;
  const frameDurationUs = Math.round(1_000_000 / FPS);

  /* mp4-muxer is an npm package — import dynamically so it's only
     loaded when video generation actually starts (not during SSR). */
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const totalFrames = slideData.reduce((s, d) => s + Math.round(d.duration * FPS), 0);
  let encodedFrames = 0;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h, frameRate: FPS },
    fastStart: 'in-memory',
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });

  /* Bitrate by quality setting: HD gets higher bitrate than fast/preview */
  const bitrate = quality === 'hd' ? 2_500_000 : 800_000;

  /* Try H.264 High → Main → Baseline so even older mobile browsers work */
  const codecCandidates = [
    'avc1.640028', // High L4.0 — 1080p
    'avc1.4d0028', // Main L4.0
    'avc1.42001f', // Baseline L3.1
  ];
  let configured = false;
  for (const codec of codecCandidates) {
    const encoderCfg = { codec, width: w, height: h, bitrate, framerate: FPS };
    const support = await VideoEncoder.isConfigSupported(encoderCfg);
    if (support.supported) {
      encoder.configure(encoderCfg);
      configured = true;
      break;
    }
  }
  if (!configured) throw new Error('No supported H.264 codec profile found.');

  let currentTs = 0;

  for (const { bitmap, duration } of slideData) {
    const nFrames = Math.round(duration * FPS);
    for (let f = 0; f < nFrames; f++) {
      if (encodeError) throw encodeError;

      const frame = new VideoFrame(bitmap, { timestamp: currentTs, duration: frameDurationUs });
      encoder.encode(frame, { keyFrame: f === 0 });
      frame.close();
      currentTs += frameDurationUs;
      encodedFrames++;

      /* Yield every 30 frames to keep the browser responsive on mobile */
      if (encodedFrames % 30 === 0) {
        onProgress(
          encodedFrames / totalFrames,
          `Encoding… ${Math.round(encodedFrames / totalFrames * 100)}%`,
        );
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  await encoder.flush();
  if (encodeError) throw encodeError;
  muxer.finalize();

  for (const { bitmap } of slideData) bitmap.close();

  return target.buffer;
}

/* ═══════════════════════════════════════════════════════════
   MEDIARECORDER FALLBACK  →  Blob (WebM or MP4)
   Used when VideoEncoder is unavailable (older browsers).
   ═══════════════════════════════════════════════════════════ */

/**
 * @param {Array<{bitmap: ImageBitmap, duration: number}>} slideData
 * @param {{ w: number, h: number }} res
 * @param {function} onProgress
 * @returns {Promise<Blob>}
 */
export async function encodeMediaRecorder(slideData, res, onProgress) {
  const { w, h } = res;
  const FPS = 30;

  const mimeTypes = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(0);
  const track  = stream.getVideoTracks()[0];

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onerror = e => reject(e.error ?? new Error('MediaRecorder error'));

    recorder.onstop = () => {
      for (const { bitmap } of slideData) bitmap.close();
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
    };

    recorder.start();

    let slideIdx = 0, frame = 0;
    const totalFrames = slideData.reduce((s, d) => s + Math.round(d.duration * FPS), 0);
    let totalDone = 0;
    const frameDurationMs = 1000 / FPS;

    const drawNextFrame = () => {
      if (slideIdx >= slideData.length) { recorder.stop(); return; }

      const { bitmap, duration } = slideData[slideIdx];
      const nFrames = Math.round(duration * FPS);

      ctx.drawImage(bitmap, 0, 0);
      track.requestFrame();

      frame++; totalDone++;
      onProgress(
        totalDone / totalFrames,
        `Encoding… ${Math.round(totalDone / totalFrames * 100)}%`,
      );

      if (frame >= nFrames) { slideIdx++; frame = 0; }

      if (slideIdx < slideData.length) {
        setTimeout(drawNextFrame, frameDurationMs);
      } else {
        setTimeout(() => recorder.stop(), frameDurationMs * 2);
      }
    };

    drawNextFrame();
  });
}

/* ═══════════════════════════════════════════════════════════
   QUIZ VALIDATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Validate a quiz object, throwing a descriptive Error on any problem.
 * @param {object} quiz
 */
export function validateQuiz(quiz) {
  if (!quiz.title) quiz.title = 'MCQ Quiz';
  if (!Array.isArray(quiz.questions) || quiz.questions.length < 1)
    throw new Error('Quiz must have at least one question.');
  if (quiz.questions.length > MAX_QUESTIONS)
    throw new Error(`Quiz can have at most ${MAX_QUESTIONS} questions.`);
  for (const [i, q] of quiz.questions.entries()) {
    if (!q.question?.trim())
      throw new Error(`Question ${i + 1} text is empty.`);
    if (!Array.isArray(q.options) || q.options.length !== 4)
      throw new Error(`Question ${i + 1} must have exactly 4 options.`);
    if (typeof q.correct_option !== 'number' || q.correct_option < 0 || q.correct_option > 3)
      throw new Error(`Question ${i + 1}: correct_option must be 0–3.`);
  }
}
