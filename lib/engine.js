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
// Design constants (premium dark theme)
// ---------------------------------------------------------------------------
const W = 1080;
const H = 1920;
const PAD = 80;

const BG_TOP    = [1,   1,   1];   // #010101
const BG_BOTTOM = [18,  14,  28];  // deep near-black with a hint of blue-purple
const ACCENT    = '#D4AF37';       // gold – premium feel
const CORRECT   = '#22C55E';       // vivid green
const WRONG     = '#EF4444';       // vivid red
const TEXT      = '#F5F0E8';       // cream
const MUTED     = '#A89F94';       // muted cream/taupe
const OPTION_COLORS = ['#D4AF37', '#3B82F6', '#F97316', '#A855F7']; // A=gold, B=blue, C=orange, D=purple

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Draw a vertical gradient background onto ctx. */
function drawGradient(ctx) {
  // Deep near-black base
  ctx.fillStyle = `rgb(${BG_TOP.join(',')})`;
  ctx.fillRect(0, 0, W, H);
  // Subtle radial glow in the centre for depth
  const radial = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, H * 0.55);
  radial.addColorStop(0, 'rgba(212,175,55,0.08)');  // faint gold glow
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);
  // Bottom fade to near-black
  const grad = ctx.createLinearGradient(0, H * 0.7, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgb(${BG_BOTTOM.join(',')})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** Draw a rounded rectangle. */
function roundRect(ctx, x, y, w, h, radius, fillStyle, strokeStyle, lineWidth) {
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
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
  }
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

/**
 * Measure wrapped text height without drawing; returns total pixel height.
 */
function measureWrappedText(ctx, text, font, maxWidth, lineHeight = 1.3) {
  ctx.font = font;
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  const fontSize = parseInt(font, 10);
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
  return lines * Math.round(fontSize * lineHeight);
}

const LABELS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Slide renderers  (each returns void; draws onto ctx)
// ---------------------------------------------------------------------------

function renderIntro(ctx, title, totalQuestions) {
  drawGradient(ctx);

  const cx = W / 2;
  const midY = H / 2 - 120;

  // Gold top accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, midY - 220, W - 2 * PAD, 6);

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  drawWrappedText(ctx, title, PAD, midY - 180, 'bold 76px sans-serif', TEXT, W - 2 * PAD, 1.25);

  // Sub-text
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = ACCENT;
  ctx.fillText(`${totalQuestions} Questions`, cx, midY + 60);

  // Gold bottom accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, H - PAD - 6, W - 2 * PAD, 6);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderQuestion(ctx, question, qNum, total) {
  drawGradient(ctx);

  const cx = W / 2;
  const contentW = W - 2 * PAD;

  // Counter pill
  const pillText = `Q${qNum} of ${total}`;
  const pillW = 280, pillH = 68;
  const pillX = (W - pillW) / 2, pillY = 110;
  roundRect(ctx, pillX, pillY, pillW, pillH, 34, null, ACCENT, 3);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, cx, pillY + pillH / 2);

  // Question text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const qTop = pillY + pillH + 60;
  const qBottom = drawWrappedText(ctx, question.question, PAD, qTop, 'bold 56px sans-serif', TEXT, contentW, 1.3);

  // Thin gold divider
  const divY = qBottom + 36;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // "Choose your answer" label
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('CHOOSE YOUR ANSWER', PAD, divY + 20);

  // Options – dynamically sized to fit
  const optFontSize = 42;
  const optFont = `${optFontSize}px sans-serif`;
  const labelR = 36;
  const labelDiam = labelR * 2;
  const textX = PAD + labelDiam + 32;
  const optTextW = contentW - labelDiam - 32 - 16;
  const optGap = 22;

  // Pre-measure option text heights so boxes fit content
  const optionHeights = question.options.map((text) => {
    const textH = measureWrappedText(ctx, text, optFont, optTextW, 1.3);
    return Math.max(labelDiam + 20, textH + 36);
  });

  let optY = divY + 72;

  question.options.forEach((text, i) => {
    const oh = optionHeights[i];
    const oy0 = optY;
    const cyc = oy0 + oh / 2;
    const cxc = PAD + labelR;

    // Option card – cream border, near-transparent fill
    roundRect(ctx, PAD, oy0, contentW, oh, 22, 'rgba(245,240,232,0.06)', OPTION_COLORS[i], 2);

    // Label circle with per-option colour
    ctx.beginPath();
    ctx.arc(cxc, cyc, labelR, 0, Math.PI * 2);
    ctx.fillStyle = OPTION_COLORS[i];
    ctx.fill();

    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#010101';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxc, cyc);

    // Option text (wrapped, cream)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, text, textX, oy0 + 18, optFont, TEXT, optTextW, 1.3);

    optY += oh + optGap;
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

  // Answer banner – green top strip
  const bannerH = 128;
  ctx.fillStyle = CORRECT;
  ctx.fillRect(0, 0, W, bannerH);
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#010101';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓  CORRECT ANSWER', cx, bannerH / 2);

  // Question number chip
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Q${qNum} / ${total}`, PAD, bannerH + 28);

  // Question text
  const qBottom = drawWrappedText(ctx, question.question, PAD, bannerH + 78, 'bold 50px sans-serif', TEXT, contentW, 1.25);

  // Options – dynamically sized
  const optFontSize = 40;
  const optFont = `${optFontSize}px sans-serif`;
  const labelR = 32;
  const labelDiam = labelR * 2;
  const textX = PAD + labelDiam + 28;
  const optTextW = contentW - labelDiam - 28 - 48; // leave space for ✓ icon on right
  const optGap = 18;

  const optionHeights = question.options.map((text) => {
    const textH = measureWrappedText(ctx, text, optFont, optTextW, 1.3);
    return Math.max(labelDiam + 20, textH + 32);
  });

  let optY = qBottom + 44;

  question.options.forEach((text, i) => {
    const isCorrect = i === question.correctOption;
    const oh = optionHeights[i];
    const oy0 = optY;
    const cyc = oy0 + oh / 2;
    const cxc = PAD + labelR;

    // Card fill: green tint for correct, red tint for wrong
    const cardFill = isCorrect ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.10)';
    const cardBorder = isCorrect ? CORRECT : WRONG;
    roundRect(ctx, PAD, oy0, contentW, oh, 22, cardFill, cardBorder, isCorrect ? 3 : 1.5);

    // Label circle
    ctx.beginPath();
    ctx.arc(cxc, cyc, labelR, 0, Math.PI * 2);
    ctx.fillStyle = isCorrect ? CORRECT : WRONG;
    ctx.fill();

    ctx.font = 'bold 38px sans-serif';
    ctx.fillStyle = '#010101';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[i], cxc, cyc);

    // Option text (wrapped)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, text, textX, oy0 + 16, optFont, isCorrect ? TEXT : MUTED, optTextW, 1.3);

    // Correct tick
    if (isCorrect) {
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = CORRECT;
      ctx.fillText('✓', W - PAD - 8, cyc);
    }

    optY += oh + optGap;
  });

  // Explanation
  if (question.explanation) {
    const explY = optY + 24;
    // Thin gold rule
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, explY);
    ctx.lineTo(W - PAD, explY);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, `💡 ${question.explanation}`, PAD, explY + 28, '34px sans-serif', MUTED, contentW, 1.3);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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
  ctx.fillStyle = '#010101';
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
    roundRect(ctx, PAD, y + 8, contentW, ANSWER_KEY_ROW_H - 16, 20, 'rgba(245,240,232,0.06)', 'rgba(245,240,232,0.15)', 1);

    // Question number
    ctx.font = 'bold 38px sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(`Q${globalIdx + 1}.`, PAD + 20, midY);

    // Correct answer label circle (gold)
    const labelX = PAD + 130;
    ctx.beginPath();
    ctx.arc(labelX, midY, 30, 0, Math.PI * 2);
    ctx.fillStyle = CORRECT;
    ctx.fill();
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#010101';
    ctx.textAlign = 'center';
    ctx.fillText(LABELS[q.correctOption], labelX, midY);

    // Answer text
    ctx.textAlign = 'left';
    ctx.font = '36px sans-serif';
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

  ctx.font = 'bold 80px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('🎉', cx, midY - 220);

  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText("That's a wrap!", cx, midY - 80);

  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = ACCENT;
  ctx.fillText(title, cx, midY + 40);

  ctx.font = '40px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText('Like & Subscribe for more!', cx, midY + 160);

  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.fillText('👍  🔔  📲', cx, midY + 250);

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
