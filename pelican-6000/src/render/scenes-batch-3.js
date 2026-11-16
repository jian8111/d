// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG, SCENES_META } from '../data/scenes-meta.js';
import { drawGlyphText, measureGlyphText } from '../data/glyphs.js';
import { createSeededRng } from '../core/prng.js';
import {
  computePelicanKinematics, drawPelicanBicycleCanvas2D, getPelicanOutlinePoints,
} from './ik-pelican.js';

const TAU = Math.PI * 2;
const SIZE = 1000;
const ROAD = MV_TIMELINE_CONFIG.ROAD_EDGE_Y ?? 680;
const FEED_LEFT = 218.75, FEED_RIGHT = 781.25;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const fract = x => x - Math.floor(x);

function line(ctx, points, color, width = 1, close = false) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function poly(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function rect(ctx, x, y, w, h, fill, stroke) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); }
}

function label(ctx, text, x, y, size = 16, color = '#ffffff', align = 'left') {
  ctx.save();
  try {
    ctx.font = `${size}px monospace`; ctx.fillStyle = color;
    ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  } finally { ctx.restore(); }
}

function glyph(ctx, text, x, y, size = 18, color = '#25374b', align = 'left') {
  ctx.save();
  try {
    const measurement = measureGlyphText(text, size, 'sans');
    const width = finite(typeof measurement === 'number' ? measurement : measurement?.width);
    const offset = align === 'center' ? width / 2 : align === 'right' ? width : 0;
    ctx.fillStyle = color; ctx.strokeStyle = color;
    drawGlyphText(ctx, text, x - offset, y, size, { family: 'sans', color });
  } finally { ctx.restore(); }
}

function glow(ctx, color, blur, draw) {
  ctx.save();
  try { ctx.shadowColor = color; ctx.shadowBlur = blur; draw(); }
  finally { ctx.restore(); }
}

function stateOf(sceneCtx, index) {
  const meta = SCENES_META[index];
  const duration = meta.endT - meta.startT;
  const suppliedT = finite(sceneCtx.canonicalT, finite(sceneCtx.realT, meta.startT));
  const progress = clamp(finite(sceneCtx.sceneProgress, (suppliedT - meta.startT) / duration));
  return {
    ...sceneCtx, progress,
    t: finite(sceneCtx.canonicalT, meta.startT + progress * duration),
    localT: finite(sceneCtx.sceneLocalT, progress * duration),
    road: finite(sceneCtx.roadY, ROAD),
    beat: clamp(finite(sceneCtx.beatPulse)), iron: clamp(finite(sceneCtx.ironPulse)),
  };
}

function audioPeak(state, ...keys) {
  return clamp(Math.max(0, ...keys.map(key => finite(state.audio?.[key]))));
}

function pose(state, index, options = {}, x) {
  const kin = computePelicanKinematics(state.t, index, { roadY: state.road, ...options });
  // Kinematics uses an unscaled wheel radius for its default placement. Keep
  // smaller previews and pixel sprites grounded on the requested road baseline.
  kin.y += kin.wheelRadius * (1 - kin.scale);
  if (Number.isFinite(x)) kin.x = x;
  return kin;
}

function composite(ctx, state, bake) {
  if (state.bakedCanvas) ctx.drawImage(state.bakedCanvas, 0, 0, SIZE, SIZE);
  else bake(ctx, SCENES_META[state.index]);
}

function bevel(ctx, x, y, w, h, fill = '#d4d0c8', pressed = false) {
  rect(ctx, x, y, w, h, fill);
  line(ctx, [[x, y + h], [x, y], [x + w, y]], pressed ? '#69747d' : '#ffffff', 2);
  line(ctx, [[x + w, y], [x + w, y + h], [x, y + h]], pressed ? '#ffffff' : '#69747d', 2);
}

// The brush extension is optional. Isolate every extension call independently:
// a missing pen cannot prevent later strokes, nor leak p5 drawing state.
function brushCall(brush, method, ...args) {
  try { if (typeof brush?.[method] === 'function') return brush[method](...args); }
  catch { /* Some p5.brush builds omit an individual brush or renderer method. */ }
  return undefined;
}

function bakeBrushFor(index, p, brush, sceneDef) {
  if (!p || !brush) return;
  const rng = createSeededRng(`batch3-brush:${index}:${sceneDef?.seed ?? 6000}`);
  const colors = ['#7efcb1', '#f5cb50', '#477ab6', '#df8dcb', '#ff567b', '#8ad9d0'];
  const tools = ['pen', 'marker', 'HB', 'spray', 'spray', 'pen'];
  let pushed = false;
  try {
    if (typeof p.push === 'function') { p.push(); pushed = true; }
    p.randomSeed?.(6000 + index); p.noiseSeed?.(6000 + index);
    if (p._renderer?.isP3D) p.translate?.(-500, -500);
    brushCall(brush, 'set', tools[index - 14], colors[index - 14], index === 17 ? 0.7 : 0.35);
    brushCall(brush, 'noFill');
    const count = index === 15 || index === 16 ? 10 : 24;
    for (let i = 0; i < count; i++) {
      let x = rng.range(65, 935), y = rng.range(740, 920);
      if (index === 14) { x = rng.range(85, 915); y = rng.range(240, 735); }
      if (index === 15) { x = Math.round(x / 8) * 8; y = 714 + rng.int(0, 18) * 8; }
      if (index === 18) x = rng.range(FEED_LEFT + 35, FEED_RIGHT - 35);
      brushCall(brush, 'line', x, y, x + rng.range(4, 28), y + (index === 15 ? 0 : rng.range(-9, 9)));
    }
  } finally {
    brushCall(brush, 'noStroke');
    if (pushed) p.pop?.();
  }
}

function bakeScope(ctx) {
  rect(ctx, 0, 0, 1000, 1000, '#071c15');
  const screen = ctx.createRadialGradient(500, 450, 40, 500, 450, 640);
  screen.addColorStop(0, '#103d2b'); screen.addColorStop(1, '#03100b');
  rect(ctx, 42, 155, 916, 650, screen, '#346344');
  glow(ctx, '#7efcb1', 3, () => {
    // Ten divisions across, eight down, including the enclosing boundary.
    for (let col = 0; col <= 10; col++) {
      const x = 80 + col * 84;
      line(ctx, [[x, 210], [x, 770]], col === 5 ? '#427b56' : '#214a35', 1);
    }
    for (let row = 0; row <= 8; row++) {
      const y = 210 + row * 70;
      line(ctx, [[80, y], [920, y]], row === 4 ? '#427b56' : '#214a35', 1);
    }
  });
  for (let x = 80; x <= 920; x += 14) line(ctx, [[x, 486], [x, 494]], '#5b8b62');
  for (let y = 210; y <= 770; y += 14) line(ctx, [[496, y], [504, y]], '#5b8b62');
  label(ctx, 'TEK / P1     X–Y VECTOR DISPLAY', 52, 57, 20, '#a3dfb3');
  label(ctx, 'PHOSPHOR MEMORY / 15', 52, 91, 13, '#4d9066');
  label(ctx, 'DC COUPLED     1 ms / DIV', 500, 850, 14, '#78b68a', 'center');
  label(ctx, 'PERSISTENCE  ∞', 500, 932, 13, '#4d9066', 'center');
  for (let y = 160; y < 805; y += 4) rect(ctx, 43, y, 914, 1, '#00000015');
}

function knob(ctx, x, y, name, angle, value, pulse) {
  ellipse(ctx, x, y, 56, 56, '#0b2119', '#47785a', 2);
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * 0.7 + i * Math.PI * 1.6 / 12;
    line(ctx, [[x + Math.cos(a) * 43, y + Math.sin(a) * 43],
      [x + Math.cos(a) * 48, y + Math.sin(a) * 48]], '#709779', 1);
  }
  ellipse(ctx, x, y, 33, 33, '#152f23', '#7ca486', 2);
  glow(ctx, '#7efcb1', 5 + pulse * 8, () => line(ctx,
    [[x, y], [x + Math.cos(angle) * 27, y + Math.sin(angle) * 27]], '#d4ffd4', 3));
  label(ctx, name, x, y - 70, 18, '#a3dfb3', 'center');
  label(ctx, value, x, y + 82, 13, '#7efcb1', 'center');
}

function drawScope(ctx, s) {
  composite(ctx, s, bakeScope);
  const detune = smooth((s.progress - 0.25) / 0.55);
  const fx = mix(3, 5, detune), fy = mix(2, 4, detune);
  const phase = s.localT * 0.35 + detune * Math.PI * 1.75;
  knob(ctx, 116, 880, 'CH-X', -2.3 + detune * 4.2, `${fx.toFixed(2)} kHz`, s.beat);
  knob(ctx, 884, 880, 'CH-Y', -1.8 + detune * 3.5, `${fy.toFixed(2)} kHz`, s.beat);
  const trace = [];
  for (let i = 0; i <= 960; i++) {
    const a = TAU * i / 960;
    const coupling = Math.sin(a * fy + phase) * 0.075 * detune;
    trace.push([650 + 211 * Math.sin(fx * a + phase + coupling),
      408 + 169 * Math.sin(fy * a + coupling * 2)]);
  }
  glow(ctx, '#7efcb1', 19 + s.beat * 9, () => {
    line(ctx, trace, '#7efcb12b', 9);
    line(ctx, trace, '#7efcb1', 1.5);
    line(ctx, trace.slice(-40), '#e5ffe9', 2.3);
  });
  const kin = pose(s, 14, { scale: 0.79 }, 304);
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'oscilloscope', lineWidth: 1.4 });
  const arcPulse = Math.max(s.iron, s.beat * 0.7);
  if (arcPulse > 0.05) {
    glow(ctx, '#baffd1', 18, () => {
      for (let branch = 0; branch < 5; branch++) {
        const pts = [];
        for (let j = 0; j <= 16; j++) {
          const u = j / 16;
          pts.push([260 + u * 340,
            s.road - 54 - Math.sin(Math.PI * u) * (60 + branch * 16)
            + Math.sin(j * 2.7 + s.localT * 23 + branch) * 10 * arcPulse]);
        }
        line(ctx, pts, `rgba(126,252,177,${arcPulse * (0.65 - branch * 0.1)})`, 1.2);
      }
    });
  }
  label(ctx, `X:Y  ${fx.toFixed(2)}:${fy.toFixed(2)}    φ ${phase.toFixed(2)}`, 500, 191, 13, '#a3dfb3', 'center');
}

function cloud(ctx, x, y) {
  const pixels = ['001111000', '011111110', '111111111', '111111111', '011111110'];
  pixels.forEach((row, j) => [...row].forEach((v, i) => {
    if (v === '1') rect(ctx, x + i * 12, y + j * 12, 12, 12, j === 4 ? '#b9e7f4' : '#fff5d5');
  }));
}

function pipe(ctx, x, y, height) {
  rect(ctx, x + 8, y, 56, height, '#388c49', '#0d1230');
  rect(ctx, x + 16, y, 10, height, '#a0e16b');
  rect(ctx, x + 51, y, 9, height, '#246540');
  rect(ctx, x, y - 24, 72, 28, '#63bd57', '#0d1230');
  rect(ctx, x + 8, y - 19, 48, 5, '#a0e16b');
}

function bakePixel(ctx) {
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, 1000, 1000, '#78c7ee');
  rect(ctx, 0, 0, 1000, 100, '#16244c');
  label(ctx, 'PELICAN 6000', 32, 42, 24, '#fff5d5');
  label(ctx, 'WORLD 16-01', 968, 42, 24, '#fff5d5', 'right');
  label(ctx, 'SCORE', 32, 78, 17, '#f5cb50');
  label(ctx, 'TIME  660', 968, 78, 17, '#f5cb50', 'right');
  cloud(ctx, 96, 164); cloud(ctx, 452, 128); cloud(ctx, 796, 214);
  poly(ctx, [[0, ROAD], [0, 568], [48, 568], [48, 544], [96, 544], [96, 568],
    [144, 568], [144, 592], [192, 592], [192, ROAD]], '#529d76');
  poly(ctx, [[720, ROAD], [720, 584], [768, 584], [768, 552], [816, 552],
    [816, 584], [864, 584], [864, 616], [1000, 616], [1000, ROAD]], '#529d76');
  // Every block is integer aligned; the pit is a true gap, not a dark overlay.
  rect(ctx, 340, ROAD, 320, 320, '#0d1230');
  for (const [start, end] of [[0, 340], [660, 1000]]) {
    rect(ctx, start, ROAD, end - start, 16, '#a0e16b');
    rect(ctx, start, ROAD + 16, end - start, 16, '#388c49');
    for (let y = ROAD + 32; y < 1000; y += 32) {
      for (let x = start; x < end; x += 40) {
        const w = Math.min(38, end - x);
        rect(ctx, x, y, w, 30, '#b96643');
        rect(ctx, x + 3, y + 3, Math.max(1, w - 6), 4, '#e99557');
        rect(ctx, x, y + 26, w, 4, '#663b3c');
      }
    }
  }
  pipe(ctx, 64, ROAD - 88, 88); pipe(ctx, 864, ROAD - 120, 120);
  label(ctx, 'JUMP!', 500, 884, 28, '#78c7ee', 'center');
  label(ctx, 'NO CONTINUES • KEEP PEDALING', 500, 932, 14, '#477ab6', 'center');
}

function coin(ctx, x, y, phase) {
  const half = Math.max(4, Math.round((3 + Math.abs(Math.cos(phase)) * 10) / 4) * 4);
  rect(ctx, x - half, y - 16, half * 2, 32, '#b97926');
  rect(ctx, x - half, y - 12, half * 2, 24, '#f5cb50');
  rect(ctx, x - half + 4, y - 8, Math.max(4, half * 2 - 8), 16, '#ffe691');
  rect(ctx, x - 2, y - 8, 4, 16, '#e5a735');
}

function drawPixel(ctx, s) {
  composite(ctx, s, bakePixel); ctx.imageSmoothingEnabled = false;
  const travel = smooth((s.progress - 0.07) / 0.86);
  const riderX = Math.round(mix(184, 816, travel) / 4) * 4;
  const kin = pose(s, 15, { scale: 0.58, jumpHeight: 170 }, riderX);
  kin.rotation = 0; kin.y = Math.round(kin.y / 4) * 4;
  const collected = clamp(Math.floor((s.progress - 0.27) / 0.075) + 1, 0, 6);
  for (let i = 0; i < 6; i++) {
    const collectAt = 0.27 + i * 0.075;
    const x = Math.round((mix(184, 816, smooth((collectAt - 0.07) / 0.86)) + 72) / 4) * 4;
    // Match the rider's actual eased horizontal path and analytical jump arc.
    const u = clamp((collectAt - 0.22) / 0.56);
    const y = Math.round((s.road - 145 - 170 * Math.sin(Math.PI * u) ** 2) / 4) * 4;
    if (s.progress < collectAt) coin(ctx, x, y, s.localT * 8 + i);
    const age = (s.progress - collectAt) * 6.6;
    if (age >= 0 && age < 0.68) {
      const fade = 1 - age / 0.68;
      ctx.save(); ctx.globalAlpha *= fade;
      label(ctx, i === 5 ? '1UP!' : '+100', x, y - Math.round(age * 70 / 4) * 4,
        i === 5 ? 26 : 20, i === 5 ? '#a0e16b' : '#fff5d5', 'center');
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        rect(ctx, x + Math.round(Math.cos(a) * age * 54 / 4) * 4,
          y + Math.round(Math.sin(a) * age * 54 / 4) * 4, 4, 4, '#f5cb50');
      }
      ctx.restore();
    }
  }
  ellipse(ctx, riderX, s.road + 8, 56 * (1 - kin.jumpHeight / 320), 5, '#0d123050');
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'pixel_8bit' });
  label(ctx, String(collected * 100).padStart(6, '0'), 110, 78, 20, '#fff5d5');
}

function bakeChat(ctx) {
  rect(ctx, 0, 0, 1000, 1000, '#dde9ee');
  label(ctx, 'INTERNET / 2004', 50, 58, 15, '#7794a4');
  for (const [x, name] of [[64, 'My Computer'], [240, 'QQ 2004']]) {
    bevel(ctx, x, 78, 32, 29, '#bed2df');
    rect(ctx, x + 6, 84, 20, 14, '#477ab6');
    label(ctx, name, x + 42, 100, 12, '#526a7b');
  }
  bevel(ctx, 46, 142, 908, 722, '#d4d0c8');
  const title = ctx.createLinearGradient(50, 0, 950, 0);
  title.addColorStop(0, '#143c7b'); title.addColorStop(1, '#78a6c8');
  rect(ctx, 51, 147, 898, 44, title);
  glyph(ctx, '鹈鹕在线 - 聊天窗口', 69, 177, 21, '#ffffff');
  ['_', '□', '×'].forEach((text, i) => {
    bevel(ctx, 846 + i * 32, 156, 27, 27);
    label(ctx, text, 859 + i * 32, 175, 18, '#25374b', 'center');
  });
  glyph(ctx, '文件  编辑  查看  好友  帮助', 67, 220, 16, '#25374b');
  line(ctx, [[62, 233], [936, 233]], '#9daab1');
  bevel(ctx, 65, 247, 213, 510, '#ecf2f4', true);
  glyph(ctx, '我的好友', 85, 279, 20, '#25374b');
  ellipse(ctx, 92, 309, 6, 6, '#7bbc67', '#4c8847');
  label(ctx, 'PELICAN_6000', 108, 315, 14, '#477ab6');
  bevel(ctx, 80, 335, 183, 161, '#b6d4e0', true);
  label(ctx, 'cycling.gif', 91, 522, 14, '#477ab6');
  label(ctx, '256 colors / 8 fps', 91, 548, 12, '#8299a5');
  glyph(ctx, '在线  一直向前', 87, 598, 16, '#4d7850');
  label(ctx, 'Personal status:', 87, 633, 12, '#8299a5');
  glyph(ctx, '路上见 :)', 87, 666, 18, '#477ab6');
  bevel(ctx, 292, 247, 642, 510, '#ffffff', true);
  label(ctx, '2004-06-18  14:22', 315, 277, 14, '#477ab6');
  glyph(ctx, '你收到一个新的动画表情', 316, 312, 19, '#25374b');
  rect(ctx, 313, 337, 465, 61, '#e6f1f7', '#c3d9e6');
  glyph(ctx, '出发吧！今天也要快乐骑行。', 327, 375, 20, '#25374b');
  poly(ctx, [[313, 350], [301, 357], [313, 365]], '#e6f1f7', '#c3d9e6');
  rect(ctx, 292, 707, 642, 49, '#f1f6f8');
  label(ctx, 'GIF • 256 COLOR • LOOP FOREVER', 315, 738, 13, '#8299a5');
  bevel(ctx, 65, 776, 869, 72, '#ffffff', true);
  glyph(ctx, '输入消息...', 82, 817, 18, '#9aa7af');
  bevel(ctx, 810, 797, 107, 34);
  glyph(ctx, '发送', 841, 820, 17, '#25374b');
  rect(ctx, 0, 948, 1000, 52, '#d4d0c8');
  line(ctx, [[0, 949], [1000, 949]], '#ffffff', 2);
  bevel(ctx, 8, 957, 91, 35);
  glyph(ctx, '开始', 33, 981, 18, '#25374b');
  bevel(ctx, 115, 957, 280, 35, '#b6c5cc', true);
  glyph(ctx, '鹈鹕在线', 135, 981, 17, '#25374b');
  label(ctx, '14:22', 960, 981, 15, '#25374b', 'right');
}

function drawChat(ctx, s) {
  const messageTimes = [0.65, 2.25, 3.85, 5.45];
  let chime = audioPeak(s, 'messageChime', 'chimePeak', 'chimePulse', 'chime');
  for (const eventT of messageTimes) {
    const age = s.localT - eventT;
    if (age >= 0 && age < 0.45) chime = Math.max(chime, Math.exp(-age * 11));
  }
  // Both axes are bounded at ±9 logical pixels and settle after each chime.
  const dx = 9 * chime * Math.sin(s.localT * 78);
  const dy = 9 * chime * Math.cos(s.localT * 91);
  rect(ctx, 0, 0, 1000, 1000, '#dde9ee');
  ctx.save();
  try {
    ctx.translate(dx, dy);
    composite(ctx, s, bakeChat);
    ctx.imageSmoothingEnabled = false;
    const main = pose(s, 16, { scale: 0.72, quantize8fps: true, roadY: 694 }, 580);
    ctx.save();
    ctx.beginPath(); ctx.rect(295, 402, 636, 301); ctx.clip();
    rect(ctx, 295, 661, 636, 34, '#e6f1f7');
    for (let x = 315; x < 930; x += 40) rect(ctx, x, 683, 22, 2, '#b6d4e0');
    drawPelicanBicycleCanvas2D(ctx, main, { mode: 'gif_256' });
    ctx.restore();
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(84, 339, 175, 153); ctx.clip();
      rect(ctx, 84, 339, 175, 153, '#b6d4e0');
      rect(ctx, 84, 475, 175, 17, '#7bbc67');
      const gifTime = SCENES_META[16].startT + Math.floor(fract(s.localT) * 8) / 8;
      const mini = pose({ ...s, t: gifTime }, 16,
        { scale: 0.37, roadY: 478, quantize8fps: true }, 162);
      drawPelicanBicycleCanvas2D(ctx, mini, { mode: 'gif_256' });
      // A stationary Bayer dither preserves the crisp, restricted GIF palette.
      const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
      for (let y = 340; y < 490; y += 3) for (let x = 85; x < 259; x += 3) {
        if (bayer[(y - 340) / 3 % 4][(x - 85) / 3 % 4] < 3) rect(ctx, x, y, 1, 1, '#477ab644');
      }
    } finally { ctx.restore(); }
    const message = clamp(Math.floor((s.localT - 0.65) / 1.6) + 1, 0, 4);
    if (message > 0) {
      rect(ctx, 684, 416, 223, 44, '#e7f3df', '#bed6b1');
      glyph(ctx, ['收到！', '骑慢一点 :)', '路上见！', '一直在线。'][message - 1],
        700, 445, 18, '#416e42');
      label(ctx, `14:22:0${message}`, 893, 480, 12, '#8299a5', 'right');
    }
    if (chime > 0.1) label(ctx, '♪', 902, 314, 28, '#7bbc67');
  } finally { ctx.restore(); }
}

function bakeVapor(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD);
  sky.addColorStop(0, '#17132b'); sky.addColorStop(0.65, '#49305d'); sky.addColorStop(1, '#b35987');
  rect(ctx, 0, 0, 1000, 1000, '#292048'); rect(ctx, 0, 0, 1000, ROAD, sky);
  const sun = ctx.createLinearGradient(0, 185, 0, 580);
  sun.addColorStop(0, '#f4ce8f'); sun.addColorStop(0.5, '#ed99b3'); sun.addColorStop(1, '#df68ae');
  ctx.save();
  ctx.beginPath(); ctx.arc(580, 395, 198, 0, TAU); ctx.clip();
  rect(ctx, 375, 190, 410, 410, sun);
  for (let y = 400, step = 5; y < 600; step += 1.3, y += step + 9) {
    rect(ctx, 375, y, 410, step, '#49305d');
  }
  ctx.restore();
  const rng = createSeededRng('vaporwave-stars-6000');
  for (let i = 0; i < 68; i++) {
    const x = rng.range(20, 980), y = rng.range(25, 380);
    rect(ctx, x, y, 1.5, 1.5, '#f7d9ee99');
  }
  poly(ctx, [[0, ROAD], [0, 594], [110, 638], [247, 584], [398, ROAD]], '#241b3d');
  poly(ctx, [[650, ROAD], [784, 592], [905, 629], [1000, 553], [1000, ROAD]], '#241b3d');
  rect(ctx, 0, ROAD, 1000, 320, '#17132b');
  glow(ctx, '#df8dcb', 7, () => {
    for (let i = -9; i <= 9; i++) line(ctx, [[500, ROAD], [500 + i * 150, 1000]], '#b950a4', 1.2);
    for (let j = 0; j <= 11; j++) {
      const y = ROAD + 320 * (j / 11) ** 2.5;
      line(ctx, [[0, y], [1000, y]], '#c45aad', 1.1);
    }
    line(ctx, [[0, ROAD], [1000, ROAD]], '#f7a1dd', 2);
  });
  // Frosted Win95 chrome frames the sculpture without obscuring the highway.
  bevel(ctx, 57, 156, 285, 520, '#c7bdd255');
  const title = ctx.createLinearGradient(60, 0, 340, 0);
  title.addColorStop(0, '#665496'); title.addColorStop(1, '#b693c8');
  rect(ctx, 61, 160, 277, 31, title);
  label(ctx, 'AESTHETIC.EXE', 72, 181, 14, '#f7d9ee');
  bevel(ctx, 310, 165, 22, 21, '#c7bdd2'); label(ctx, '×', 321, 181, 16, '#49305d', 'center');
  label(ctx, 'MARBLE / MEMORY', 199, 649, 11, '#f7d9ee', 'center');
  glyph(ctx, '永远的夏天', 654, 93, 30, '#f0b6dc');
  label(ctx, 'PLAY  ▷     SP / 1988', 52, 947, 16, '#f7d9ee');
}

function marbleBust(ctx, cyclistX, t) {
  const yaw = Math.tanh((cyclistX - 290) / 270) * 0.56;
  const stone = ctx.createLinearGradient(130, 0, 285, 0);
  stone.addColorStop(0, '#a3a3bd'); stone.addColorStop(0.38, '#f0e6ed'); stone.addColorStop(1, '#a69cb8');
  rect(ctx, 140, 579, 132, 44, '#b7afc7', '#e1d9e4');
  rect(ctx, 130, 619, 152, 12, '#e1d9e4');
  poly(ctx, [[112, 577], [126, 514], [171, 488], [177, 446], [230, 446],
    [239, 488], [289, 516], [306, 577]], stone, '#c9bfd4', 2);
  line(ctx, [[136, 525], [177, 551], [191, 505]], '#9289a6', 2);
  line(ctx, [[240, 502], [261, 553], [286, 527]], '#9289a6', 2);
  // All head features share the yaw transform, including the lit marble planes.
  ctx.save();
  try {
    ctx.translate(204 + yaw * 16, 374);
    ctx.transform(Math.cos(yaw), 0, Math.sin(yaw) * 0.12, 1, 0, 0);
    ctx.rotate(yaw * 0.08);
    ellipse(ctx, 0, 0, 59, 91, stone, '#cec5d9', 2);
    poly(ctx, [[-52, -42], [-44, -81], [-18, -105], [20, -103], [49, -76],
      [56, -36], [32, -62], [4, -68], [-22, -54]], '#c8bfd1', '#ece1ec', 1.5);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + i * Math.PI / 10;
      ellipse(ctx, Math.cos(a) * 48, -48 + Math.sin(a) * 38, 11, 13, '#bdb4cd', '#dfd5e3');
    }
    ellipse(ctx, -52, 5, 8, 19, '#bdb4cd', '#d9cfe0');
    ellipse(ctx, 52, 5, 8, 19, '#bdb4cd', '#d9cfe0');
    const eyeShift = yaw * 13;
    line(ctx, [[-37, -12], [-20, -18], [-9, -13]], '#8d849e', 3);
    line(ctx, [[9, -13], [25, -18], [39, -11]], '#8d849e', 3);
    ellipse(ctx, -22 + eyeShift, -6, 4, 3, '#7d7895');
    ellipse(ctx, 23 + eyeShift, -6, 4, 3, '#7d7895');
    poly(ctx, [[yaw * 8, -4], [13 + yaw * 19, 29], [-5 + yaw * 9, 32]], '#a49bb5', '#d7ccdc');
    line(ctx, [[-15, 49], [3, 53], [23, 47]], '#91869f', 2);
    line(ctx, [[-8, 59], [13, 59]], '#ece1ec', 2);
    line(ctx, [[-39, 24], [-30, 40], [-32, 56]], '#9e92ac66');
    // Fine veins remain attached to the head as it turns.
    line(ctx, [[-11, -79], [-18, -49], [-7, -32]], '#8c81994d');
    line(ctx, [[35, 15], [29, 42], [38, 58]], '#8c81994d');
  } finally { ctx.restore(); }
  label(ctx, `CAM ${String(Math.floor(t * 24)).padStart(5, '0')}`, 272, 605, 9, '#6c617f', 'right');
}

function drawVapor(ctx, s) {
  composite(ctx, s, bakeVapor);
  // Moving perspective rungs use a cyclic depth coordinate, not frame history.
  glow(ctx, '#df8dcb', 5, () => {
    for (let i = 0; i < 12; i++) {
      const depth = fract(i / 12 + s.localT * 0.12);
      const y = ROAD + 320 * depth ** 2.5;
      line(ctx, [[0, y], [1000, y]], '#f19bdc88', 1);
    }
  });
  const cyclistX = mix(380, 785, smooth(s.progress));
  marbleBust(ctx, cyclistX, s.localT);
  const kin = pose(s, 17, { scale: 0.87 }, cyclistX);
  for (const [offset, color] of [[-6, '#ff4fa088'], [6, '#55fff188']]) {
    drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'vaporwave', x: kin.x + offset,
      alpha: 0.24, palette: { ink: color, feather: color, wing: color, frame: color } });
  }
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'vaporwave' });
  // Tape skips copy completed horizontal strips, including the cyclist and bust.
  const burstClock = s.localT * 1.8;
  const gate = fract(burstClock);
  const glitch = gate < 0.16 || s.iron > 0.45;
  if (glitch && ctx.canvas) {
    const rng = createSeededRng(`tape-skip:${Math.floor(burstClock)}`);
    const matrix = ctx.getTransform?.();
    const sx = matrix?.a ?? finite(ctx.canvas.width, 1000) / SIZE;
    const sy = matrix?.d ?? finite(ctx.canvas.height, 1000) / SIZE;
    const sourceX = matrix?.e ?? 0, sourceY = matrix?.f ?? 0;
    const canCopy = sx > 0 && sy > 0 && !matrix?.b && !matrix?.c;
    for (let i = 0; i < 4; i++) {
      const y = rng.int(210, 850), h = rng.int(4, 19);
      const offset = rng.range(-29, 29) * (0.6 + s.iron);
      if (canCopy) ctx.drawImage(ctx.canvas, sourceX, sourceY + y * sy,
        SIZE * sx, h * sy, offset, y, SIZE, h);
      rect(ctx, 0, y + h, SIZE, 1, '#67ded755');
    }
  }
  for (let y = 0; y < 1000; y += 5) rect(ctx, 0, y, 1000, 1, '#100b211f');
  label(ctx, 'VHS  00:00:' + String(Math.floor(s.localT)).padStart(2, '0'), 945, 947, 16, '#f7d9ee', 'right');
}

function heart(ctx, x, y, size, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x, y + size * 0.45);
  ctx.bezierCurveTo(x - size * 1.05, y - size * 0.23, x - size * 0.48, y - size * 0.87, x, y - size * 0.38);
  ctx.bezierCurveTo(x + size * 0.48, y - size * 0.87, x + size * 1.05, y - size * 0.23, x, y + size * 0.45);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.7; ctx.stroke(); }
}

function bakeFeed(ctx) {
  rect(ctx, 0, 0, 1000, 1000, '#101014');
  const light = ctx.createRadialGradient(500, 456, 35, 500, 456, 485);
  light.addColorStop(0, '#32313b'); light.addColorStop(1, '#101014');
  rect(ctx, 0, 0, 1000, 1000, light);
  line(ctx, [[0, ROAD], [1000, ROAD]], '#f3f1ea55', 1.4);
  const reflection = ctx.createLinearGradient(0, ROAD, 0, 1000);
  reflection.addColorStop(0, '#b2bdc51f'); reflection.addColorStop(1, '#10101400');
  rect(ctx, 0, ROAD, 1000, 320, reflection);
  for (let i = 0; i < 5; i++) {
    const y = ROAD + 38 + i * 51;
    line(ctx, [[275, y], [725, y]], '#f3f1ea08');
  }
}

// Integrate a smooth deceleration, hold, then integrate the acceleration.
// The riding clock is constant throughout 0.35..0.72, including all IK details.
function feedRidingProgress(progress) {
  if (progress < 0.29) return progress;
  if (progress < 0.35) {
    const u = (progress - 0.29) / 0.06;
    return 0.29 + 0.06 * (u - u ** 3 + u ** 4 / 2);
  }
  if (progress <= 0.72) return 0.32;
  if (progress < 0.80) {
    const u = (progress - 0.72) / 0.08;
    return 0.32 + 0.08 * (u ** 3 - u ** 4 / 2);
  }
  return 0.36 + progress - 0.80;
}

function curtain(ctx, x, width, left) {
  if (width <= 0) return;
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(x, 0, width, 1000); ctx.clip();
    rect(ctx, x, 0, width, 1000, '#050507');
    for (let i = 0; i < 9; i++) {
      const foldX = x + width * i / 8;
      const fold = ctx.createLinearGradient(foldX, 0, foldX + width / 8, 0);
      fold.addColorStop(0, '#050507'); fold.addColorStop(0.44, '#151118'); fold.addColorStop(1, '#020204');
      rect(ctx, foldX, 0, width / 8 + 1, 1000, fold);
    }
    const edge = left ? x + width - 1 : x + 1;
    line(ctx, [[edge, 0], [edge, 1000]], '#29212c', 2);
  } finally { ctx.restore(); }
}

function drawFeed(ctx, s) {
  // Opaque reset also covers the fractional-pixel mask edges on repeated seeks.
  rect(ctx, 0, 0, SIZE, SIZE, '#050507');
  const close = smooth(s.progress / 0.25);
  const left = FEED_LEFT * close, right = SIZE - FEED_LEFT * close;
  const cinematic = smooth((s.progress - 0.25) / 0.10) * (1 - smooth((s.progress - 0.72) / 0.20));
  const ridingP = feedRidingProgress(s.progress);
  const ridingT = SCENES_META[18].startT + ridingP * (SCENES_META[18].endT - SCENES_META[18].startT);
  // The changing mask and curtains stay in screen space. The baked backdrop
  // belongs inside the same camera transform as the frozen cyclist.
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(left, 0, right - left, 1000); ctx.clip();
    ctx.save();
    try {
      const zoom = 1 + cinematic * 0.12;
      ctx.translate(500, 505); ctx.scale(zoom, zoom); ctx.translate(-500, -505);
      composite(ctx, s, bakeFeed);
      const kin = pose({ ...s, t: ridingT }, 18, { scale: 0.97, stopWindows: [] }, 475);
      ellipse(ctx, 475, s.road + 6, 167, 13, '#00000066');
      drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'museum_white' });
    } finally { ctx.restore(); }
    // All short-video overlays use the final 562.5px feed bounds, even while
    // the curtains are still moving inward.
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(FEED_LEFT, 0, FEED_RIGHT - FEED_LEFT, 1000); ctx.clip();
      label(ctx, 'FOLLOWING     FOR YOU', 500, 70, 17, '#f3f1eac0', 'center');
      line(ctx, [[538, 82], [606, 82]], '#f3f1ea', 2);
      ctx.save(); ctx.globalAlpha *= 0.76;
      heart(ctx, 740, 560, 22, '#f3f1ea');
      ellipse(ctx, 740, 655, 18, 15, null, '#f3f1ea', 2);
      line(ctx, [[730, 667], [728, 678], [742, 669]], '#f3f1ea', 2);
      poly(ctx, [[724, 754], [745, 729], [745, 740], [759, 740],
        [759, 752], [745, 752], [745, 764]], '#f3f1ea');
      ctx.restore();
      const likeProgress = smooth((s.progress - 0.30) / 0.66);
      const likes = Math.floor(6000 + 1186000 * likeProgress ** 1.45);
      const counter = likes >= 1000000 ? `${(likes / 1000000).toFixed(2)}M` : `${(likes / 1000).toFixed(1)}K`;
      label(ctx, counter, 740, 606, 14, '#f3f1ea', 'center');
      label(ctx, '6000', 740, 708, 12, '#f3f1eab0', 'center');
      label(ctx, 'SHARE', 740, 797, 11, '#f3f1eab0', 'center');
      const rng = createSeededRng('heart-bursts-scene19');
      const burst = smooth((s.progress - 0.31) / 0.09);
      for (let i = 0; i < 58; i++) {
        const phase = rng.next(), drift = rng.range(-175, 175);
        const lifetime = rng.range(1.7, 3.1), size = rng.range(7, 19);
        const age = fract(s.localT / lifetime + phase);
        const x = clamp(552 + drift * Math.sin(age * 2.7 + phase * TAU),
          FEED_LEFT + 28, FEED_RIGHT - 55);
        const y = 835 - age * 780;
        const alpha = burst * Math.sin(Math.PI * age) * 0.83;
        if (alpha <= 0.01) continue;
        ctx.save(); ctx.globalAlpha *= alpha;
        glow(ctx, '#ff315f', 12, () => heart(ctx, x, y, size, '#ee315b', '#ff9aa9'));
        ctx.restore();
      }
      label(ctx, '@pelican_6000', 249, 869, 21, '#f3f1ea');
      glyph(ctx, '这一刻，时间为你停留。', 249, 905, 20, '#f3f1ea');
      label(ctx, '♫  ORIGINAL SOUND · 6000 YEARS', 249, 953, 12, '#f3f1eab0');
      if (s.progress >= 0.35 && s.progress <= 0.72) {
        label(ctx, 'Ⅱ   HOLD THIS MOMENT', 500, 248, 14, '#f3f1eab0', 'center');
      }
    } finally { ctx.restore(); }
  } finally { ctx.restore(); }
  curtain(ctx, 0, left, true); curtain(ctx, right, SIZE - right, false);
}

// Exact complex DFT of the closed, uniformly sampled single-stroke contour.
// Keep signed frequencies: a negative harmonic rotates in the opposite direction.
const OUTLINE_POINTS = getPelicanOutlinePoints(128);
const ALL_FOURIER_COEFFICIENTS = [];
for (let freq = -64; freq < 64; freq++) {
  let re = 0, im = 0;
  for (let n = 0; n < OUTLINE_POINTS.length; n++) {
    const x = OUTLINE_POINTS[n].x - 0.5, y = OUTLINE_POINTS[n].y - 0.5;
    const angle = TAU * freq * n / OUTLINE_POINTS.length;
    const c = Math.cos(angle), sin = Math.sin(angle);
    // (x + iy) (cos(angle) - i sin(angle)).
    re += x * c + y * sin;
    im += y * c - x * sin;
  }
  re /= OUTLINE_POINTS.length; im /= OUTLINE_POINTS.length;
  ALL_FOURIER_COEFFICIENTS.push({ freq, re, im,
    amplitude: Math.hypot(re, im), phase: Math.atan2(im, re) });
}
ALL_FOURIER_COEFFICIENTS.sort((a, b) => b.amplitude - a.amplitude || a.freq - b.freq);

// Exposed for numerical verification; the renderer uses these exact 36 terms.
export const SCENE_20_FOURIER = Object.freeze(
  ALL_FOURIER_COEFFICIENTS.slice(0, 36).map(term => Object.freeze(term)),
);

export function reconstructScene20Outline(theta) {
  let x = 0, y = 0;
  for (const term of SCENE_20_FOURIER) {
    const angle = term.freq * theta, c = Math.cos(angle), sin = Math.sin(angle);
    x += term.re * c - term.im * sin;
    y += term.re * sin + term.im * c;
  }
  return { x: x + 0.5, y: y + 0.5 };
}

const SOURCE_CODE = [
  '// 6000 YEARS → ONE PATH',
  'const N = 128;',
  'const order = 36;',
  'const z = pts.map(p => ({',
  '  re: p.x - 0.5,',
  '  im: p.y - 0.5',
  '}));',
  'for (k = -64; k < 64; k++) {',
  '  X[k] = sum(z[n] *',
  '    exp(-i*2*pi*k*n/N))/N;',
  '  re += x*cos(2*pi*k*n/N)',
  '      + y*sin(2*pi*k*n/N);',
  '}',
  'sortByAmplitude(X);',
  'const epicycles = X.slice(0,36);',
  'theta = TAU * clamp(p*1.45);',
  'tip += X[k]*exp(i*k*theta);',
  '<svg viewBox="0 0 1000 1000">',
  '  <path d="M 0 0 L ... Z"',
  '    fill="none"',
  '    stroke="#8ad9d0" />',
  '</svg>',
  '// KEEP PEDALING.',
];

function bakeCode(ctx) {
  rect(ctx, 0, 0, 1000, 1000, '#0e1823');
  rect(ctx, 0, 0, 1000, 68, '#111f2c');
  rect(ctx, 15, 14, 220, 45, '#1a2d3b');
  label(ctx, '◇  pelican.svg', 34, 44, 18, '#8ad9d0');
  label(ctx, 'main.js    fourier.js', 260, 43, 15, '#7d929f');
  line(ctx, [[0, 68], [1000, 68]], '#29404e');
  rect(ctx, 0, 69, 45, 873, '#0b141e');
  line(ctx, [[365, 90], [365, 905]], '#223441');
  for (let x = 410; x < 980; x += 40) for (let y = 150; y < 890; y += 40) {
    rect(ctx, x, y, 1, 1, '#8ad9d01f');
  }
  rect(ctx, 0, 944, 1000, 56, '#152b38');
  label(ctx, '●  SVG', 24, 977, 15, '#8ad9d0');
  label(ctx, 'UTF-8    N=128    FOURIER ORDER 36', 970, 977, 14, '#8ad9d0', 'right');
}

function epicyclePoint(term, theta) {
  const angle = term.freq * theta;
  return { x: term.re * Math.cos(angle) - term.im * Math.sin(angle),
    y: term.re * Math.sin(angle) + term.im * Math.cos(angle) };
}

function drawCode(ctx, s) {
  composite(ctx, s, bakeCode);
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(4, 92, 352, 831); ctx.clip();
    const scroll = s.localT * 13;
    for (let row = -1; row < 35; row++) {
      const sourceRow = row + Math.floor(scroll / 29);
      const y = 123 + row * 29 - scroll % 29;
      const index = ((sourceRow % SOURCE_CODE.length) + SOURCE_CODE.length) % SOURCE_CODE.length;
      label(ctx, String(sourceRow + 1).padStart(2, '0'), 35, y, 11, '#506a7b', 'right');
      label(ctx, SOURCE_CODE[index], 57, y, 11,
        SOURCE_CODE[index].startsWith('//') ? '#537d77' : index % 3 === 0 ? '#c3aa78' : '#709da3');
    }
  } finally { ctx.restore(); }
  const theta = TAU * clamp(s.progress * 1.45);
  const originX = 659, originY = 484, scale = 520;
  const vectorTransition = smooth((s.progress - 0.68) / 0.25);
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(368, 100, 632, 810); ctx.clip();
    // Each orbit is centered at the previous chain tip. Its radius vector
    // uses the coefficient's signed frequency and complex phase, without rounding.
    let x = originX, y = originY;
    ctx.save(); ctx.globalAlpha *= 1 - 0.78 * vectorTransition;
    for (let i = 0; i < SCENE_20_FOURIER.length; i++) {
      const term = SCENE_20_FOURIER[i], delta = epicyclePoint(term, theta);
      const nextX = x + delta.x * scale, nextY = y + delta.y * scale;
      ellipse(ctx, x, y, term.amplitude * scale, term.amplitude * scale,
        null, i % 3 ? '#8ad9d036' : '#e7c47b45', 0.85);
      line(ctx, [[x, y], [nextX, nextY]], i % 3 ? '#8ad9d085' : '#e7c47ba0', 1);
      ellipse(ctx, nextX, nextY, 1.6, 1.6, '#d8eee7a0');
      x = nextX; y = nextY;
    }
    ctx.restore();
    const trail = [];
    const samples = Math.ceil(theta / TAU * 512);
    for (let i = 0; i <= samples; i++) {
      const at = samples ? theta * i / samples : 0;
      const point = reconstructScene20Outline(at);
      trail.push([originX + (point.x - 0.5) * scale, originY + (point.y - 0.5) * scale]);
    }
    ctx.save(); ctx.globalAlpha *= 1 - 0.75 * vectorTransition;
    glow(ctx, '#8ad9d0', 11, () => {
      line(ctx, trail, '#8ad9d038', 6);
      line(ctx, trail, '#8ad9d0', 1.8);
      line(ctx, trail.slice(-22), '#e7c47b', 2.2);
      ellipse(ctx, x, y, 3.5, 3.5, '#fff1ba');
    });
    ctx.restore();
    // Replace the Fourier approximation with the original normalized vector
    // contour, revealing successive SVG-like segments instead of a raster wipe.
    if (vectorTransition > 0) {
      const count = Math.min(128, Math.floor(vectorTransition * 142));
      glow(ctx, '#8ad9d0', 5, () => {
        for (let i = 0; i < count; i++) {
          const a = OUTLINE_POINTS[i], b = OUTLINE_POINTS[(i + 1) % 128];
          line(ctx, [[originX + (a.x - 0.5) * scale, originY + (a.y - 0.5) * scale],
            [originX + (b.x - 0.5) * scale, originY + (b.y - 0.5) * scale]],
          i > count - 5 ? '#e7c47b' : '#8ad9d0', 1.8);
        }
      });
    }
    const cyclistReveal = smooth((s.progress - 0.86) / 0.12);
    if (cyclistReveal > 0) {
      // The final complete procedural SVG-style cyclist occupies its own clear
      // baseline while the traced contour settles into an editor preview above.
      ctx.save(); ctx.globalAlpha *= cyclistReveal;
      rect(ctx, 378, 651, 610, 242, '#0e1823ed');
      const kin = pose(s, 19, { scale: 0.57, roadY: 880 }, 655);
      drawPelicanBicycleCanvas2D(ctx, kin, { mode: 'code_svg', lineWidth: 1.5 });
      line(ctx, [[400, 881], [958, 881]], '#8ad9d03d');
      ctx.restore();
    }
  } finally { ctx.restore(); }
  label(ctx, 'COMPLEX DFT / 36 EPICYCLES', 657, 123, 15, '#8ad9d0', 'center');
  label(ctx, `θ ${theta.toFixed(3)}   /   ${(clamp(s.progress * 1.45) * 100).toFixed(0)}%`,
    657, 154, 12, '#b7aa85', 'center');
  label(ctx, s.progress > 0.94 ? 'PATH COMPLETE · KEEP PEDALING' : 'RECONSTRUCTING A SINGLE STROKE',
    657, 926, 12, '#e7c47b', 'center');
}

function makeScene(sceneIndex, bake, draw) {
  const meta = SCENES_META[sceneIndex];
  return {
    sceneIndex, id: meta.id ?? sceneIndex + 1, meta,
    bake2D(ctx, sceneDef) {
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(0, 0, SIZE, SIZE); ctx.clip();
        bake(ctx, sceneDef);
      } finally { ctx.restore(); }
    },
    bakeBrush(p, brush, sceneDef) { bakeBrushFor(sceneIndex, p, brush, sceneDef); },
    drawDynamic(ctx, sceneCtx = {}) {
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(0, 0, SIZE, SIZE); ctx.clip();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        draw(ctx, { ...stateOf(sceneCtx, sceneIndex), index: sceneIndex });
      } finally { ctx.restore(); }
    },
  };
}

export const SCENES_BATCH_3 = [
  makeScene(14, bakeScope, drawScope),
  makeScene(15, bakePixel, drawPixel),
  makeScene(16, bakeChat, drawChat),
  makeScene(17, bakeVapor, drawVapor),
  makeScene(18, bakeFeed, drawFeed),
  makeScene(19, bakeCode, drawCode),
];
