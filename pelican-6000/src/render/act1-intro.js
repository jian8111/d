// 署名: PRO2H(hadcockulloa@gmail.com)
import { drawGlyphText, SEAL_LIUQIANNIAN } from '../data/glyphs.js';
import * as scenes from '../data/scenes-meta.js';
import { solveTwoBoneIK, computePelicanKinematics, drawPelicanBicycleCanvas2D } from './ik-pelican.js';

// All public renderers accept absolute seconds, in a 960 × 720 logical space.
// Apply the backing-store / 4K transform in the caller; no renderer resets it.
const W = 960, H = 720, STELE_W = 344;
const SHUTTER_START = 3.55, SHUTTER_END = 4.35, SVG_HIDE = 4.40;
const OPEN_START = 10.02, ACT2_END = 11.45;
const GOLD = '#d7ad5c', OLD_GOLD = '#9a732f';
const INTRO_IRON_TIMES = scenes.INTRO_IRON_TIMES || scenes.MV_TIMELINE_CONFIG.INTRO_IRON_TIMES;
const ACCORDION_DRAWERS = scenes.ACCORDION_DRAWERS;
const NS = 'http://www.w3.org/2000/svg';
const layers = new WeakMap();
const panelCaches = new WeakMap();
let layerSerial = 0;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, p) => a + (b - a) * p;
const smooth = p => { p = clamp(p); return p * p * (3 - 2 * p); };
const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const fmt = n => Number(n.toFixed(3));
const timeOf = state => {
  const t = typeof state === 'number' ? state : state?.realT ?? state?.t ?? state?.time ?? state?.timeSeconds ?? 0;
  return Number.isFinite(t) ? t : 0;
};

function shutterAt(t) {
  const p = smooth((t - SHUTTER_START) / (SHUTTER_END - SHUTTER_START));
  const x = mix(-240, 1200, p);
  return { p, top: x + 190, bottom: x - 190 };
}

function clipShutter(ctx, t, revealed) {
  const s = shutterAt(t);
  ctx.beginPath();
  ctx.moveTo(revealed ? 0 : W, 0);
  ctx.lineTo(s.top + (revealed ? 0 : 12), 0);
  ctx.lineTo(s.bottom + (revealed ? 0 : 12), H);
  ctx.lineTo(revealed ? 0 : W, H);
  ctx.closePath();
  ctx.clip();
}

function poly(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function svgNode(doc, tag, attrs = {}, parent) {
  const node = doc.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

// A pose is derived from the actual strike list, including the two strikes after
// the shutter. No frame counters, timers, randomness, or accumulated simulation.
function strikeDrive(t, parity) {
  let previous = -Infinity, next = Infinity;
  INTRO_IRON_TIMES.forEach((hit, i) => {
    if (i % 2 !== parity) return;
    if (hit <= t) previous = hit;
    else if (next === Infinity) next = hit;
  });
  const age = t - previous;
  if (age >= 0 && age < 0.085) return mix(1, 0.87, smooth(age / 0.085));
  if (age < 0.30) return 0.87 * (1 - smooth((age - 0.085) / 0.215));
  return smooth(1 - (next - t) / (parity ? 0.16 : 0.24));
}

function activeImpacts(t) {
  const active = [];
  INTRO_IRON_TIMES.forEach((hit, index) => {
    const age = t - hit;
    if (age >= -1e-9 && age <= 0.28 + 1e-9) active.push({ age: clamp(age, 0, 0.28), index });
  });
  return active;
}

/**
 * Persistent DOM overlay. Call renderAt(seconds or state) on every seek/frame.
 * Returns { svg, element, renderAt, update, render, destroy }. Repeated creation
 * for the same container returns its existing controller.
 */
export function createAct1SvgLayer(containerEl) {
  if (!containerEl?.ownerDocument) throw new TypeError('An Act I container element is required.');
  if (layers.has(containerEl)) return layers.get(containerEl);
  const doc = containerEl.ownerDocument;
  const prefix = 'act1-forge-' + (++layerSerial) + '-';
  const id = name => prefix + name;
  const url = name => 'url(#' + id(name) + ')';
  const svg = svgNode(doc, 'svg', {
    viewBox: '0 0 960 720', preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true', 'data-act1-svg': '',
  });
  Object.assign(svg.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', overflow: 'hidden', display: 'block',
  });
  const previousPosition = containerEl.style.position;
  const ownsPosition = doc.defaultView?.getComputedStyle(containerEl).position === 'static';
  if (ownsPosition) containerEl.style.position = 'relative';
  containerEl.appendChild(svg);
  const defs = svgNode(doc, 'defs', {}, svg);
  const stageClip = svgNode(doc, 'clipPath', { id: id('stage'), clipPathUnits: 'userSpaceOnUse' }, defs);
  svgNode(doc, 'rect', { x: STELE_W, y: 0, width: W - STELE_W, height: H }, stageClip);
  const shutterClip = svgNode(doc, 'clipPath', { id: id('shutter'), clipPathUnits: 'userSpaceOnUse' }, defs);
  const shutterPolygon = svgNode(doc, 'polygon', { points: '344,0 960,0 960,720 344,720' }, shutterClip);
  const copper = svgNode(doc, 'pattern', {
    id: id('copper'), width: 7, height: 7, patternUnits: 'userSpaceOnUse',
  }, defs);
  svgNode(doc, 'path', {
    d: 'M-2 2L2-2M0 7L7 0M5 9L9 5', stroke: GOLD, 'stroke-width': 0.65, opacity: 0.48,
  }, copper);
  const wood = svgNode(doc, 'pattern', {
    id: id('wood'), width: 19, height: 34, patternUnits: 'userSpaceOnUse',
  }, defs);
  svgNode(doc, 'path', {
    d: 'M2-3Q14 7 5 19T7 38M12-4Q22 11 14 24L12 38',
    fill: 'none', stroke: OLD_GOLD, 'stroke-width': 2.8, opacity: 0.32,
  }, wood);
  const mesh = svgNode(doc, 'pattern', {
    id: id('mesh'), width: 11, height: 11, patternUnits: 'userSpaceOnUse',
  }, defs);
  svgNode(doc, 'path', {
    d: 'M0 0L11 11M0 11L11 0', stroke: GOLD, 'stroke-width': 0.65, opacity: 0.40,
  }, mesh);
  const bandWidth = (W - STELE_W) / 3;
  ['copper', 'wood', 'mesh'].forEach((name, i) => {
    const clip = svgNode(doc, 'clipPath', { id: id('band-' + i) }, defs);
    svgNode(doc, 'rect', { x: STELE_W + bandWidth * i, y: 0, width: bandWidth, height: H }, clip);
  });
  const stage = svgNode(doc, 'g', { 'clip-path': url('stage') }, svg);
  const workshop = svgNode(doc, 'g', { 'clip-path': url('shutter') }, stage);
  svgNode(doc, 'rect', { x: STELE_W, y: 0, width: 616, height: H, fill: '#121015' }, workshop);
  ['copper', 'wood', 'mesh'].forEach((name, i) => {
    const band = svgNode(doc, 'g', { 'clip-path': url('band-' + i), 'data-engraving': name }, workshop);
    svgNode(doc, 'rect', {
      x: STELE_W + i * bandWidth, y: 0, width: bandWidth, height: H,
      fill: ['#21191a', '#171315', '#11151a'][i],
    }, band);
    svgNode(doc, 'rect', { x: STELE_W, y: 0, width: 616, height: H, fill: url(name) }, band);
    svgNode(doc, 'path', {
      d: 'M' + (STELE_W + i * bandWidth) + ' 38V682', stroke: OLD_GOLD, 'stroke-width': 0.8,
    }, band);
  });
  svgNode(doc, 'path', {
    d: 'M368 108H935M368 116H935M368 601H935M368 607H935M386 640H923',
    fill: 'none', stroke: GOLD, opacity: 0.35, 'stroke-width': 0.8,
  }, workshop);
  svgNode(doc, 'path', {
    d: 'M635 112L584 263H719L674 112ZM600 263V281H704V263M648 55V112M660 55V112',
    fill: '#151216', stroke: OLD_GOLD, 'stroke-width': 2,
  }, workshop);
  const radiant = svgNode(doc, 'g', { fill: GOLD, opacity: 0.13 }, workshop);
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI + (i + 0.5) * Math.PI / 11;
    const r = 125 + noise(i) * 90;
    const x = 652 + Math.cos(angle) * r, y = 492 + Math.sin(angle) * r;
    svgNode(doc, 'polygon', { points: '652,492 ' + fmt(x - 7) + ',' + fmt(y) + ' ' + fmt(x + 7) + ',' + fmt(y - 11) }, radiant);
  }

  function smith(x, mirrored) {
    const g = svgNode(doc, 'g', {}, workshop);
    const flip = mirrored ? -1 : 1;
    const body = svgNode(doc, 'g', { transform: 'translate(' + x + ' 0) scale(' + flip + ' 1)' }, g);
    svgNode(doc, 'path', {
      d: 'M-31 430L-43 588L-64 610H-20L2 485L17 587L8 610H53L38 429Z',
      fill: '#171316', stroke: OLD_GOLD, 'stroke-width': 2,
    }, body);
    svgNode(doc, 'path', {
      d: 'M-25 314Q0 298 26 321L43 435Q0 465-40 433Z',
      fill: '#b48c45', stroke: '#f0ca7e', 'stroke-width': 1.4,
    }, body);
    svgNode(doc, 'path', {
      d: 'M-25 314Q0 298 26 321L43 435Q0 465-40 433Z', fill: url(mirrored ? 'mesh' : 'copper'),
    }, body);
    svgNode(doc, 'path', {
      d: 'M-18 329L20 328L34 448L-31 448Z', fill: '#21191a', stroke: OLD_GOLD, 'stroke-width': 1.6,
    }, body);
    svgNode(doc, 'path', {
      d: 'M-15 346L24 353M-18 365L27 376M-22 389L29 401M-25 419L31 432',
      stroke: GOLD, opacity: 0.55, 'stroke-width': 1.2,
    }, body);
    svgNode(doc, 'path', {
      d: 'M-15 313V292H13V316M-24 269Q-23 240 0 239Q27 242 25 269L35 282L22 286L18 305L-1 312L-20 294Z',
      fill: '#ba985d', stroke: '#ead098', 'stroke-width': 1.6,
    }, body);
    svgNode(doc, 'path', {
      d: 'M-27 266Q-31 229 3 228Q32 230 27 261L-6 255ZM-18 283L-5 288L16 291L17 306L-3 316L-22 298Z',
      fill: '#171418', stroke: GOLD, 'stroke-width': 1.2,
    }, body);
    svgNode(doc, 'path', { d: 'M9 272L18 273M-15 246L21 249', stroke: '#22161a', 'stroke-width': 2 }, body);
    return g;
  }
  const leftSmith = smith(481, false), rightSmith = smith(827, true);

  function arm(parent) {
    const g = svgNode(doc, 'g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
    const edge = svgNode(doc, 'path', { stroke: '#171216', 'stroke-width': 20 }, g);
    const core = svgNode(doc, 'path', { stroke: '#c09b57', 'stroke-width': 13 }, g);
    const hatch = svgNode(doc, 'path', { stroke: '#f3d496', 'stroke-width': 1.4 }, g);
    const hand = svgNode(doc, 'circle', { r: 7.5, fill: '#d7b879', stroke: '#24191b', 'stroke-width': 2 }, g);
    return { edge, core, hatch, hand };
  }
  const leftTongsArm = arm(leftSmith), leftHammerArm = arm(leftSmith);
  const rightFrontArm = arm(rightSmith), rightRearArm = arm(rightSmith);
  const anvil = svgNode(doc, 'g', { 'data-forge-anvil': '' }, workshop);
  svgNode(doc, 'path', {
    d: 'M584 491H711L742 481L731 509L690 521L679 554L714 572H601L624 554L619 520L591 516L571 502Z',
    fill: '#262127', stroke: '#dfbd74', 'stroke-width': 2,
  }, anvil);
  svgNode(doc, 'path', {
    d: 'M600 498H714M628 525L668 522M635 533L661 532M614 565H697M620 570H704',
    fill: 'none', stroke: OLD_GOLD, 'stroke-width': 1,
  }, anvil);
  svgNode(doc, 'path', {
    d: 'M611 574H706L726 612H589ZM600 617H715V635H600Z', fill: '#171217', stroke: OLD_GOLD, 'stroke-width': 1.8,
  }, workshop);
  const blank = svgNode(doc, 'g', { fill: 'none', stroke: '#eeb756', 'stroke-width': 3.1 }, anvil);
  svgNode(doc, 'ellipse', { cx: 651, cy: 482, rx: 39, ry: 10 }, blank);
  svgNode(doc, 'path', { d: 'M612 482L648 456L665 480L636 481L648 456L681 482M648 456L644 448H658' }, blank);
  svgNode(doc, 'path', { d: 'M617 481Q651 468 687 482', stroke: '#fff0b5', 'stroke-width': 1.2 }, blank);
  const tongs = svgNode(doc, 'path', {
    fill: 'none', stroke: '#edca7c', 'stroke-width': 3, 'stroke-linecap': 'round',
  }, workshop);
  const chasing = svgNode(doc, 'g', {}, workshop);
  svgNode(doc, 'path', { d: 'M0 0L0 64', stroke: '#c3914e', 'stroke-width': 5 }, chasing);
  svgNode(doc, 'path', { d: 'M-16-6H17L23 3L16 10H-16Z', fill: '#d9bb7b', stroke: '#fff0b5', 'stroke-width': 1.4 }, chasing);
  const sledgeShaft = svgNode(doc, 'path', { stroke: '#a8773d', 'stroke-width': 7, 'stroke-linecap': 'round' }, workshop);
  const sledge = svgNode(doc, 'g', {}, workshop);
  svgNode(doc, 'path', {
    d: 'M-33-15L-26-20H26L33-13V14L26 20H-27L-33 14Z',
    fill: '#9e834c', stroke: '#f6d99a', 'stroke-width': 2,
  }, sledge);
  svgNode(doc, 'path', { d: 'M-24-12V13M-19-13V13M23-13V13M-14-14H17', stroke: '#4b3a26', 'stroke-width': 2 }, sledge);
  const flash = svgNode(doc, 'g', { opacity: 0, fill: '#ffe7a3' }, workshop);
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI + (i + 0.5) * Math.PI / 8;
    const r = 48 + noise(i + 70) * 70;
    svgNode(doc, 'polygon', {
      points: '652,483 ' + fmt(652 + Math.cos(angle - 0.045) * r) + ',' + fmt(483 + Math.sin(angle - 0.045) * r) + ' ' + fmt(652 + Math.cos(angle + 0.045) * r) + ',' + fmt(483 + Math.sin(angle + 0.045) * r),
    }, flash);
  }
  svgNode(doc, 'polygon', { points: '624,483 652,467 680,483 652,496', fill: '#fff8da' }, flash);
  const sparks = svgNode(doc, 'path', { fill: 'none', stroke: '#ffc75f', 'stroke-width': 1.9, 'stroke-linecap': 'round' }, workshop);
  const hotSparks = svgNode(doc, 'path', { fill: 'none', stroke: '#fff0b3', 'stroke-width': 0.8, 'stroke-linecap': 'round' }, workshop);

  function moveArm(nodes, root, target, upper, lower, bend) {
    const solved = solveTwoBoneIK(root.x, root.y, target.x, target.y, upper, lower, bend);
    const elbow = { x: solved.jointX, y: solved.jointY };
    const hand = { x: solved.endX, y: solved.endY };
    const path = 'M' + root.x + ' ' + root.y + 'L' + fmt(elbow.x) + ' ' + fmt(elbow.y) + 'L' + fmt(hand.x) + ' ' + fmt(hand.y);
    nodes.edge.setAttribute('d', path); nodes.core.setAttribute('d', path);
    nodes.hatch.setAttribute('d', path);
    nodes.hand.setAttribute('cx', hand.x); nodes.hand.setAttribute('cy', hand.y);
  }

  function renderAt(state) {
    const t = timeOf(state);
    svg.style.display = t >= 0 && t <= SVG_HIDE ? 'block' : 'none';
    // Recompute even while hidden: seeking is independent of playback history.
    const cut = shutterAt(t);
    shutterPolygon.setAttribute('points', fmt(cut.top + 12) + ',0 960,0 960,720 ' + fmt(cut.bottom + 12) + ',720');
    const hits = activeImpacts(t);
    const recoil = hits.reduce((v, hit) => v + Math.exp(-hit.age * 24) * Math.cos(hit.age * 46), 0);
    anvil.setAttribute('transform', 'translate(0 ' + fmt(recoil * 3.1) + ')');
    radiant.setAttribute('opacity', fmt(0.09 + Math.max(0, recoil) * 0.44));
    blank.setAttribute('stroke', hits.length ? '#ffe7a3' : '#eeb756');
    const small = strikeDrive(t, 1), heavy = strikeDrive(t, 0);
    const leftHand = { x: 574, y: 450 + recoil };
    moveArm(leftTongsArm, { x: 482, y: 339 }, leftHand, 73, 80, 1);
    const chaseWrist = { x: 604, y: 434 - 8 * (1 - small) };
    moveArm(leftHammerArm, { x: 506, y: 348 }, chaseWrist, 74, 79, -1);
    tongs.setAttribute('d', 'M562 442L651 482L661 478M567 457L650 477L660 484');
    const smallAngle = mix(-1.12, 0.80, small);
    const hx = chaseWrist.x + Math.cos(smallAngle) * 65;
    const hy = chaseWrist.y + Math.sin(smallAngle) * 65;
    chasing.setAttribute('transform', 'translate(' + fmt(hx) + ' ' + fmt(hy) + ') rotate(' + fmt(smallAngle * 180 / Math.PI + 90) + ')');
    const angle = mix(-2, Math.atan2(129, -133) - Math.PI * 2, heavy);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const head = { x: 785 + ux * 185, y: 348 + uy * 185 };
    const front = { x: head.x - ux * 95, y: head.y - uy * 95 };
    const rear = { x: head.x - ux * 132, y: head.y - uy * 132 };
    moveArm(rightFrontArm, { x: 799, y: 333 }, front, 73, 79, 1);
    moveArm(rightRearArm, { x: 835, y: 339 }, rear, 71, 77, -1);
    sledgeShaft.setAttribute('d', 'M' + fmt(head.x) + ' ' + fmt(head.y) + 'L' + fmt(head.x - ux * 159) + ' ' + fmt(head.y - uy * 159));
    sledge.setAttribute('transform', 'translate(' + fmt(head.x) + ' ' + fmt(head.y) + ') rotate(' + fmt(angle * 180 / Math.PI + 90) + ')');
    let sparkPath = '', whitePath = '', flashOpacity = 0;
    for (const { age, index } of hits) {
      flashOpacity = Math.max(flashOpacity, Math.pow(1 - age / 0.28, 4));
      for (let j = 0; j < 22; j++) {
        const seed = index * 43 + j;
        const theta = Math.PI * (1.08 + noise(seed) * 0.84);
        const speed = 210 + noise(seed + 83) * 390;
        const vx = Math.cos(theta) * speed, vy = Math.sin(theta) * speed;
        const tail = Math.max(0, age - 0.012 - noise(seed + 51) * 0.018);
        const x = 652 + vx * age, y = 483 + vy * age + 530 * age * age;
        const tx = 652 + vx * tail, ty = 483 + vy * tail + 530 * tail * tail;
        const d = 'M' + fmt(tx) + ' ' + fmt(ty) + 'L' + fmt(x) + ' ' + fmt(y);
        sparkPath += d;
        if (j % 3 === 0) whitePath += d;
      }
    }
    flash.setAttribute('opacity', fmt(flashOpacity));
    sparks.setAttribute('d', sparkPath); hotSparks.setAttribute('d', whitePath);
    const sparkOpacity = hits.reduce((v, hit) => Math.max(v, 1 - hit.age / 0.28), 0);
    sparks.setAttribute('opacity', fmt(sparkOpacity)); hotSparks.setAttribute('opacity', fmt(sparkOpacity));
    return { visible: svg.style.display !== 'none', impacts: hits.length, t };
  }
  const controller = {
    svg, element: svg, renderAt, render: renderAt, update: renderAt,
    destroy() {
      svg.remove();
      if (ownsPosition && containerEl.style.position === 'relative') containerEl.style.position = previousPosition;
      layers.delete(containerEl);
    },
  };
  layers.set(containerEl, controller);
  renderAt(0);
  return controller;
}

function featherWheel(ctx, x, y, rotation) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ellipse(ctx, 0, 0, 20, 20, null, GOLD, 0.9);
  ellipse(ctx, 0, 0, 15.5, 15.5, null, OLD_GOLD, 0.75);
  for (let i = 0; i < 12; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 6);
    ctx.beginPath(); ctx.moveTo(0, -3);
    ctx.bezierCurveTo(-8, -11, -7, -23, 0, -31);
    ctx.bezierCurveTo(5, -22, 8, -12, 0, -3);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 0.7; ctx.stroke();
    line(ctx, [[0, -6], [0, -28]], OLD_GOLD, 0.65);
    for (let j = 0; j < 3; j++) line(ctx, [[0, -12 - j * 4], [4, -16 - j * 4]], GOLD, 0.5);
    ctx.restore();
  }
  ellipse(ctx, 0, 0, 4, 4, '#121015', GOLD, 1);
  line(ctx, [[-34, 0], [-26, 0]], GOLD, 0.7);
  line(ctx, [[0, -34], [0, -26]], GOLD, 0.7);
  ctx.restore();
}

function glyphTitle(ctx, text, x, y, size, color = GOLD) {
  // The glyph module supplies outlines; never substitute OS-dependent fonts.
  drawGlyphText(ctx, text, x, y, size, {
    align: 'center', fill: color, color,
    stroke: OLD_GOLD, lineWidth: 0.45, letterSpacing: size * 0.04,
  });
}

let sealPaths;
function drawSeal(ctx, x, y, size) {
  const seal = SEAL_LIUQIANNIAN;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.025);
  ctx.fillStyle = '#aa3027'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#e4ad75'; ctx.lineWidth = 0.8; ctx.strokeRect(3, 3, size - 6, size - 6);
  // Preserve the supplied hand-carved frame and all three small-seal outlines.
  if (!sealPaths) sealPaths = [seal.frame, seal['六'], seal['千'], seal['年']].map(d => new Path2D(d));
  const bounds = seal.viewBox.split(/[ ,]+/).map(Number);
  ctx.translate(5, 5); ctx.scale((size - 10) / bounds[2], (size - 10) / bounds[3]);
  ctx.translate(-bounds[0], -bounds[1]);
  ctx.fillStyle = '#f7d6a0';
  sealPaths.forEach(path => ctx.fill(path, 'evenodd'));
  ctx.restore();
}

/** Canvas stele and workshop ground; the live engravings are in the SVG layer. */
export function renderAct1Overlay(ctx, state = {}) {
  const t = timeOf(state);
  const layer = state?.act1SvgLayer || state?.svgLayer;
  if (layer?.renderAt) layer.renderAt(t);
  if (t < 0 || t >= SHUTTER_END) return;
  ctx.save();
  if (t >= SHUTTER_START) clipShutter(ctx, t, false);
  ctx.fillStyle = '#121015'; ctx.fillRect(STELE_W, 0, W - STELE_W, H);
  const lacquer = ctx.createLinearGradient(0, 0, STELE_W, H);
  lacquer.addColorStop(0, '#0c0b0e'); lacquer.addColorStop(1, '#18141a');
  ctx.fillStyle = lacquer; ctx.fillRect(0, 0, STELE_W, H);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.25; ctx.strokeRect(15.5, 15.5, 313, 689);
  ctx.strokeStyle = OLD_GOLD; ctx.lineWidth = 0.75; ctx.strokeRect(23.5, 23.5, 297, 673);
  for (let y = 88; y < 640; y += 17) {
    line(ctx, [[18, y], [21, y + 3], [18, y + 6], [21, y + 9]], OLD_GOLD, 0.55);
    line(ctx, [[326, y], [323, y + 3], [326, y + 6], [323, y + 9]], OLD_GOLD, 0.55);
  }
  for (let x = 87; x < 267; x += 17) {
    line(ctx, [[x, 19], [x + 3, 22], [x + 6, 19], [x + 9, 22]], OLD_GOLD, 0.55);
    line(ctx, [[x, 701], [x + 3, 698], [x + 6, 701], [x + 9, 698]], OLD_GOLD, 0.55);
  }
  featherWheel(ctx, 57, 58, 0); featherWheel(ctx, 287, 58, Math.PI / 2);
  featherWheel(ctx, 57, 662, -Math.PI / 2); featherWheel(ctx, 287, 662, Math.PI);
  line(ctx, [[101, 126], [243, 126]], GOLD, 0.8);
  poly(ctx, [[166, 126], [172, 121], [178, 126], [172, 131]], '#171219', GOLD, 0.9);
  glyphTitle(ctx, 'Hydrogen', 172, 182, 30);
  glyphTitle(ctx, '鹈鹕', 172, 296, 78);
  glyphTitle(ctx, '六千年的车', 172, 408, 39);
  line(ctx, [[92, 480], [252, 480]], OLD_GOLD, 0.8);
  drawSeal(ctx, 137, 520, 70);
  line(ctx, [[123, 617], [221, 617]], OLD_GOLD, 0.75);
  ctx.restore();
}

// The twelve visual quotations deliberately have independent drawing recipes.
// Metadata provides drawer identity; previews remain legible without bitmaps.
const MOTIFS = [
  ['撒哈拉岩画', '#35251d', '#b9663c'], ['纸草象形', '#ddc794', '#62482e'],
  ['汉画像石', '#25282a', '#ddd3bd'], ['唐代绢本', '#eee0c4', '#b64d3b'],
  ['宋代山水', '#e6e0ce', '#526b60'], ['莫卧儿金拱', '#203b35', '#d5ae60'],
  ['八大墨韵', '#eee9dd', '#272d29'], ['浮世绘浪', '#eadcbb', '#315982'],
  ['星月旋涡', '#152d56', '#ead064'], ['荧光显像', '#071c15', '#7efcb1'],
  ['像素纪元', '#16244c', '#e8ba51'], ['傅立叶网格', '#0e1823', '#8ad9d0'],
];

function drawCave(ctx, width) {
  const palette = ACCORDION_DRAWERS[0]?.palette || {};
  ctx.fillStyle = palette.bg || '#35251d'; ctx.fillRect(0, 0, width, H);
  for (let i = 0; i < 38; i++) {
    const x = noise(i + 310) * width, y = noise(i + 97) * H;
    const r = 16 + noise(i) * 85;
    ctx.globalAlpha = 0.10 + noise(i + 41) * 0.13;
    poly(ctx, [[x - r, y], [x - r * 0.6, y - 37], [x + r, y - 16], [x + r * 0.8, y + 32], [x - 4, y + 44]], i % 2 ? '#a8794e' : '#110e0b');
  }
  ctx.globalAlpha = 1;
  const scale = mix(0.30, 1, clamp((width - 80) / 880));
  for (let i = 0; i < 8; i++) {
    const x = width * (0.08 + (i % 4) * 0.25), y = 205 + Math.floor(i / 4) * 190 + noise(i) * 38;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const ink = i % 3 ? '#bb7247' : '#d6a26d';
    line(ctx, [[-34, -4], [-25, -18], [20, -16], [36, -6], [24, 12], [-26, 11], [-34, -4]], ink, 3.2);
    line(ctx, [[-22, 11], [-28, 38], [-16, 38]], ink, 3);
    line(ctx, [[19, 12], [28, 37], [34, 37]], ink, 3);
    line(ctx, [[34, -6], [47, -19], [57, -12], [49, 0], [35, 1]], ink, 3);
    line(ctx, [[47, -18], [42, -36], [54, -30], [57, -12]], ink, 2);
    line(ctx, [[-32, -7], [-48, -18], [-52, -6]], ink, 2);
    ctx.restore();
  }
  for (let i = 0; i < 7; i++) {
    const x = width * (0.11 + i * 0.13), y = 110 + (i % 3) * 160;
    ellipse(ctx, x, y, 3.5 * scale, 4.5 * scale, '#cf8c5b');
    line(ctx, [[x, y + 6], [x, y + 35], [x - 12 * scale, y + 52], [x, y + 35], [x + 12 * scale, y + 52]], '#c47a49', 2 * scale);
    line(ctx, [[x - 15 * scale, y + 15], [x, y + 23], [x + 18 * scale, y + 5]], '#c47a49', 2 * scale);
  }
  line(ctx, [[0, 680], [width * 0.27, 677], [width * 0.61, 682], [width, 680]], '#a46f46', 1.5);
}

function drawMiniature(ctx, index) {
  const [, bg, ink] = MOTIFS[index];
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 80, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (index === 0) { drawCave(ctx, 80); return; }
  if (index === 1) {
    for (let y = 0; y < H; y += 6) line(ctx, [[0, y], [80, y + 2]], '#bca474', 0.4);
    for (let y = 100; y < 640; y += 67) {
      line(ctx, [[13, y], [34, y], [23, y - 10], [13, y], [23, y + 9], [34, y]], ink, 1.5);
      ellipse(ctx, 55, y, 8, 8, null, ink, 1.4);
      line(ctx, [[55, y + 8], [55, y + 30], [43, y + 17], [67, y + 17]], ink, 1.5);
      line(ctx, [[14, y + 29], [23, y + 18], [34, y + 29]], '#9b4933', 2);
    }
  } else if (index === 2) {
    for (let y = 114; y < 660; y += 103) {
      line(ctx, [[5, y + 49], [75, y + 49]], ink, 1);
      ellipse(ctx, 27, y + 29, 17, 10, null, ink, 1.8);
      line(ctx, [[12, y + 34], [8, y + 47], [25, y + 36], [35, y + 48], [40, y + 27], [54, y + 10], [64, y + 17], [55, y + 31]], ink, 2);
      line(ctx, [[43, y + 3], [37, y + 22], [54, y + 25]], ink, 1.5);
      for (let k = 0; k < 4; k++) line(ctx, [[3, y - 4 + k * 4], [73, y - 4 + k * 4]], '#7a7970', 0.6);
    }
  } else if (index === 3) {
    for (let x = 2; x < 80; x += 4) line(ctx, [[x, 0], [x, H]], '#cbbf9d', 0.35);
    for (let i = 0; i < 5; i++) {
      const y = 130 + i * 109;
      ctx.beginPath(); ctx.moveTo(15, y + 67); ctx.bezierCurveTo(75, y + 31, -8, y + 16, 65, y - 19);
      ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.stroke();
      ellipse(ctx, 39, y, 9, 12, '#e1c6a1', '#6c5947', 1);
      ctx.beginPath(); ctx.moveTo(37, y + 12); ctx.bezierCurveTo(4, y + 39, 66, y + 37, 31, y + 77);
      ctx.strokeStyle = '#746351'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  } else if (index === 4) {
    for (let i = 0; i < 6; i++) {
      const y = 155 + i * 74;
      ctx.globalAlpha = 0.28 + i * 0.10;
      poly(ctx, [[-10, y + 155], [10, y - 16], [24, y + 21], [38, y - 81], [54, y - 26], [88, y + 127]], ink);
      line(ctx, [[18, y + 65], [38, y - 70], [44, y - 20], [58, y + 59]], '#e4e1ce', 1.3);
    }
    ctx.globalAlpha = 1;
    for (let y = 230; y < 680; y += 116) { ctx.fillStyle = '#e6e0ce'; ctx.fillRect(0, y, 80, 14); }
  } else if (index === 5) {
    for (let y = 118; y < 670; y += 164) {
      ctx.beginPath(); ctx.moveTo(9, y + 116); ctx.lineTo(9, y + 29);
      ctx.bezierCurveTo(9, y + 9, 30, y + 8, 40, y - 13);
      ctx.bezierCurveTo(50, y + 8, 71, y + 9, 71, y + 29); ctx.lineTo(71, y + 116);
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.stroke();
      for (let k = 0; k < 6; k++) {
        ellipse(ctx, 24 + (k % 2) * 31, y + 44 + Math.floor(k / 2) * 22, 4, 7, null, '#d18b86', 1);
      }
      line(ctx, [[5, y + 123], [75, y + 123]], ink, 1);
    }
  } else if (index === 6) {
    ctx.beginPath(); ctx.moveTo(3, 583); ctx.bezierCurveTo(66, 537, 17, 330, 70, 136);
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const x = 17 + noise(i + 77) * 50, y = 170 + noise(i + 42) * 390;
      ctx.globalAlpha = 0.20 + noise(i + 8) * 0.65;
      ellipse(ctx, x, y, 7 + noise(i) * 12, 3 + noise(i + 3) * 17, ink);
    }
    ctx.globalAlpha = 1;
    ellipse(ctx, 36, 445, 18, 26, ink); ellipse(ctx, 47, 420, 9, 11, ink);
    ellipse(ctx, 49, 416, 3.5, 1.7, bg); poly(ctx, [[54, 420], [67, 423], [54, 426]], ink);
    ctx.fillStyle = '#a54032'; ctx.fillRect(56, 614, 13, 18);
  } else if (index === 7) {
    poly(ctx, [[10, 399], [48, 291], [84, 401]], '#91a3a2');
    poly(ctx, [[35, 328], [48, 291], [61, 331], [48, 320]], '#f4e8cd');
    for (let i = 0; i < 12; i++) {
      const y = 360 + i * 24;
      ctx.beginPath(); ctx.moveTo(-10, y + 60);
      ctx.bezierCurveTo(82, y + 60, 98, y - 75, 35, y - 42);
      ctx.bezierCurveTo(89, y - 47, 55, y + 25, -10, y + 31);
      ctx.strokeStyle = i % 3 ? ink : '#f8edcf'; ctx.lineWidth = i % 3 ? 5 : 2; ctx.stroke();
    }
  } else if (index === 8) {
    for (let k = 0; k < 4; k++) {
      const cy = 170 + k * 134;
      for (let ring = 0; ring < 4; ring++) {
        ctx.beginPath();
        for (let j = 0; j < 100; j++) {
          const a = j * 0.12, r = 2 + j * (0.17 + ring * 0.035);
          const x = 40 + Math.cos(a + k) * r, y = cy + Math.sin(a + k) * r * 1.6;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = ring % 2 ? '#5d8ab8' : ink; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    for (let i = 0; i < 15; i++) ellipse(ctx, noise(i) * 80, 83 + noise(i + 9) * 535, 1.8, 3, '#efd980');
  } else if (index === 9) {
    for (let y = 78; y < 670; y += 4) line(ctx, [[4, y], [76, y]], '#153a29', 0.7);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let j = 0; j <= 160; j++) {
        const a = j / 160 * Math.PI * 2;
        const x = 40 + 30 * Math.sin(3 * a + k * 0.7), y = 203 + k * 164 + 55 * Math.sin(2 * a);
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#214c35'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    }
  } else if (index === 10) {
    for (let row = 0; row < 54; row++) for (let col = 0; col < 8; col++) {
      if (noise(row * 11 + col) < 0.58) continue;
      ctx.fillStyle = ['#72b8d5', '#c26786', '#e8ba51', '#78a67d'][(row + col) % 4];
      ctx.fillRect(col * 10, 80 + row * 10, 9, 9);
    }
    for (let y = 135; y < 640; y += 122) {
      ctx.fillStyle = ink; ctx.fillRect(31, y, 18, 26);
      ctx.fillStyle = '#fff0a2'; ctx.fillRect(35, y + 4, 4, 16);
    }
  } else if (index === 11) {
    for (let x = 0; x < 80; x += 10) line(ctx, [[x, 80], [x, 654]], '#284b50', 0.6);
    for (let y = 84; y < 660; y += 16) line(ctx, [[0, y], [80, y]], '#284b50', 0.6);
    for (let k = 0; k < 5; k++) {
      const cy = 145 + k * 103;
      ellipse(ctx, 40, cy, 28, 28, null, '#bba363', 0.7);
      ellipse(ctx, 52, cy, 13, 13, null, '#6aa7a0', 0.7);
      ctx.beginPath();
      for (let j = 0; j <= 96; j++) {
        const a = j / 96 * Math.PI * 2;
        const x = 40 + 23 * Math.cos(a) + 9 * Math.cos(5 * a), y = cy + 23 * Math.sin(a) - 9 * Math.sin(5 * a);
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
    }
  }
}

function panelCache(ctx) {
  const transform = ctx.getTransform?.();
  const density = clamp(Math.hypot(transform?.a || 1, transform?.b || 0), 1, 4);
  let cache = panelCaches.get(ctx);
  if (cache?.density === density) return cache.panels;
  const doc = ctx.canvas?.ownerDocument;
  const panels = MOTIFS.map((_, index) => {
    const canvas = doc ? doc.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;
    if (!canvas) return null;
    canvas.width = Math.ceil(80 * density); canvas.height = Math.ceil(H * density);
    const offscreen = canvas.getContext('2d');
    if (!offscreen) return null;
    offscreen.scale(density, density); drawMiniature(offscreen, index);
    return canvas;
  });
  panelCaches.set(ctx, { density, panels });
  return panels;
}

function drawGoldShutter(ctx, t) {
  if (t < SHUTTER_START || t >= SHUTTER_END) return;
  const cut = shutterAt(t);
  const gold = ctx.createLinearGradient(cut.bottom - 42, H, cut.top + 42, 0);
  gold.addColorStop(0, '#6c471d'); gold.addColorStop(0.24, '#c89a44');
  gold.addColorStop(0.48, '#ffedb6'); gold.addColorStop(0.53, '#fff9df');
  gold.addColorStop(0.60, '#dfb75d'); gold.addColorStop(1, '#93652a');
  poly(ctx, [[cut.top - 32, -1], [cut.top + 12, -1], [cut.bottom + 12, H + 1], [cut.bottom - 32, H + 1]], gold);
  line(ctx, [[cut.top - 7, 0], [cut.bottom - 7, H]], '#fff3cc', 1.2);
  line(ctx, [[cut.top - 27, 0], [cut.bottom - 27, H]], '#9a6b2c', 0.8);
  for (let i = 0; i < 18; i++) {
    const y = i * 43 + 4;
    const x = mix(cut.top, cut.bottom, y / H);
    line(ctx, [[x - 26, y + 7], [x + 3, y - 7]], '#c99b4b', 0.6);
  }
}

/**
 * Act II canvas pass. The two canvas passes can be called in either order:
 * complementary shutter clips retain Act I only on the unrevealed side.
 * Return value exposes the exact drawer width / handoff state to the director.
 */
export function renderAct2Accordion(ctx, state = {}) {
  const t = timeOf(state);
  const opening = smooth((t - OPEN_START) / (ACT2_END - OPEN_START));
  const drawer01Width = mix(80, W, opening);
  const result = { active: t >= SHUTTER_START && t <= ACT2_END, drawer01Width, opening, complete: t >= ACT2_END };
  if (!result.active) return result;
  const panels = panelCache(ctx);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (t < SHUTTER_END) clipShutter(ctx, t, true);
  ctx.fillStyle = '#0c0b0e'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    const meta = ACCORDION_DRAWERS[i];
    const x = i === 0 ? 0 : drawer01Width + (i - 1) * 80;
    const width = i === 0 ? drawer01Width : 80;
    if (x >= W) continue;
    const lift = (1 - opening) * Math.sin((t - SHUTTER_END) * 1.35 + i * 0.63) * 5;
    ctx.save(); ctx.beginPath(); ctx.rect(x, 0, width, H); ctx.clip();
    ctx.translate(x, lift);
    // Overscan prevents any breathing movement from exposing canvas seams.
    ctx.fillStyle = MOTIFS[i][1]; ctx.fillRect(0, -8, width, H + 16);
    if (i === 0 && opening > 0) drawCave(ctx, width);
    else if (panels[i]) ctx.drawImage(panels[i], 0, 0, 80, H);
    else drawMiniature(ctx, i);
    const trimOpacity = 1 - smooth((opening - 0.70) / 0.30);
    ctx.globalAlpha = trimOpacity;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.05; ctx.strokeRect(1, 19, width - 2, 681);
    ctx.strokeStyle = OLD_GOLD; ctx.lineWidth = 0.55; ctx.strokeRect(4, 23, width - 8, 673);
    ctx.fillStyle = 'rgba(13,12,15,0.76)'; ctx.fillRect(6, 30, Math.min(width - 12, 68), 42);
    ctx.font = '11px serif'; ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String((meta?.drawerIndex ?? i) + 1).padStart(2, '0'), Math.min(width / 2, 40), 51);
    ctx.restore();
    // Dividers stay vertical and cover the moving miniature's outside edges.
    ctx.save(); ctx.globalAlpha = 1 - opening; ctx.fillStyle = GOLD; ctx.fillRect(x, 0, 0.8, H); ctx.restore();
  }
  if (t < OPEN_START) {
    const travel = clamp((t - SHUTTER_END) / (OPEN_START - SHUTTER_END));
    const riderX = mix(-330, 1240, travel);
    ctx.save();
    const kinematics = computePelicanKinematics(t, 0, {
      x: riderX, roadY: 650, scale: 1.55, speed: 220, stopWindows: [],
    });
    drawPelicanBicycleCanvas2D(ctx, kinematics, { mode: 'silhouette', x: riderX });
    ctx.restore();
  }
  ctx.restore();
  ctx.save(); drawGoldShutter(ctx, t); ctx.restore();
  return result;
}
