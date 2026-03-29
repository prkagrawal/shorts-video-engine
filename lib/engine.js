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

const BG_TOP    = [1, 1, 1];
const BG_BOTTOM = [1, 1, 1];
const ACCENT    = '#6c5ce7';
const CORRECT   = '#00b894';
const TEXT      = '#efefef';
const MUTED     = '#b2bec3';

const OPTION_COLORS = ['#a29bfe', '#74b9ff', '#fd79a8', '#fdcb6e'];

// Branding defaults
const WATERMARK_TEXT  = 'apnatestprep.com';
const WATERMARK_ALPHA = 0.15;  // ~15 % opacity
const BANNER_TEXT     = '📚 Full Notes + Free Mock | apnatestprep.com';
const PROMO_BANNER_H  = 80;
const BANNER_PAD      = 20;  // horizontal padding inside the banner

// Dynamic-timing defaults
const READING_WPM          = 200;
const MIN_QUESTION_DURATION = 2.5;
const MAX_QUESTION_DURATION = 6.0;
const MIN_ANSWER_DURATION   = 2.0;
const MAX_ANSWER_DURATION   = 4.0;
const DYNAMIC_THINK_DURATION = 1.5;

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
  ctx.textAlign = 'left';
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  const match = font.match(/(\d+)px/);
  const fontSize = match ? parseInt(match[1], 10) : 16;

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

/**
 * Measure the pixel height that wrapped text will occupy, without drawing.
 * Returns the total height (px) of all rendered lines.
 */
function measureWrappedText(ctx, text, font, maxWidth, lineHeight = 1.3) {
  ctx.font = font;
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  const match = font.match(/(\d+)px/);
  const fontSize = match ? parseInt(match[1], 10) : 16;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines++;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines++;
  return Math.round(fontSize * lineHeight) * lines;
}

const LABELS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Dynamic timing helpers
// ---------------------------------------------------------------------------

function wordCount(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function computeQuestionDuration(question) {
  // Only count question text words — options are short labels viewers scan quickly
  const words = wordCount(question.question);
  const raw = (words / READING_WPM) * 60;
  return Math.max(MIN_QUESTION_DURATION, Math.min(raw, MAX_QUESTION_DURATION));
}

function computeAnswerDuration(question) {
  let text = question.options[question.correctOption] || '';
  if (question.explanation) text += ' ' + question.explanation;
  const raw = (wordCount(text) / READING_WPM) * 60;
  return Math.max(MIN_ANSWER_DURATION, Math.min(raw, MAX_ANSWER_DURATION));
}

// ---------------------------------------------------------------------------
// Branding helpers
// ---------------------------------------------------------------------------

/** Draw a bold, low-opacity diagonal watermark. */
function drawWatermark(ctx) {
  ctx.save();
  ctx.globalAlpha = WATERMARK_ALPHA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Scale font so the text fits within ~80% of canvas width
  const maxW = W * 0.8;
  let size = 72;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(WATERMARK_TEXT).width > maxW && size > 20) {
    size -= 2;
    ctx.font = `bold ${size}px sans-serif`;
  }
  ctx.fillStyle = '#ffffff';
  // Rotate -30° (diagonal, bottom-left to top-right) around centre
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-30 * Math.PI / 180);
  ctx.fillText(WATERMARK_TEXT, 0, 0);
  ctx.restore();
}

/** Draw a semi-transparent promo banner at the bottom. */
function drawPromoBanner(ctx) {
  ctx.save();
  const bannerY = H - PROMO_BANNER_H;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, bannerY, W, PROMO_BANNER_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Scale font so text fits within canvas width (with padding each side)
  const maxW = W - 2 * BANNER_PAD;
  let size = 32;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(BANNER_TEXT).width > maxW && size > 14) {
    size -= 2;
    ctx.font = `bold ${size}px sans-serif`;
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText(BANNER_TEXT, W / 2, bannerY + PROMO_BANNER_H / 2);
  ctx.restore();
}

/** Apply watermark + promo banner after the slide content is drawn. */
function applyBranding(ctx) {
  drawWatermark(ctx);
  drawPromoBanner(ctx);
}

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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawWrappedText(ctx, title, PAD, midY - 180, 'bold 72px sans-serif', TEXT, W - 2 * PAD, 1.25);

  // Sub-text
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.fillText(`${totalQuestions} Questions`, cx, midY + 60);

  // Bottom accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, H - PAD - 12, W - 2 * PAD, 12);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  applyBranding(ctx);
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

  applyBranding(ctx);
}

function renderThink(ctx, question, qNum, total) {
  // Show the question + options for extra reading time (no overlay)
  renderQuestion(ctx, question, qNum, total);
}

function renderAnswer(ctx, question, qNum, total) {
  // The correct answer is only revealed in the answer key at the end.
  // During the answer phase we show the same question + options view.
  renderQuestion(ctx, question, qNum, total);
}


const ANSWER_KEY_BANNER_H = 120;
const ANSWER_KEY_START_Y = 180;
const ANSWER_KEY_ROW_H = 140;
const ANSWER_KEY_BOTTOM_PAD = 100;

function renderAnswerKey(ctx, questions, pageIndex, totalPages) {
  drawGradient(ctx);

  const cx = W / 2;
  const contentW = W - 2 * PAD;

  // Header banner
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, ANSWER_KEY_BANNER_H);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerText = totalPages > 1
    ? `📋  ANSWER KEY  (${pageIndex + 1}/${totalPages})`
    : '📋  ANSWER KEY';
  ctx.fillText(headerText, cx, ANSWER_KEY_BANNER_H / 2);

  // List answers
  const maxPerPage = Math.floor((H - ANSWER_KEY_START_Y - ANSWER_KEY_BOTTOM_PAD) / ANSWER_KEY_ROW_H);
  const startIdx = pageIndex * maxPerPage;
  const pageQuestions = questions.slice(startIdx, startIdx + maxPerPage);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  pageQuestions.forEach((q, i) => {
    const globalIdx = startIdx + i;
    const y = ANSWER_KEY_START_Y + i * ANSWER_KEY_ROW_H;
    const midY = y + ANSWER_KEY_ROW_H / 2;

    // Row background
    roundRect(ctx, PAD, y + 8, contentW, ANSWER_KEY_ROW_H - 16, 20, 'rgba(255,255,255,0.08)');

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

  applyBranding(ctx);
}

/**
 * Render the outro slide.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number|null} score  – viewer's score (null if unknown / pre-rendered)
 * @param {number}      total  – total number of questions
 */
function renderOutro(ctx, score, total) {
  drawGradient(ctx);

  const cx = W / 2;
  const midY = H / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Celebration emoji
  ctx.font = 'bold 120px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('🎉', cx, midY - 380);

  // Heading
  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText("That's a wrap!", cx, midY - 230);

  // Score card pill
  const cardW = 500, cardH = 160;
  const cardX = cx - cardW / 2;
  const cardY = midY - 150;
  roundRect(ctx, cardX, cardY, cardW, cardH, 40, 'rgba(255,255,255,0.12)');

  const scoreLabel = score != null ? String(score) : '?';
  const totalLabel = String(total);
  ctx.font = 'bold 96px sans-serif';
  ctx.fillStyle = CORRECT;
  ctx.fillText(scoreLabel, cx - 55, cardY + cardH / 2);
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(`/ ${totalLabel}`, cx + 75, cardY + cardH / 2);

  // Call to action
  ctx.font = '40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText('Comment your score below! 👇', cx, midY + 60);

  ctx.font = '40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText('Like & Subscribe for more!', cx, midY + 160);

  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('👍  🔔  📲', cx, midY + 270);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  applyBranding(ctx);
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
  const maxPerPage = Math.floor((H - ANSWER_KEY_START_Y - ANSWER_KEY_BOTTOM_PAD) / ANSWER_KEY_ROW_H);
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

    // Dynamic per-question durations
    const qDuration = computeQuestionDuration(q);
    const tDuration = DYNAMIC_THINK_DURATION;
    const aDuration = computeAnswerDuration(q);

    ts = await addSegment(canvas, ctx, (c) => renderQuestion(c, q, qNum, total),
      qDuration, fps, encoder, ts);
    progress();

    ts = await addSegment(canvas, ctx, (c) => renderThink(c, q, qNum, total),
      tDuration, fps, encoder, ts);
    progress();

    ts = await addSegment(canvas, ctx, (c) => renderAnswer(c, q, qNum, total),
      aDuration, fps, encoder, ts);
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

  // Outro – score unknown in a pre-rendered video; show total so viewers can
  // gauge their result and comment below
  ts = await addSegment(canvas, ctx, (c) => renderOutro(c, null, quiz.questions.length),
    outroDuration, fps, encoder, ts);
  progress();

  await encoder.flush();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
}
