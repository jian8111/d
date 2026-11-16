// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG as C, FRAME_SYSTEMS, SCENES_META } from "../data/scenes-meta.js";
import { LYRICS_CUES } from "../data/lyrics-data.js";
import { drawGlyphText, measureGlyphText } from "../data/glyphs.js";
import { createSeededRng } from "../core/prng.js";
import { computePelicanKinematics, drawPelicanBicycleCanvas2D } from "./ik-pelican.js";

// All geometry is in 960 × 720 logical units. No backing-store transforms,
// browser fonts, images, clocks, or mutable animation state are required.
const TAU = Math.PI * 2;
const BOTTOM_SAFE = 648;
const DEFAULT_RECT = Object.freeze({ x: 185, y: 54, w: 590, h: 590 });
const DARK_SCENES = new Set([13, 14, 17, 18, 19]);
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const mix = (a, b, u) => a + (b - a) * u;
const smooth = (u) => { const k = clamp(u); return k * k * (3 - 2 * k); };
const fract = (n) => n - Math.floor(n);
const time = (state) => Math.max(0, finite(state?.realT));
const rect = (r) => ({ x: finite(r?.x, 185), y: finite(r?.y, 54),
  w: Math.max(1, finite(r?.w, 590)), h: Math.max(1, finite(r?.h, 590)) });

function isolated(ctx, paint) {
  if (!ctx) return;
  ctx.save();
  try { paint(); } finally { ctx.restore(); }
}

function sceneOf(state = {}) {
  if (state.sceneMeta) return state.sceneMeta;
  if (Number.isInteger(state.sceneIndex) && state.sceneIndex >= 0) return SCENES_META[state.sceneIndex];
  const t = time(state);
  return SCENES_META.find((s) => t >= s.startT && t < s.endT) ??
    (t >= C.ACT3_END ? SCENES_META[19] : null);
}

function indexOf(state, meta = sceneOf(state)) {
  return finite(meta?.index, finite(state?.sceneIndex, SCENES_META.indexOf(meta)));
}

function progressOf(state, meta) {
  return clamp(finite(state?.sceneProgress,
    meta ? (time(state) - meta.startT) / (meta.endT - meta.startT) : 0));
}

function colorMix(a, b, u) {
  const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const aa = rgb(a), bb = rgb(b);
  return `rgb(${aa.map((n, i) => Math.round(mix(n, bb[i], u))).join(",")})`;
}

function box(ctx, x, y, w, h, radius = 0) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillBox(ctx, x, y, w, h, color, radius = 0) {
  ctx.fillStyle = color;
  box(ctx, x, y, w, h, radius);
  ctx.fill();
}

function strokeBox(ctx, x, y, w, h, color, width = 1, radius = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  box(ctx, x, y, w, h, radius); ctx.stroke();
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function circle(ctx, x, y, radius, color, stroke, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, radius), 0, TAU);
  if (color) { ctx.fillStyle = color; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function clipRect(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([p, c]) => g.addColorStop(p, c)); return g;
}

function glow(ctx, x, y, rx, ry, color, alpha = 1) {
  isolated(ctx, () => {
    ctx.translate(x, y); ctx.scale(rx, ry); ctx.globalAlpha *= alpha;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(255,207,130,0)");
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  });
}

function label(ctx, value, x, y, size, color, options = {}) {
  const text = String(value ?? "");
  const { maxWidth, ...rest } = options;
  const width = measureGlyphText(text, size, rest.family ?? "sans", rest.letterSpacing ?? 0);
  const fontSize = maxWidth && width > maxWidth ? size * maxWidth / width : size;
  drawGlyphText(ctx, text, x, y, fontSize, { family: "sans", color, ...rest });
}

function darkAmount(state) {
  const t = time(state), meta = sceneOf(state), index = indexOf(state, meta);
  if (t >= C.ACT3_END) return 1;
  const target = DARK_SCENES.has(index) ? 1 : 0;
  if (!meta) return target;
  const previous = DARK_SCENES.has(index - 1) ? 1 : 0;
  return mix(previous, target, smooth((t - meta.startT) / 0.65));
}

// Immutable, seeded plaster marks and particle identities make seeking stable.
const plasterRng = createSeededRng("pelican-6000:venetian-plaster");
const PLASTER = Object.freeze(Array.from({ length: 155 }, () => Object.freeze({
  x: plasterRng.range(-60, 960), y: plasterRng.range(-20, 720),
  w: plasterRng.range(26, 170), h: plasterRng.range(3, 18),
  tilt: plasterRng.range(-0.25, 0.25), light: plasterRng.range(0, 1) > 0.5,
})));
const particleRng = createSeededRng("pelican-6000:cross-frame");
const PARTICLES = Object.freeze(Array.from({ length: 26 }, () => Object.freeze({
  edge: Math.floor(particleRng.range(0, 4)), along: particleRng.range(0.06, 0.94),
  phase: particleRng.range(0, 1), speed: particleRng.range(0.11, 0.27),
  size: particleRng.range(0.8, 2.6), sway: particleRng.range(-1, 1),
})));

export function renderGalleryWallBackdrop(ctx, state = {}, sceneRect = DEFAULT_RECT) {
  isolated(ctx, () => {
    const r = rect(sceneRect), dark = darkAmount(state);
    clipRect(ctx, 0, 0, 960, 720);
    ctx.fillStyle = linear(ctx, 0, 0, 0, 720, [
      [0, colorMix("#dfd5c1", "#2d2824", dark)],
      [1, colorMix("#c6b89e", "#1a1714", dark)],
    ]);
    ctx.fillRect(0, 0, 960, 720);
    for (const p of PLASTER) {
      isolated(ctx, () => {
        ctx.translate(p.x, p.y); ctx.rotate(p.tilt);
        ctx.globalAlpha *= mix(0.032, 0.022, dark);
        ctx.fillStyle = p.light ? "#fff7de" : "#534535";
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.bezierCurveTo(p.w * 0.25, -p.h, p.w * 0.8, p.h, p.w, 0);
        ctx.quadraticCurveTo(p.w * 0.7, p.h * 1.6, 0, p.h * 0.4);
        ctx.closePath(); ctx.fill();
        line(ctx, [[2, p.h * 0.3], [p.w * 0.85, p.h * 0.3]], p.light ? "#fffaf0" : "#65523d", 0.45);
      });
    }
    glow(ctx, r.x + r.w / 2, r.y + r.h * 0.25, r.w * 0.88, r.h * 0.87,
      "rgba(255,220,158,0.20)", mix(0.65, 1, dark));
    const vignette = ctx.createRadialGradient(480, 320, 180, 480, 360, 640);
    vignette.addColorStop(0, "rgba(20,16,12,0)");
    vignette.addColorStop(1, `rgba(13,10,8,${mix(0.17, 0.48, dark)})`);
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, 960, 720);
    ctx.fillStyle = linear(ctx, 0, 614, 0, 720, [
      [0, "rgba(20,16,12,0)"], [0.4, "rgba(20,16,12,0.08)"], [1, "rgba(9,8,7,0.32)"],
    ]);
    ctx.fillRect(0, 614, 960, 106);
    line(ctx, [[0, 626], [960, 626]], dark > 0.5 ? "#514337" : "#b6a78b", 3);
    line(ctx, [[0, 628.5], [960, 628.5]], "rgba(255,234,196,0.18)", 0.8);
    line(ctx, [[0, 656], [960, 656]], "rgba(10,9,7,0.62)", 3);
    line(ctx, [[0, 658], [960, 658]], "rgba(238,213,166,0.28)", 0.8);
    for (let x = 48; x < 960; x += 144) {
      line(ctx, [[x, 634], [x, 652]], "rgba(20,17,12,0.12)", 0.8);
    }
  });
}

// Molding is built outward from the artwork; it never paints over its center.
function molding(ctx, r, outer, inner, width, colors) {
  const { x, y, w, h } = r;
  const a = outer, b = inner;
  const polygons = [
    [[x - a, y - a], [x + w + a, y - a], [x + w + b, y - b], [x - b, y - b]],
    [[x + w + a, y - a], [x + w + a, y + h + a], [x + w + b, y + h + b], [x + w + b, y - b]],
    [[x - a, y + h + a], [x - b, y + h + b], [x + w + b, y + h + b], [x + w + a, y + h + a]],
    [[x - a, y - a], [x - b, y - b], [x - b, y + h + b], [x - a, y + h + a]],
  ];
  polygons.forEach((p, i) => {
    ctx.beginPath(); p.forEach(([px, py], j) => j ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill();
  });
  if (width) strokeBox(ctx, x - b, y - b, w + b * 2, h + b * 2, "rgba(21,14,8,0.55)", width);
}

function frameShadow(ctx, r, depth = 18, radius = 2) {
  // Four strips cast an ambient occlusion shadow while leaving art transparent.
  for (let i = 6; i > 0; i--) {
    strokeBox(ctx, r.x - depth - i, r.y - depth + 2 - i,
      r.w + 2 * (depth + i), r.h + 2 * (depth + i), `rgba(7,5,3,${0.012 * (7 - i)})`, 3, radius);
  }
}

function rosette(ctx, x, y, radius, petals = 8) {
  isolated(ctx, () => {
    ctx.translate(x, y);
    for (let i = 0; i < petals; i++) {
      const a = TAU * i / petals;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * radius * 0.48, Math.sin(a) * radius * 0.48,
        radius * 0.5, radius * 0.17, a, 0, TAU);
      ctx.strokeStyle = "#d6b66f"; ctx.lineWidth = 0.65; ctx.stroke();
    }
    circle(ctx, 0, 0, radius * 0.17, "#e1c788");
  });
}

function drawFrame(ctx, r, system, state, meta) {
  const { x, y, w, h } = r;
  const gold = ["#d6b773", "#765424", "#a37b3b", "#b7904e"];
  const corners = [[x - 11, y - 11], [x + w + 11, y - 11], [x - 11, y + h + 11], [x + w + 11, y + h + 11]];
  frameShadow(ctx, r, system === "contemporary_frame" ? 6 : 21, system === "retro_crt_device" ? 17 : 2);
  switch (system) {
    case "stone_ledge": {
      molding(ctx, r, 22, 3, 1.5, ["#c6b696", "#7c6c52", "#9b8767", "#b4a384"]);
      molding(ctx, r, 7, 0, 1, ["#8b7c60", "#574c3c", "#a39576", "#645844"]);
      for (let i = 0; i < 34; i++) {
        const px = x - 18 + fract(i * 0.618) * (w + 36);
        line(ctx, [[px, y - 16], [px + 7, y - 13], [px + 4, y - 8]], "rgba(69,53,33,0.23)", 0.7);
        line(ctx, [[x - 17, y + i * h / 34], [x - 9, y + i * h / 34 + 4]], "rgba(240,224,186,0.28)", 1);
      }
      fillBox(ctx, x - 30, y + h + 10, w + 60, 7, "#c1a77c", 1);
      fillBox(ctx, x - 26, y + h + 17, w + 58, 4, "#766145", 1);
      line(ctx, [[x - 30, y + h + 10], [x + w + 30, y + h + 10]], "#e3cca0", 1);
      break;
    }
    case "sandstone_papyrus": {
      molding(ctx, r, 21, 0, 1, ["#ddc99b", "#a58a5b", "#b99e6d", "#c8b080"]);
      for (let i = 0; i < Math.ceil(w / 15); i++) {
        const px = x + i * 15 + 5;
        line(ctx, [[px - 3, y - 6], [px, y - 17], [px + 3, y - 6]], "#9d895f", 0.7);
        line(ctx, [[px, y - 6], [px, y - 18]], "#ecdaae", 0.6);
        line(ctx, [[px - 3, y + h + 6], [px, y + h + 17], [px + 3, y + h + 6]], "#9d895f", 0.7);
      }
      for (let i = 0; i < Math.ceil(h / 17); i++) {
        const py = y + 8 + i * 17;
        line(ctx, [[x - 18, py - 4], [x - 6, py], [x - 18, py + 4]], "#a18b5c", 0.7);
        line(ctx, [[x + w + 18, py - 4], [x + w + 6, py], [x + w + 18, py + 4]], "#a18b5c", 0.7);
      }
      for (const [cx, cy] of corners) {
        fillBox(ctx, cx - 8, cy - 7, 16, 14, "#c3a15c");
        strokeBox(ctx, cx - 6, cy - 5, 12, 10, "#f1d78d", 0.6);
      }
      break;
    }
    case "silk_scroll": {
      molding(ctx, r, 20, 0, 0.7, ["#c4b68f", "#aaa180", "#c0b68f", "#c8bd9b"]);
      isolated(ctx, () => {
        ctx.beginPath(); ctx.rect(x - 20, y - 20, w + 40, h + 40);
        ctx.rect(x, y, w, h); ctx.clip("evenodd");
        for (let py = y - 20; py < y + h + 20; py += 7) {
          line(ctx, [[x - 20, py], [x + w + 20, py]], "rgba(247,236,196,0.23)", 0.5);
        }
        for (let px = x - 20; px < x + w + 20; px += 12) {
          for (let py = y - 16; py < y + h + 20; py += 18) {
            line(ctx, [[px, py - 4], [px + 4, py], [px, py + 4], [px - 4, py], [px, py - 4]], "rgba(105,101,65,0.25)", 0.5);
          }
        }
      });
      line(ctx, [[x - 7, y - 25], [x + w / 2, Math.max(3, y - 47)], [x + w + 7, y - 25]], "#8b7651", 1);
      for (const py of [y - 25, y + h + 13]) {
        const wood = linear(ctx, 0, py - 5, 0, py + 6, [[0, "#27180f"], [0.36, "#805038"], [0.7, "#47291d"], [1, "#21140f"]]);
        fillBox(ctx, x - 30, py - 5, w + 60, 11, wood, 4);
        fillBox(ctx, x - 35, py - 6, 7, 13, "#b69758", 2);
        fillBox(ctx, x + w + 28, py - 6, 7, 13, "#b69758", 2);
      }
      break;
    }
    case "gilt_miniature": {
      molding(ctx, r, 25, 18, 0.6, gold);
      molding(ctx, r, 18, 4, 0.7, ["#163c40", "#102c33", "#194335", "#1d4154"]);
      molding(ctx, r, 4, 0, 0.7, gold);
      for (const [cx, cy] of corners) rosette(ctx, cx, cy, 8, 8);
      for (let px = x + 12; px < x + w - 10; px += 22) {
        circle(ctx, px, y - 10, 1.1, "#e3c780"); circle(ctx, px, y + h + 10, 1.1, "#e3c780");
        line(ctx, [[px - 7, y - 11], [px, y - 15], [px + 7, y - 11]], "#a88d50", 0.6);
      }
      break;
    }
    case "museum_gilt_oil": {
      molding(ctx, r, 20, 16, 0.8, ["#d4b77b", "#7b5525", "#aa7d3a", "#b89152"]);
      molding(ctx, r, 16, 10, 0.7, ["#8e652b", "#d0a963", "#e0be78", "#8b6029"]);
      molding(ctx, r, 10, 5, 0.6, ["#e2c683", "#8b612a", "#ba914b", "#d9b773"]);
      molding(ctx, r, 5, 0, 0.6, ["#34312b", "#191e1b", "#302e25", "#232820"]);
      for (let px = x - 8; px < x + w + 12; px += 8) {
        circle(ctx, px, y - 13, 1.8, "#dec183", "#89642f", 0.5);
        circle(ctx, px, y + h + 13, 1.8, "#c6a15e", "#73511f", 0.5);
      }
      for (let py = y + 2; py < y + h; py += 8) {
        circle(ctx, x - 13, py, 1.7, "#cfaf70"); circle(ctx, x + w + 13, py, 1.7, "#a0793b");
      }
      corners.forEach(([cx, cy]) => rosette(ctx, cx, cy, 8, 6));
      break;
    }
    case "retro_crt_device": {
      const dark = meta?.isDark;
      const body = dark ? "#232927" : "#d5ccb8";
      // An even-odd shell keeps the already rendered screen fully visible.
      box(ctx, x - 24, y - 21, w + 48, h + 41, 21);
      ctx.rect(x, y, w, h); ctx.fillStyle = body; ctx.fill("evenodd");
      strokeBox(ctx, x - 22, y - 19, w + 44, h + 38, dark ? "#48504a" : "#efe6d2", 1, 19);
      for (let i = 0; i < 5; i++) {
        strokeBox(ctx, x - 1 - i, y - 1 - i, w + 2 + 2 * i, h + 2 + 2 * i,
          `rgba(2,8,6,${0.26 - i * 0.035})`, 1.4, 5 + i * 2);
      }
      for (let i = 0; i < 15; i++) {
        fillBox(ctx, x + w / 2 - 36 + i * 5, y + h + 11, 1.4, 7, dark ? "#101513" : "#716c5f", 0.7);
      }
      const pulse = clamp(finite(state.beatPulse));
      circle(ctx, x + w - 12, y + h + 15, 2.2, `rgba(143,244,171,${0.4 + pulse * 0.6})`);
      glow(ctx, x + w - 12, y + h + 15, 7, 7, "rgba(133,255,166,0.38)", pulse);
      circle(ctx, x + w - 28, y + h + 15, 3, dark ? "#4b5149" : "#aba28d", "#1e2520", 0.6);
      break;
    }
    default:
      molding(ctx, r, 6, 1.8, 0.65, ["#26272a", "#0c0d10", "#141518", "#1b1c20"]);
      molding(ctx, r, 1.8, 0, 0.4, ["#e7e4db", "#b4b3ac", "#cecdc5", "#eeebe1"]);
  }
}

function pictureLamp(ctx, r, state, { offset = 30, scale = 1 } = {}) {
  const lampX = r.x + r.w / 2, lampY = Math.max(8, r.y - offset);
  // A bounded, feathered cone avoids flooding the frame or the plaque below.
  isolated(ctx, () => {
    clipRect(ctx, r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
    const endY = r.y + r.h * 0.73;
    for (let i = 0; i < 8; i++) {
      const spread = r.w * (0.45 + i * 0.026);
      const g = linear(ctx, 0, lampY + 8 * scale, 0, endY, [
        [0, "rgba(255,207,130,0.052)"], [0.3, "rgba(255,207,130,0.024)"], [1, "rgba(255,207,130,0)"],
      ]);
      ctx.beginPath(); ctx.moveTo(lampX - 29 * scale, lampY + 5 * scale); ctx.lineTo(lampX + 29 * scale, lampY + 5 * scale);
      ctx.lineTo(lampX + spread, endY); ctx.quadraticCurveTo(lampX, endY + 28, lampX - spread, endY);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
    glow(ctx, lampX, r.y + 6, r.w * 0.55, r.h * 0.44, "rgba(255,207,130,0.12)");
    const sheen = linear(ctx, r.x, r.y, r.x + r.w, r.y + r.h, [
      [0, "rgba(255,246,221,0)"], [0.36, "rgba(255,246,221,0)"],
      [0.39, "rgba(255,246,221,0.035)"], [0.43, "rgba(255,246,221,0)"],
      [0.73, "rgba(255,246,221,0.018)"], [1, "rgba(255,246,221,0)"],
    ]);
    ctx.fillStyle = sheen; ctx.fillRect(r.x, r.y, r.w, r.h);
    line(ctx, [[r.x + r.w * 0.65, r.y + 2], [r.x + r.w * 0.18, r.y + r.h * 0.58]], "rgba(255,249,228,0.055)", 1);
  });
  isolated(ctx, () => {
    ctx.translate(lampX, lampY); ctx.scale(scale, scale);
    circle(ctx, 0, -3, 5, "#6b502b", "#d0ae64", 0.7);
    ctx.beginPath(); ctx.moveTo(0, -2);
    ctx.bezierCurveTo(-13, -16, 3, -21, 8, -5);
    ctx.strokeStyle = "#584020"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = "#d2b06b"; ctx.lineWidth = 1.8; ctx.stroke();
    const brass = linear(ctx, 0, -5, 0, 5,
      [[0, "#f2d796"], [0.4, "#b99750"], [0.78, "#80602b"], [1, "#d0ae60"]]);
    fillBox(ctx, -35, -5, 70, 10, brass, 4);
    fillBox(ctx, -29, 3, 58, 2.2, "#ffe6ad", 1);
    glow(ctx, 0, 6, 47, 13, "rgba(255,207,130,0.34)", 0.9 + 0.1 * clamp(finite(state.beatPulse)));
  });
}

function microPhysics(ctx, state, r, kind) {
  if (!kind) return;
  const t = time(state), pulse = clamp(finite(state.beatPulse));
  isolated(ctx, () => {
    // Particles may cross the molding, but never enter the curator plaque.
    clipRect(ctx, 0, 0, 960, 660);
    PARTICLES.forEach((p, i) => {
      const phase = fract(t * p.speed + p.phase);
      const excursion = mix(-9, 27, phase);
      let x, y;
      if (p.edge === 0) { x = r.x + p.along * r.w; y = r.y - excursion; }
      else if (p.edge === 1) { x = r.x + r.w + excursion; y = r.y + p.along * r.h; }
      else if (p.edge === 2) { x = r.x + p.along * r.w; y = r.y + r.h + excursion; }
      else { x = r.x - excursion; y = r.y + p.along * r.h; }
      x += Math.sin(t * 0.8 + i) * p.sway * 5;
      const a = Math.sin(phase * Math.PI) * 0.48;
      const s = p.size;
      isolated(ctx, () => {
        ctx.globalAlpha *= a; ctx.lineCap = "round";
        switch (kind) {
          case "ochre_dust": circle(ctx, x, y, s * 0.65, "#c88d53"); break;
          case "papyrus_grains": line(ctx, [[x - s, y - 1], [x + s, y + 2]], "#d2b67b", 0.7); break;
          case "stone_chips":
            ctx.beginPath(); ctx.moveTo(x - s, y + s); ctx.lineTo(x, y - s); ctx.lineTo(x + s * 1.6, y); ctx.closePath();
            ctx.fillStyle = "#b9b09b"; ctx.fill(); break;
          case "silk_ribbon":
            ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.bezierCurveTo(x - 3, y - 8, x + 3, y + 8, x + 9, y - 2);
            ctx.strokeStyle = "#b74432"; ctx.lineWidth = 1.1; ctx.stroke(); break;
          case "ink_mist": glow(ctx, x, y, s * 5, s * 1.4, "rgba(56,67,57,0.24)"); break;
          case "river_ripples": case "woodblock_foam":
            ctx.beginPath(); ctx.ellipse(x, y, s * 3.5, s * 0.75, 0, 0.1, Math.PI * 1.8);
            ctx.strokeStyle = kind === "woodblock_foam" ? "#e9e5cf" : "#728f8c"; ctx.lineWidth = 0.8; ctx.stroke(); break;
          case "mineral_dots":
            circle(ctx, x, y, s, ["#a34c33", "#438f87", "#c7ab67"][i % 3]); break;
          case "gold_petals":
            ctx.beginPath(); ctx.ellipse(x, y, s * 1.8, s * 0.6, t * 0.5 + i, 0, TAU);
            ctx.fillStyle = "#d7b260"; ctx.fill(); break;
          case "ink_drip":
            circle(ctx, x, y, s * 0.6, "#343a32"); line(ctx, [[x, y - 5], [x, y]], "#343a32", 0.7); break;
          case "ember_sparks":
            line(ctx, [[x, y], [x + p.sway * 5, y - s * 4]], "#f4ba65", 0.8); break;
          case "impasto_stars":
            line(ctx, [[x - s * 2, y], [x + s * 2, y]], "#e9cf72", 1.2);
            line(ctx, [[x, y - s * 2], [x, y + s * 2]], "#f7e1a1", 0.9); break;
          case "expression_waves":
            ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.bezierCurveTo(x - 3, y - 5, x + 2, y + 6, x + 8, y);
            ctx.strokeStyle = "#d78d63"; ctx.lineWidth = 1; ctx.stroke(); break;
          case "silver_grain": fillBox(ctx, x, y, 0.9, 0.9, "#dadbd5"); break;
          case "osc_arc":
            line(ctx, [[x - 5, y], [x - 1, y - s * 3], [x + 2, y + s], [x + 6, y - 3]], "#8fffc0", 0.7 + pulse); break;
          case "pixel_coins":
            strokeBox(ctx, Math.round(x), Math.round(y), 4, 5, "#f6d573", 1);
            line(ctx, [[Math.round(x) + 2, Math.round(y) + 1], [Math.round(x) + 2, Math.round(y) + 4]], "#fff0ad", 1); break;
          case "window_jitter":
            strokeBox(ctx, x + Math.floor(Math.sin(t * 8 + i) * 2), y, 9, 6, "#9ab8d5", 0.7);
            line(ctx, [[x, y + 2], [x + 9, y + 2]], "#678ab1", 0.6); break;
          case "tape_glitch": fillBox(ctx, x - 6, y, 8 + s * 4, 0.8, i % 2 ? "#d5a0d2" : "#8ddedb"); break;
          case "heart_bursts":
            ctx.beginPath(); ctx.moveTo(x, y + s * 1.8);
            ctx.bezierCurveTo(x - s * 4, y - s, x - s, y - s * 3, x, y - s);
            ctx.bezierCurveTo(x + s, y - s * 3, x + s * 4, y - s, x, y + s * 1.8);
            ctx.fillStyle = "#eab3a2"; ctx.fill(); break;
          case "fourier_trace": {
            const points = Array.from({ length: 15 }, (_, j) => [x + j - 7, y + Math.sin(j * 0.65 + t * 2) * s]);
            line(ctx, points, "#c4dec5", 0.7); break;
          }
        }
      });
    });
  });
}

export function renderGalleryFrameAndLighting(ctx, state = {}, sceneRect = DEFAULT_RECT, sceneCtx = {}) {
  isolated(ctx, () => {
    const r = rect(sceneRect), meta = sceneCtx.sceneMeta ?? sceneOf(state);
    const requested = meta?.frameSystem?.id ?? meta?.frameSystem ?? "contemporary_frame";
    const system = Object.hasOwn(FRAME_SYSTEMS, requested) ? requested : "contemporary_frame";
    // This clip protects both the plaque and the caller's surrounding viewport.
    clipRect(ctx, 0, 0, 960, 665);
    ctx.lineJoin = "round";
    drawFrame(ctx, r, system, state, meta);
    pictureLamp(ctx, r, state);
    microPhysics(ctx, state, r, meta?.crossPhysics);
  });
}

function timecode(t) {
  const ticks = Math.floor(clamp(t, 0, C.TOTAL_DURATION) * 10 + 1e-7);
  return `${String(Math.floor(ticks / 600)).padStart(2, "0")}:${String(Math.floor(ticks / 10) % 60).padStart(2, "0")}.${ticks % 10}`;
}

export function renderCuratorPlaque(ctx, state = {}) {
  isolated(ctx, () => {
    clipRect(ctx, 72, 666, 816, 48);
    const t = time(state), meta = sceneOf(state), act4 = t >= C.ACT3_END;
    const act2 = state.act === "act2" || (t >= (C.SHUTTER_END ?? 4.35) && t < (C.ACT2_END ?? 11.45));
    const left = act4 ? "ACT IV · 六千年美术馆" : act2 ? "ACT II · 手风琴画廊" : meta?.plaqueLeft ?? "序章 · 鹈鹕骑行六千年";
    const caption = act4 ? "第 21 席 · 静候鹈鹕本人回应" : act2 ? "二十种时代 · 同一位骑行者" : meta?.caption ?? "一场跨越六千年的骑行";
    const right = act4 ? "6000 YEARS · 20 + 1" : meta?.plaqueRight ?? "CODE · ART · MUSIC";
    fillBox(ctx, 72, 666, 816, 48, "#141210", 3);
    ctx.fillStyle = linear(ctx, 0, 667, 0, 714, [[0, "rgba(190,156,88,0.13)"], [0.35, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.2)"]]);
    ctx.fillRect(73, 667, 814, 46);
    for (let i = 0; i < 13; i++) line(ctx, [[78, 669 + i * 3.4], [882, 669 + i * 3.4]], "rgba(220,191,132,0.025)", 0.4);
    strokeBox(ctx, 72.75, 666.75, 814.5, 46.5, "#c9a252", 0.9, 3);
    strokeBox(ctx, 76, 670, 808, 40, "rgba(201,162,82,0.58)", 0.5, 1);
    for (const x of [81, 879]) for (const y of [675, 705]) {
      circle(ctx, x, y, 1.7, "#c9a252", "#69502a", 0.4);
      line(ctx, [[x - 0.7, y + 0.7], [x + 0.7, y - 0.7]], "#49371f", 0.5);
    }
    line(ctx, [[329, 677], [329, 703]], "rgba(201,162,82,0.25)", 0.5);
    line(ctx, [[620, 677], [620, 703]], "rgba(201,162,82,0.25)", 0.5);
    label(ctx, left, 94, 695, 14, "#f4ead2", { maxWidth: 222, family: "serif" });
    label(ctx, caption, 474, 686, 10.8, "#ccb98f", { align: "center", maxWidth: 266 });
    const audio = state.audio ?? {};
    ["vocal", "guitar", "iron", "room"].forEach((name, i) => {
      const h = 2 + 10 * clamp(finite(audio[name]));
      fillBox(ctx, 462 + i * 6, 703 - h, 3, h, i === 2 ? "#d8b270" : "#a7b990", 0.7);
    });
    label(ctx, right, 866, 685, 10.5, "#f4ead2", { align: "right", maxWidth: 232 });
    label(ctx, `${timecode(t)} / 02:54.6`, 866, 702, 11.5, "#ccb98f", { align: "right", maxWidth: 232 });
  });
}

function wrapLyrics(text, size, width) {
  const chars = Array.from(text), lines = [];
  let current = "", offset = 0;
  for (const ch of chars) {
    if (ch === "\n" || (current && measureGlyphText(current + ch, size, "serif", 0) > width)) {
      lines.push({ text: current.trimEnd(), offset });
      offset += Array.from(current).length;
      current = "";
      if (ch === "\n") { offset++; continue; }
    }
    current += ch;
  }
  if (current) lines.push({ text: current.trimEnd(), offset });
  return lines;
}

function lyricBounds(state, r, meta) {
  let x0 = r.x + 18, x1 = r.x + r.w - 18;
  if (indexOf(state, meta) === 18) {
    const k = smooth(progressOf(state, meta) / 0.25);
    const cropX0 = 218.75 * k, cropX1 = 1000 - 218.75 * k;
    x0 = Math.max(x0, r.x + cropX0 / 1000 * r.w + 18);
    x1 = Math.min(x1, r.x + cropX1 / 1000 * r.w - 18);
  }
  return { x0, x1, y0: Math.max(0, r.y + 12), y1: Math.min(BOTTOM_SAFE, r.y + r.h - 10) };
}

function lyricOrnament(ctx, kind, x, y, color, t, beat, seed) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.lineCap = "round";
  const pulse = 0.5 + 0.5 * Math.sin(t * 6 + seed);
  switch (kind) {
    case "route_arc":
      ctx.beginPath(); ctx.moveTo(x - 18, y + 4); ctx.quadraticCurveTo(x, y - 20, x + 19, y + 1); ctx.stroke();
      circle(ctx, x - 18, y + 4, 1.8, color); circle(ctx, x + 19, y + 1, 1.8, color); break;
    case "chisel_sparks":
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + seed, r = 7 + 5 * pulse;
        line(ctx, [[x + Math.cos(a) * r, y + Math.sin(a) * r], [x + Math.cos(a) * (r + 3 + beat * 4), y + Math.sin(a) * (r + 3 + beat * 4)]], color, 1);
      } break;
    case "vermilion_seal":
      strokeBox(ctx, x - 12, y - 12, 24, 24, "#bc3e2f", 1.5, 1);
      strokeBox(ctx, x - 9, y - 9, 18, 18, "#bc3e2f", 0.5);
      label(ctx, "六千年", x, y + 3, 6, "#bc3e2f", { align: "center", maxWidth: 17, family: "serif" }); break;
    case "beak_caliper":
      line(ctx, [[x - 20, y - 5], [x + 20, y - 5], [x + 8, y + 5]], color, 1.3);
      line(ctx, [[x - 20, y - 9], [x - 20, y + 4]], color, 1);
      line(ctx, [[x + 20, y - 9], [x + 20, y + 1]], color, 1);
      for (let i = 0; i < 6; i++) line(ctx, [[x - 15 + i * 6, y - 5], [x - 15 + i * 6, y - 2]], color, 0.6);
      break;
    case "bell_ripples":
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(x, y, 5 + i * 5 + pulse * 2, -1.2, 1.2); ctx.stroke();
      }
      circle(ctx, x, y, 3, color); break;
    case "smile_arc":
      ctx.beginPath(); ctx.arc(x, y - 5, 14 + pulse, 0.18, Math.PI - 0.18); ctx.stroke();
      circle(ctx, x - 8, y - 8, 1.2, color); circle(ctx, x + 8, y - 8, 1.2, color); break;
    case "speed_lines":
      for (let i = 0; i < 4; i++) {
        const shift = fract(t * 0.8 + i * 0.19) * 5;
        line(ctx, [[x - 22 + shift, y - 9 + i * 6], [x + 11 - i * 3 + shift, y - 9 + i * 6]], color, i === 1 ? 1.4 : 0.7);
      } break;
    case "history_slash":
      line(ctx, [[x - 18, y + 12], [x + 18, y - 12]], color, 1.4);
      for (let i = 0; i < 5; i++) {
        const px = x - 14 + i * 7, py = y + 9 - i * 4.5;
        line(ctx, [[px - 2, py - 3], [px + 2, py + 3]], color, 0.8);
      } break;
  }
}

export function renderSpatialLyrics(ctx, state = {}, sceneRect = DEFAULT_RECT) {
  const t = time(state);
  if (t < C.FIRST_LYRIC_T || t > C.LAST_LYRIC_T) return;
  // Prefer the currently sung cue when two extended fade windows intersect.
  const cue = LYRICS_CUES.find((c) => t >= c.startT && t <= c.endT) ??
    LYRICS_CUES.find((c) => t >= c.startT - 0.12 && t <= c.endT + 0.16);
  if (!cue) return;
  isolated(ctx, () => {
    const meta = sceneOf(state), r = rect(sceneRect), bounds = lyricBounds(state, r, meta);
    if (bounds.x1 - bounds.x0 < 24 || bounds.y1 - bounds.y0 < 20) return;
    const paper = meta?.lyricTheme === "paper_ink";
    const sung = paper ? "#201c17" : "#ffe49e";
    const upcoming = paper ? "#6c6257" : "#faf3e3";
    const highlight = paper ? "#bc3e2f" : "#ffd166";
    const width = bounds.x1 - bounds.x0;
    let size = width < 300 ? 23 : 28;
    let lines = wrapLyrics(cue.text, size, width - 18);
    // Keep all lines, their animated glyph ascenders, and ornaments inside safe bounds.
    const availableHeight = bounds.y1 - bounds.y0;
    while ((lines.length * size * 1.42 + 42 > availableHeight) && size > 10) {
      size--; lines = wrapLyrics(cue.text, size, width - 18);
    }
    const lineHeight = size * 1.42, blockHeight = lines.length * lineHeight + 38;
    const anchor = { top: 0.1, upper_mid: 0.28, mid: 0.47, bottom: 0.78 }[cue.anchorZone] ?? 0.14;
    const top = clamp(r.y + r.h * anchor, bounds.y0, Math.max(bounds.y0, bounds.y1 - blockHeight));
    const centerX = (bounds.x0 + bounds.x1) / 2;
    clipRect(ctx, bounds.x0, bounds.y0, width, bounds.y1 - bounds.y0);
    ctx.globalAlpha *= smooth((t - cue.startT + 0.12) / 0.15) * smooth((cue.endT + 0.16 - t) / 0.18);
    const widest = Math.max(...lines.map((l) => measureGlyphText(l.text, size, "serif", 0)));
    if (paper) {
      glow(ctx, centerX, top + blockHeight / 2 - 6, Math.min(width / 2, widest / 2 + 25), blockHeight * 0.78,
        "rgba(250,239,211,0.90)");
      fillBox(ctx, centerX - Math.min(width - 4, widest + 18) / 2, top + 5,
        Math.min(width - 4, widest + 18), blockHeight - 17, "rgba(245,232,201,0.24)", 10);
    } else {
      ctx.shadowColor = "rgba(12,12,12,0.9)"; ctx.shadowBlur = 3;
    }
    const textChars = Array.from(cue.text);
    const cueIndexByText = [];
    let n = 0;
    for (const ch of textChars) cueIndexByText.push(/\s/u.test(ch) ? -1 : n++);
    let activeAnchor = null;
    lines.forEach((ln, lineIndex) => {
      const baseline = top + size + 9 + lineIndex * lineHeight;
      const textWidth = measureGlyphText(ln.text, size, "serif", 0);
      const startX = centerX - textWidth / 2;
      drawGlyphText(ctx, ln.text, startX, baseline, size, {
        family: "serif", color: upcoming, stroke: paper ? null : "#171411", lineWidth: paper ? 0 : 2.6,
        onChar(ch, i, placement) {
          const syllable = cue.chars[cueIndexByText[ln.offset + i]];
          if (!syllable) return { color: upcoming };
          const active = t >= syllable.t0 && t <= syllable.t1;
          const elapsed = clamp((t - syllable.t0) / Math.max(0.02, syllable.t1 - syllable.t0));
          const bounce = active ? Math.sin(elapsed * Math.PI) : 0;
          if (active) activeAnchor = { x: placement.x + placement.advance / 2, y: baseline - size * 0.5 };
          return { color: active ? highlight : t > syllable.t1 ? sung : upcoming,
            scale: 1 + bounce * 0.065, dy: -bounce * 2, opacity: t < syllable.t0 ? 0.8 : 1 };
        },
      });
    });
    ctx.shadowBlur = 0;
    const ornamentX = clamp(activeAnchor?.x ?? centerX, bounds.x0 + 23, bounds.x1 - 23);
    const ornamentY = Math.min(bounds.y1 - 18, top + lines.length * lineHeight + 15);
    lyricOrnament(ctx, cue.ornament, ornamentX, ornamentY, paper ? "#bc3e2f" : "#ffd166",
      t, clamp(finite(state.beatPulse)), finite(cue.id));
  });
}

function downloadArrow(ctx, x, y, size, color, done = false) {
  if (done) line(ctx, [[x - size * 0.4, y], [x - size * 0.1, y + size * 0.27], [x + size * 0.45, y - size * 0.35]], color, 1.7);
  else {
    line(ctx, [[x, y - size * 0.45], [x, y + size * 0.2]], color, 1.5);
    line(ctx, [[x - size * 0.25, y - size * 0.05], [x, y + size * 0.2], [x + size * 0.25, y - size * 0.05]], color, 1.5);
    line(ctx, [[x - size * 0.42, y + size * 0.25], [x - size * 0.42, y + size * 0.5], [x + size * 0.42, y + size * 0.5], [x + size * 0.42, y + size * 0.25]], color, 1);
  }
}

function glassPanel(ctx, x, y, w, h, radius, u) {
  glow(ctx, x + w / 2, y + h / 2, w * 0.66, h * 0.8, "rgba(244,209,137,0.15)", u);
  fillBox(ctx, x + 1, y + 3, w, h, "rgba(0,0,0,0.22)", radius);
  fillBox(ctx, x, y, w, h, "rgba(25,29,28,0.90)", radius);
  const frost = linear(ctx, x, y, x + w * 0.7, y + h,
    [[0, "rgba(255,249,223,0.22)"], [0.42, "rgba(255,248,225,0.055)"], [1, "rgba(219,211,185,0.035)"]]);
  fillBox(ctx, x + 1, y + 1, w - 2, h - 2, frost, radius);
  strokeBox(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, "rgba(231,203,142,0.84)", 0.9, radius);
  strokeBox(ctx, x + 3, y + 3, w - 6, h - 6, "rgba(255,247,214,0.10)", 0.6, Math.max(1, radius - 2));
}

export function renderDownloadCapsuleAndReveal(ctx, state = {}, bundleInfo = {}) {
  isolated(ctx, () => {
    const t = time(state), filename = String(bundleInfo.filename || "pelican-6000-mv.html");
    const exactBytes = Math.max(0, finite(bundleInfo.exactBytes || 2048000, 2048000));
    // Timeline is authoritative at 0 and completion; supplied progress agrees
    // with it normally, but stale preview state cannot desynchronize the counter.
    const timelineProgress = clamp(t / C.DOWNLOAD_COMPLETE_T);
    const supplied = clamp(finite(state.downloadProgress, timelineProgress));
    const progress = Math.abs(supplied - timelineProgress) < 1e-7 ? supplied : timelineProgress;
    const reveal = t >= C.REVEAL_CARD_T;
    const u = reveal ? clamp((t - C.REVEAL_CARD_T) / 0.85) : 0;
    const e = smooth(u), x = mix(696, 205, e), y = mix(14, 212, e);
    const w = mix(248, 550, e), h = mix(42, 248, e), radius = mix(9, 20, e);
    glassPanel(ctx, x, y, w, h, radius, e);
    isolated(ctx, () => {
      box(ctx, x + 5, y + 5, w - 10, h - 10, Math.max(3, radius - 4)); ctx.clip();
      if (e < 1) {
        isolated(ctx, () => {
          ctx.globalAlpha *= 1 - smooth(u / 0.62);
          downloadArrow(ctx, x + 17, y + 15, 14, "#ebd8a6", progress >= 1);
          label(ctx, filename, x + 32, y + 16, 9.2, "#faf1d7", { maxWidth: w - 83 });
          label(ctx, `${Math.round(progress * 100)}%`, x + w - 12, y + 16, 10, "#ffe4a0", { align: "right", maxWidth: 36 });
          label(ctx, `${Math.floor(exactBytes * progress).toLocaleString("en-US")} / ${exactBytes.toLocaleString("en-US")} B`,
            x + 32, y + 29, 7.4, "#c9c9b5", { maxWidth: w - 44 });
          fillBox(ctx, x + 12, y + h - 7, w - 24, 2, "rgba(255,240,196,0.13)", 1);
          if (progress > 0) fillBox(ctx, x + 12, y + h - 7, (w - 24) * progress, 2,
            linear(ctx, x + 12, 0, x + w - 12, 0, [[0, "#d4b87a"], [1, "#91c6aa"]]), 1);
        });
      }
      if (reveal && u > 0) {
        ctx.globalAlpha *= smooth((u - 0.18) / 0.82);
        const cx = x + w / 2, top = y;
        circle(ctx, cx, top + 44, 21, "rgba(187,208,164,0.11)", "#cfb879", 0.8);
        downloadArrow(ctx, cx, top + 43, 21, "#cfe7b4", true);
        fillBox(ctx, x + w - 83, top + 19, 57, 23, "rgba(209,185,111,0.15)", 11);
        label(ctx, "100%", x + w - 54, top + 35, 13, "#ffe49e", { align: "center" });
        label(ctx, `${filename}  ·  下载完成 100%`, cx, top + 89, 18, "#fff0c9", { align: "center", maxWidth: w - 42 });
        label(ctx, `${exactBytes.toLocaleString("en-US")} Bytes (${(exactBytes / (1024 * 1024)).toFixed(2)} MB)`,
          cx, top + 132, 26, "#ffe0a0", { align: "center", maxWidth: w - 48 });
        line(ctx, [[x + 42, top + 153], [x + w - 42, top + 153]], "rgba(224,198,138,0.28)", 0.7);
        label(ctx, "全片纯代码，无任何音频/贴图，不到半张照片 Size", cx, top + 182, 16, "#f4ead2",
          { align: "center", family: "serif", maxWidth: w - 42 });
        label(ctx, "ZERO MP3 · ZERO PNG · ZERO WOFF2 · SVG + AudioWorklet + WebGL", cx, top + 217, 8.3, "#b9bda9",
          { align: "center", maxWidth: w - 48 });
      }
    });
  });
}

function miniature(ctx, meta, image, r) {
  isolated(ctx, () => {
    clipRect(ctx, r.x, r.y, r.w, r.h);
    if (image) ctx.drawImage(image, r.x, r.y, r.w, r.h);
    else {
      const palette = meta.palette ?? {};
      ctx.fillStyle = linear(ctx, r.x, r.y, r.x + r.w, r.y + r.h,
        [[0, palette.bg ?? "#cbbb94"], [1, palette.primary ?? "#596252"]]);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Distinct, restrained horizon marks read as editions at miniature scale.
      const ridge = Array.from({ length: 9 }, (_, i) => [r.x + r.w * i / 8,
        r.y + r.h * (0.52 + 0.12 * Math.sin(i * 1.7 + meta.index))]);
      line(ctx, ridge, palette.accent ?? "#cbb270", 2);
      circle(ctx, r.x + r.w * 0.72, r.y + r.h * 0.27, 5, palette.accent ?? "#d5ba74");
      label(ctx, meta.code, r.x + 6, r.y + 14, 12, "#f4e3b4", { maxWidth: r.w - 12 });
      label(ctx, meta.title, r.x + r.w / 2, r.y + r.h * 0.82, 8.5, "#f7edda",
        { align: "center", maxWidth: r.w - 10 });
    }
  });
  const system = meta.frameSystem;
  const colors = system === "contemporary_frame" || system === "retro_crt_device"
    ? ["#40433c", "#101613", "#252a24", "#373c34"]
    : system === "silk_scroll" ? ["#bdb18d", "#7d7359", "#a79a77", "#c2b58f"]
      : ["#d3b372", "#765729", "#b28e49", "#bfa064"];
  molding(ctx, r, 3.5, 0, 0.5, colors);
}

function emptySeat(ctx, r, t) {
  const cx = r.x + r.w / 2;
  const velvet = linear(ctx, r.x, 0, r.x + r.w, 0,
    [[0, "#27281f"], [0.3, "#454536"], [0.5, "#5a5540"], [0.7, "#393c2e"], [1, "#252a21"]]);
  fillBox(ctx, r.x, r.y, r.w, r.h, velvet, 1);
  glow(ctx, cx, r.y + 8, r.w * 0.7, r.h * 1.1, "rgba(255,218,147,0.29)");
  for (const [cx0, cy0, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
    [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
    line(ctx, [[cx0, cy0 + sy * 13], [cx0, cy0], [cx0 + sx * 13, cy0]], "#d9b573", 2);
  }
  label(ctx, "21", cx, r.y + 29, 19, "#ead399", { align: "center" });
  label(ctx, "第 21 席 · 发布会席位", cx, r.y + 47, 8, "#f4ead2", { align: "center", maxWidth: r.w - 7 });
  label(ctx, "静候「鹈鹕本人」回应", cx, r.y + 63, 8.2, "#dcc79a", { align: "center", maxWidth: r.w - 7 });
  line(ctx, [[cx - 17, r.y + r.h - 9], [cx + 17, r.y + r.h - 9]], "rgba(221,191,124,0.5)", 0.7);
  // Dust in the vacant spotlight is time-addressed, just like the main wall.
  for (let i = 0; i < 4; i++) circle(ctx, cx + Math.sin(i * 3.1 + t * 0.25) * 18,
    r.y + 8 + fract(t * 0.035 + i * 0.27) * (r.h - 16), 0.6, "rgba(251,224,170,0.35)");
}

export function renderAct4GalleryWall(ctx, state = {}, sceneRect = DEFAULT_RECT, miniatures = []) {
  const t = time(state);
  if (t < C.ACT3_END) return;
  isolated(ctx, () => {
    clipRect(ctx, 0, 0, 960, 665);
    const start = rect(sceneRect), u = smooth((t - C.ACT3_END) / (151.2 - C.ACT3_END));
    renderGalleryWallBackdrop(ctx, { ...state, realT: t }, start);
    // The camera starts exactly on slot 19 and pulls back to the complete wall.
    // Its thumbnail is the same Canvas/ImageBitmap used by the final edition.
    const grid = { x: 48, y: 126, w: 864, h: 432 };
    const cellW = grid.w / 7, cellH = grid.h / 3;
    const slotRect = (i) => ({ x: grid.x + (i % 7) * cellW + 9,
      y: grid.y + Math.floor(i / 7) * cellH + 7, w: cellW - 18, h: 82 });
    const last = slotRect(19), focus = { x: last.x + last.w / 2, y: last.y + last.h / 2 };
    const zoomX = mix(start.w / last.w, 1, u), zoomY = mix(start.h / last.h, 1, u);
    const targetX = mix(start.x + start.w / 2, focus.x, u);
    const targetY = mix(start.y + start.h / 2, focus.y, u);
    isolated(ctx, () => {
      ctx.translate(targetX, targetY); ctx.scale(zoomX, zoomY); ctx.translate(-focus.x, -focus.y);
      SCENES_META.forEach((meta, i) => {
        const r = slotRect(i);
        miniature(ctx, meta, miniatures[i], r);
        fillBox(ctx, r.x + 6, r.y + r.h + 9, r.w - 12, 20, "#201d16", 1);
        strokeBox(ctx, r.x + 6, r.y + r.h + 9, r.w - 12, 20, "#957941", 0.45, 1);
        label(ctx, `${meta.code} · ${meta.title}`, r.x + r.w / 2, r.y + r.h + 18,
          6.5, "#e4d1a5", { align: "center", maxWidth: r.w - 18 });
        label(ctx, meta.era, r.x + r.w / 2, r.y + r.h + 26, 5.8, "#b5a17c", { align: "center", maxWidth: r.w - 18 });
      });
      const empty = slotRect(20);
      emptySeat(ctx, empty, t);
      fillBox(ctx, empty.x - 2, empty.y + empty.h + 8, empty.w + 4, 24, "#2d291e", 1);
      strokeBox(ctx, empty.x - 2, empty.y + empty.h + 8, empty.w + 4, 24, "#c9a252", 0.6, 1);
      label(ctx, "第 21 席 · 发布会席位", empty.x + empty.w / 2, empty.y + empty.h + 18, 6.4, "#f4ead2",
        { align: "center", maxWidth: empty.w - 4 });
      label(ctx, "静候「鹈鹕本人」回应", empty.x + empty.w / 2, empty.y + empty.h + 27, 6.4, "#ddc694",
        { align: "center", maxWidth: empty.w - 4 });
      pictureLamp(ctx, empty, state, { offset: 12, scale: 0.45 });
    });
    isolated(ctx, () => {
      ctx.globalAlpha *= u;
      label(ctx, "六千年 · 同一位骑行者", 480, 83, 25, "#e5d4ae", { align: "center", family: "serif", maxWidth: 800 });
      label(ctx, "6000 YEARS / TWENTY EDITIONS / ONE OPEN SEAT", 480, 105, 9.5, "#a99570", { align: "center" });
      line(ctx, [[390, 572], [570, 572]], "rgba(201,162,82,0.35)", 0.7);
      label(ctx, "第 21 席 · 发布会席位 · 静候「鹈鹕本人」回应", 480, 592, 12, "#ead8b2", { align: "center", maxWidth: 750 });
      const travel = fract((t - C.ACT3_END) / 48);
      const x = 84 + travel * 790, scale = 0.18;
      const kin = computePelicanKinematics(t, 19, { x, roadY: 656, scale, trackCamera: true, stopWindows: [] });
      // Explicit placement keeps wheel contact at the wainscot, independent of
      // the source character's 1000-unit scene coordinate system.
      drawPelicanBicycleCanvas2D(ctx, kin, { x, y: 656 - kin.wheelRadius * scale,
        mode: "silhouette", alpha: 0.7, spokes: 8,
        palette: { ink: "#eee6d4", feather: "#f3eddf", wing: "#f3eddf", beak: "#eee6d4",
          pouch: "#eee6d4", feet: "#eee6d4", accent: "#eee6d4", frame: "#d8cfb8", metal: "#c9bea2" } });
    });
  });
}
