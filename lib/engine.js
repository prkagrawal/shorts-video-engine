/**
 * lib/engine.js
 *
 * Pure-JS, client-side Shorts video engine.
 * Renders quiz slides on an OffscreenCanvas (1080×1920) and encodes them to
 * an MP4 file via the WebCodecs VideoEncoder + mp4-muxer.
 *
 * Exported API
 * ------------
 *   generateVideo(quiz, config, onProgress) → Promise<Blob>
 *
 * quiz    – { title, questions: [{ question, options, correctOption, explanation }], hashtags }
 * config  – { fps, questionDuration, thinkDuration, answerDuration }
 * onProgress – optional callback(fraction 0–1)
 */

// ---------------------------------------------------------------------------
// Design constants (mirror Python config.py)
// ---------------------------------------------------------------------------
const W = 1080;
const H = 1920;
const PAD = 80;

const BG_TOP    = [15,  12,  41];
const BG_BOTTOM = [48,  43,  99];
const ACCENT    = '#6c5ce7';
const CORRECT   = '#00b894';
const TEXT      = '#ffffff';
const MUTED     = '#b2bec3';

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Draw a vertical gradient background onto ctx. */
function drawGradient(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${BG_TOP.join(',')})`);
  grad.addColorStop(1, `rgb(${BG_BOTTOM.join(',')})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** Draw a rounded rectangle. */
function roundRect(ctx, x, y, w, h, radius, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

/**
 * Wrap text and draw it; returns the y coordinate just below the last line.
 */
function drawWrappedText(ctx, text, x, y, font, color, maxWidth, lineHeight = 1.3) {
  ctx.font = font;
  ctx.fillStyle = color;
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  const fontSize = parseInt(font, 10);

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += Math.round(fontSize * lineHeight);
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += Math.round(fontSize * lineHeight);
  }
  return currentY;
}

const LABELS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Slide renderers  (each returns void; draws onto ctx)
// ---------------------------------------------------------------------------

function renderIntro(ctx, title, totalQuestions) {
  drawGradient(ctx);

  const cx = W / 2;
  const midY = H / 2 - 120;

  // Top accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, midY - 220, W - 2 * PAD, 12);

  // Title
  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  drawWrappedText(ctx, title, PAD, midY - 180, 'bold 72px sans-serif', TEXT, W - 2 * PAD, 1.25);

  // Sub-text
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(`${totalQuestions} Questions`, cx, midY + 60);

  // Bottom accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, H - PAD - 12, W - 2 * PAD, 12);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderQuestion(ctx, question, qNum, total) {
  drawGradient(ctx);

  const cx = W / 2;
  const contentW = W - 2 * PAD;

  // Counter pill
  const pillText = `Q${qNum} of ${total}`;
  const pillW = 260, pillH = 64;
  const pillX = (W - pillW) / 2, pillY = 120;
  roundRect(ctx, pillX, pillY, pillW, pillH, 32, ACCENT);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, cx, pillY + pillH / 2);

  // Question text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const qTop = pillY + pillH + 60;
  const qBottom = drawWrappedText(ctx, question.question, PAD, qTop, 'bold 58px sans-serif', TEXT, contentW, 1.3);

  // Divider
  const divY = qBottom + 40;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // Options
  const optionH = 110, optionGap = 26;
  let optY = divY + 50;

  question.options.forEach((text, i) => {
    const ox0 = PAD, oy0 = optY + i * (optionH + optionGap);
    const oy1 = oy0 + optionH;
    const cxc = ox0 + 20 + 34, cyc = (oy0 + oy1) / 2;

    roundRect(ctx, ox0, oy0, W - 2 * PAD, optionH, 24, 'rgba(255,255,255,0.12)');

    // Label circle
    ctx.beginPath();
    ctx.arc(cxc, cyc, 34, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();

    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxc, cyc);

    // Option text
    ctx.font = '50px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, cxc + 34 + 24, cyc);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderThink(ctx, question, qNum, total) {
  // Show the question + options for extra reading time (no overlay)
  renderQuestion(ctx, question, qNum, total);
}

function renderAnswer(ctx, question, qNum, total) {
  drawGradient(ctx);

  const cx = W / 2;
  const contentW = W - 2 * PAD;

  // Answer banner
  ctx.fillStyle = CORRECT;
  ctx.fillRect(0, 0, W, 120);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓  CORRECT ANSWER', cx, 60);

  // Question number
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Q${qNum}/${total}`, PAD, 160);

  // Question text
  const qBottom = drawWrappedText(ctx, question.question, PAD, 220, 'bold 50px sans-serif', TEXT, contentW, 1.25);

  // Options
  const optionH = 100, optionGap = 20;
  let optY = qBottom + 50;

  question.options.forEach((text, i) => {
    const isCorrect = i === question.correctOption;
    const ox0 = PAD, oy0 = optY + i * (optionH + optionGap);
    const oy1 = oy0 + optionH;
    const cxc = ox0 + 18 + 30, cyc = (oy0 + oy1) / 2;

    roundRect(ctx, ox0, oy0, W - 2 * PAD, optionH, 24,
      isCorrect ? 'rgba(0,184,148,0.85)' : 'rgba(255,255,255,0.08)');

    // Label circle
    ctx.beginPath();
    ctx.arc(cxc, cyc, 30, 0, Math.PI * 2);
    ctx.fillStyle = isCorrect ? '#ffffff' : ACCENT;
    ctx.fill();

    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = isCorrect ? CORRECT : TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxc, cyc);

    ctx.font = '46px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = isCorrect ? '#ffffff' : MUTED;
    ctx.fillText(text, cxc + 30 + 20, cyc);

    if (isCorrect) {
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('✓', W - PAD, cyc);
    }
  });

  // Explanation
  if (question.explanation) {
    const explY = optY + 4 * (optionH + optionGap) + 40;
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, explY);
    ctx.lineTo(W - PAD, explY);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, `💡 ${question.explanation}`, PAD, explY + 30, '34px sans-serif', MUTED, contentW, 1.3);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderAnswerKey(ctx, questions, pageIndex, totalPages) {
  drawGradient(ctx);

  const cx = W / 2;
  const contentW = W - 2 * PAD;

  // Header banner
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 120);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerText = totalPages > 1
    ? `📋  ANSWER KEY  (${pageIndex + 1}/${totalPages})`
    : '📋  ANSWER KEY';
  ctx.fillText(headerText, cx, 60);

  // List answers
  const startY = 180;
  const rowH = 140;
  const maxPerPage = Math.floor((H - startY - 100) / rowH);
  const startIdx = pageIndex * maxPerPage;
  const pageQuestions = questions.slice(startIdx, startIdx + maxPerPage);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  pageQuestions.forEach((q, i) => {
    const globalIdx = startIdx + i;
    const y = startY + i * rowH;
    const midY = y + rowH / 2;

    // Row background
    roundRect(ctx, PAD, y + 8, contentW, rowH - 16, 20, 'rgba(255,255,255,0.08)');

    // Question number
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(`Q${globalIdx + 1}.`, PAD + 20, midY);

    // Correct answer label circle
    const labelX = PAD + 130;
    ctx.beginPath();
    ctx.arc(labelX, midY, 30, 0, Math.PI * 2);
    ctx.fillStyle = CORRECT;
    ctx.fill();
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(LABELS[q.correctOption], labelX, midY);

    // Answer text
    ctx.textAlign = 'left';
    ctx.font = '38px sans-serif';
    ctx.fillStyle = TEXT;
    const ansText = q.options[q.correctOption];
    ctx.fillText(ansText, labelX + 50, midY);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderOutro(ctx, title) {
  drawGradient(ctx);

  const cx = W / 2, midY = H / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('🎉', cx, midY - 200);
  ctx.fillText("That's a wrap!", cx, midY - 80);

  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = ACCENT;
  ctx.fillText(title, cx, midY + 40);

  ctx.font = '40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText('Like & Subscribe for more!', cx, midY + 160);

  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('👍  🔔  📲', cx, midY + 240);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------------------
// Video encoding
// ---------------------------------------------------------------------------

/**
 * Encode a single canvas frame and add it to the muxer.
 */
async function encodeFrame(canvas, encoder, timestamp) {
  const frame = new VideoFrame(canvas, { timestamp });
  encoder.encode(frame);
  frame.close();
}

/**
 * Generate a segment of `durationSecs` at the given fps by repeating `renderFn`.
 * Returns the next timestamp (µs).
 */
async function addSegment(canvas, ctx, renderFn, durationSecs, fps, encoder, startTimestamp) {
  const totalFrames = Math.round(durationSecs * fps);
  const frameDuration = 1_000_000 / fps; // µs per frame
  renderFn(ctx);
  for (let f = 0; f < totalFrames; f++) {
    await encodeFrame(canvas, encoder, startTimestamp + f * frameDuration);
  }
  return startTimestamp + totalFrames * frameDuration;
}

/**
 * Main API: generate an MP4 Blob from the given quiz data.
 *
 * @param {object} quiz - { title, questions, hashtags }
 * @param {object} config - { fps, questionDuration, thinkDuration, answerDuration }
 * @param {function} [onProgress] - called with a value 0–1
 * @returns {Promise<Blob>}
 */
export async function generateVideo(quiz, config, onProgress) {
  const {
    fps = 30,
    questionDuration = 4,
    thinkDuration = 3,
    answerDuration = 3.5,
    introDuration = 2,
    outroDuration = 3,
  } = config;

  // Dynamic import so this only runs in the browser
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: W,
      height: H,
    },
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error', e),
  });

  encoder.configure({
    codec: 'avc1.4D0028',
    width: W,
    height: H,
    bitrate: 4_000_000,
    framerate: fps,
  });

  // Count total segments for progress reporting
  // Calculate answer key pages
  const maxPerPage = Math.floor((H - 180 - 100) / 140);
  const answerKeyPages = Math.ceil(quiz.questions.length / maxPerPage);
  const totalSegments = 1 + quiz.questions.length * 3 + answerKeyPages + 1; // intro + (q+think+answer)*n + answer key + outro
  let doneSegments = 0;
  const progress = () => {
    doneSegments++;
    onProgress?.(doneSegments / totalSegments);
  };

  let ts = 0;

  // Intro
  ts = await addSegment(canvas, ctx, (c) => renderIntro(c, quiz.title, quiz.questions.length),
    introDuration, fps, encoder, ts);
  progress();

  // Questions
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    const qNum = i + 1;
    const total = quiz.questions.length;

    ts = await addSegment(canvas, ctx, (c) => renderQuestion(c, q, qNum, total),
      questionDuration, fps, encoder, ts);
    progress();

    ts = await addSegment(canvas, ctx, (c) => renderThink(c, q, qNum, total),
      thinkDuration, fps, encoder, ts);
    progress();

    ts = await addSegment(canvas, ctx, (c) => renderAnswer(c, q, qNum, total),
      answerDuration, fps, encoder, ts);
    progress();
  }

  // Answer key
  const answerKeyDuration = answerDuration;
  for (let p = 0; p < answerKeyPages; p++) {
    ts = await addSegment(canvas, ctx,
      (c) => renderAnswerKey(c, quiz.questions, p, answerKeyPages),
      answerKeyDuration, fps, encoder, ts);
    progress();
  }

  // Outro
  ts = await addSegment(canvas, ctx, (c) => renderOutro(c, quiz.title),
    outroDuration, fps, encoder, ts);
  progress();

  await encoder.flush();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
}
