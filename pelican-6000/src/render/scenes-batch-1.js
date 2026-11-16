// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG, SCENES_META } from '../data/scenes-meta.js';
import { drawGlyphText, SEAL_LIUQIANNIAN } from '../data/glyphs.js';
import { createSeededRng } from '../core/prng.js';
import { computePelicanKinematics, drawPelicanBicycleCanvas2D } from './ik-pelican.js';

// All geometry, including baked pigment layers, lives in a 1000 × 1000 frame.
// Animation is a pure function of time: seeking never accumulates particle state.
const TAU = Math.PI * 2;
const ROAD_Y = MV_TIMELINE_CONFIG.ROAD_EDGE_Y;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const smooth = (v) => { const u = clamp(v); return u * u * (3 - 2 * u); };
const mix = (a, b, u) => a + (b - a) * u;
const wrap = (v, period) => ((v % period) + period) % period;
const MODES = ['ochre_cave', 'egypt_profile', 'han_rubbing', 'tang_line', 'ink_minimal', 'tang_line', 'egypt_profile'];
const BACKGROUNDS = ['#35251d', '#dcc899', '#2a2c2b', '#eee0c4', '#e6e0ce', '#e9d7b3', '#e8d6b1'];

function paint(ctx, fill, stroke, width = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function poly(ctx, points, stroke, width = 1, fill = null, closed = false) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  if (closed || fill) ctx.closePath();
  paint(ctx, fill, stroke, width);
}

function oval(ctx, x, y, rx, ry, fill, stroke = null, width = 1, angle = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
  paint(ctx, fill, stroke, width);
}

function bezier(ctx, start, controls, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(...start); ctx.bezierCurveTo(...controls);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function withAlpha(ctx, alpha, draw) {
  ctx.save();
  try { ctx.globalAlpha *= alpha; draw(); } finally { ctx.restore(); }
}

function texture(ctx, index) {
  const rng = createSeededRng(`batch-1:substrate:${index}`);
  ctx.fillStyle = BACKGROUNDS[index]; ctx.fillRect(0, 0, 1000, 1000);
  withAlpha(ctx, index === 0 || index === 2 ? 0.13 : 0.07, () => {
    for (let i = 0; i < 1900; i++) {
      const x = rng.range(0, 1000), y = rng.range(0, 1000);
      ctx.fillStyle = rng.chance(0.45) ? '#fff0cc' : '#211c18';
      ctx.fillRect(x, y, rng.range(0.5, 3.5), rng.range(0.4, 2));
    }
    if (index === 1 || index === 3 || index === 6) {
      for (let x = 0; x < 1000; x += index === 3 ? 5 : 12) {
        poly(ctx, [[x, 0], [x + rng.range(-2, 2), 1000]], '#716047', 0.45);
      }
      for (let y = 0; y < 1000; y += 8) poly(ctx, [[0, y], [1000, y + 1]], '#fff6d8', 0.4);
    }
  });
}

function road(ctx, color, index) {
  // Shared ledge survives every era; river/creek bridges sit above this datum.
  withAlpha(ctx, index === 4 || index === 5 ? 0.25 : 0.65, () => {
    poly(ctx, [[0, ROAD_Y], [1000, ROAD_Y]], color, index === 2 ? 4 : 1.6);
    poly(ctx, [[0, ROAD_Y + 9], [1000, ROAD_Y + 9]], color, 0.6);
  });
}

function handprint(ctx, x, y, scale, color) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(-0.15);
    oval(ctx, 0, 0, 11, 15, color);
    for (let j = 0; j < 5; j++) {
      const a = -2.9 + j * 0.52;
      poly(ctx, [[Math.cos(a) * 8, Math.sin(a) * 8], [Math.cos(a) * 26, Math.sin(a) * 29]], color, 5);
    }
  } finally { ctx.restore(); }
}

function bakeSahara(ctx) {
  const rng = createSeededRng('tassili:rock');
  for (let i = 0; i < 32; i++) {
    const x = rng.range(-100, 1000), y = rng.range(30, 960);
    withAlpha(ctx, rng.range(0.035, 0.1), () => oval(ctx, x, y, rng.range(45, 220), rng.range(20, 105), '#d7a46e'));
  }
  for (let i = 0; i < 17; i++) {
    let x = rng.range(0, 1000), y = rng.range(0, 700);
    const points = [[x, y]];
    for (let j = 0; j < 6; j++) { x += rng.range(-38, 38); y += rng.range(13, 55); points.push([x, y]); }
    poly(ctx, points, '#241a15', 1.5);
    poly(ctx, points.map(([a, b]) => [a + 2, b]), '#6d4932', 0.5);
  }
  withAlpha(ctx, 0.42, () => {
    handprint(ctx, 100, 185, 1.1, '#b9663c'); handprint(ctx, 850, 250, 0.85, '#c78952');
    for (let j = 0; j < 3; j++) {
      poly(ctx, [[585 + j * 36, 150], [608 + j * 36, 172], [585 + j * 36, 193]], '#b9663c', 3);
    }
  });
  // Pecked zigzag below the ledge, like a fragment of the original rock face.
  poly(ctx, Array.from({ length: 35 }, (_, j) => [j * 30, 818 + j % 2 * 22]), '#8e5638', 2);
}

function cattle(ctx, x, y, scale, t, targetX, seed) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const pigment = seed % 2 ? '#b9663c' : '#d09b63';
    oval(ctx, 0, -48, 59, 23, null, pigment, 3.5);
    for (let k = 0; k < 4; k++) {
      const hoof = Math.sin(t * 1.3 + seed + k) * 5;
      poly(ctx, [[-38 + k * 23, -32], [-40 + k * 23 + hoof, 0]], pigment, 3);
    }
    poly(ctx, [[-57, -53], [-77, -33], [-81, -18]], pigment, 2);
    const turn = clamp((targetX - x) / 280, -1, 1);
    ctx.save();
    try {
      ctx.translate(51, -61); ctx.rotate(turn * 0.24 + Math.sin(t + seed) * 0.035);
      poly(ctx, [[-7, 13], [2, -17], [20, -8], [33, 6], [12, 12]], pigment, 3);
      bezier(ctx, [5, -15], [-20, -51, -18, -68, -6, -74], pigment, 3);
      bezier(ctx, [17, -12], [44, -46, 48, -68, 31, -76], pigment, 3);
      oval(ctx, 18 + turn * 2, -3, 2, 2, '#211914');
    } finally { ctx.restore(); }
    for (let j = 0; j < 6; j++) poly(ctx, [[-35 + j * 13, -61], [-38 + j * 13, -37]], pigment, 1.3);
  } finally { ctx.restore(); }
}

function herdsman(ctx, x, y, scale, targetX, t) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const ink = '#c38450', look = clamp((targetX - x) / 170, -1, 1);
    oval(ctx, look * 3, -78, 7, 9, ink);
    poly(ctx, [[0, -67], [3, -30], [-16, 0]], ink, 3);
    poly(ctx, [[3, -30], [22, -2]], ink, 3);
    poly(ctx, [[0, -59], [-18, -39], [22, -43 + Math.sin(t) * 2]], ink, 3);
    poly(ctx, [[24, -93], [24, 2]], ink, 2);
    poly(ctx, [[look * 3, -79], [look * 3 + look * 9, -77]], ink, 2);
  } finally { ctx.restore(); }
}

// Small vector signs avoid font dependencies in carved Egyptian registers.
function hieroglyph(ctx, x, y, kind, color, size = 28) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(size / 28, size / 28);
    if (kind % 5 === 0) {
      oval(ctx, 13, 7, 6, 8, null, color, 1.6);
      poly(ctx, [[13, 15], [13, 35]], color, 1.8); poly(ctx, [[3, 22], [23, 22]], color, 1.8);
    } else if (kind % 5 === 1) {
      bezier(ctx, [0, 15], [7, 1, 21, 1, 28, 15], color, 1.5);
      bezier(ctx, [0, 15], [8, 23, 22, 23, 28, 15], color, 1.5);
      oval(ctx, 14, 14, 3, 4, color); poly(ctx, [[24, 19], [19, 30], [9, 34]], color, 1.3);
    } else if (kind % 5 === 2) {
      poly(ctx, [[2, 29], [2, 17], [8, 17], [8, 10], [15, 10], [15, 3], [25, 3]], color, 2);
      poly(ctx, [[1, 32], [28, 32]], color, 1.3);
    } else if (kind % 5 === 3) {
      for (let j = 0; j < 3; j++) poly(ctx, [[0, j * 10 + 4], [6, j * 10], [13, j * 10 + 4], [20, j * 10], [28, j * 10 + 4]], color, 1.4);
    } else {
      oval(ctx, 14, 11, 11, 7, null, color, 1.6);
      poly(ctx, [[5, 15], [0, 25], [21, 20], [27, 29]], color, 1.6);
      poly(ctx, [[14, 5], [17, -1], [23, 4]], color, 1.6);
    }
  } finally { ctx.restore(); }
}

function lotus(ctx, x, y) {
  ctx.fillStyle = '#c69a50'; ctx.fillRect(x - 10, y, 20, 275);
  for (let k = -1; k <= 1; k++) {
    poly(ctx, [[x - 27, y], [x + k * 14, y - 44], [x + 27, y]], '#423020', 1.4, k ? '#268b9d' : '#c69a50');
  }
  for (let j = 0; j < 5; j++) poly(ctx, [[x - 10, y + 28 + j * 45], [x + 10, y + 28 + j * 45]], '#87613a', 1);
  ctx.fillStyle = '#268b9d'; ctx.fillRect(x - 16, y + 275, 32, 8);
}

function bakeEgypt(ctx) {
  for (const y of [96, 112, 255, 272, 410, 426, 824, 842]) {
    poly(ctx, [[0, y], [1000, y]], '#a45c37', y % 2 ? 1 : 2);
  }
  for (let j = 0; j < 23; j++) {
    hieroglyph(ctx, 12 + j * 44, 140, j, j % 3 ? '#775737' : '#268b9d', 28);
    hieroglyph(ctx, 12 + j * 44, 859, j + 2, '#8c613b', 26);
  }
  lotus(ctx, 70, 394); lotus(ctx, 935, 394);
  for (const x of [160, 788]) {
    ctx.strokeStyle = '#8d6336'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, 294, 68, 104, 29); ctx.stroke();
    hieroglyph(ctx, x + 20, 305, 0, '#423020', 24);
    hieroglyph(ctx, x + 20, 350, 1, '#268b9d', 24);
    poly(ctx, [[x + 5, 405], [x + 63, 405]], '#8d6336', 4);
  }
  // Alternating lotus/papyrus border in the lowest surviving register.
  for (let x = 15; x < 1000; x += 38) {
    poly(ctx, [[x, 952], [x + 14, 930], [x + 28, 952]], '#268b9d', 1.4);
    poly(ctx, [[x + 14, 950], [x + 14, 973]], '#8a6a45', 1.4);
  }
}

function egyptian(ctx, x, ground, scale, facing, salute) {
  ctx.save();
  try {
    ctx.translate(x, ground); ctx.scale(scale * facing, scale);
    const ink = '#423020';
    poly(ctx, [[-3, -76], [-18, -32], [22, -32], [9, -76]], ink, 1.5, '#f0dfb4');
    poly(ctx, [[-15, -32], [-24, -3], [-8, -3]], ink, 3);
    poly(ctx, [[15, -32], [30, 0], [44, 0]], ink, 3);
    poly(ctx, [[-3, -76], [-10, -125], [12, -125], [20, -79]], ink, 1.5, '#a85d38');
    poly(ctx, [[3, -114], [35, -92], [45, -121 - salute * 15]], ink, 4);
    poly(ctx, [[-5, -115], [-24, -86], [-40, -112]], ink, 4);
    oval(ctx, 5, -143, 14, 18, '#a85d38', ink, 1.3);
    poly(ctx, [[14, -149], [26, -141], [17, -137]], ink, 1.5, '#a85d38');
    poly(ctx, [[-10, -133], [-11, -161], [7, -167], [17, -151]], ink, 2, '#283d3b');
    oval(ctx, 13, -146, 2.3, 1.2, ink);
    poly(ctx, [[-10, -122], [15, -117], [20, -123]], '#268b9d', 5);
  } finally { ctx.restore(); }
}

function cloud(ctx, x, y, scale, color, width = 1.4) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    bezier(ctx, [-65, 15], [-92, -2, -48, -26, -25, -7], color, width);
    bezier(ctx, [-25, -7], [-37, -43, 31, -47, 28, -11], color, width);
    bezier(ctx, [28, -11], [70, -38, 99, 12, 55, 16], color, width);
    bezier(ctx, [55, 16], [17, 32, -12, 11, -65, 15], color, width);
    bezier(ctx, [-38, 8], [-18, -10, 32, -5, 19, 9], color, width * 0.65);
    bezier(ctx, [19, 9], [14, 20, 4, 20, -8, 12], color, width * 0.65);
  } finally { ctx.restore(); }
}

function bakeHan(ctx) {
  const ink = '#dad1b9';
  withAlpha(ctx, 0.45, () => {
    for (const y of [70, 85, 245, 263, 782, 803, 920]) poly(ctx, [[20, y], [980, y]], ink, 1.5);
    for (let x = 25; x < 980; x += 34) {
      poly(ctx, [[x, 88], [x + 28, 88], [x + 28, 118], [x + 9, 118], [x + 9, 101], [x + 19, 101]], ink, 1);
      poly(ctx, [[x, 878], [x + 14, 852], [x + 28, 878], [x + 14, 906], [x, 878]], ink, 1.2);
    }
    for (let j = 0; j < 6; j++) cloud(ctx, 80 + j * 170, 191, 0.57, ink, 2);
  });
  // A vertical stone title panel is kept clear of the passing convoy.
  ctx.fillStyle = '#242625'; ctx.fillRect(831, 303, 103, 311);
  ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.strokeRect(839, 311, 87, 294);
  for (const [j, glyph] of [...'鹈鹕骑者'].entries()) {
    drawGlyphText(ctx, glyph, 882, 352 + j * 54, 38, { family: 'serif', align: 'center', color: ink });
  }
  drawChop(ctx, 864, 554, 36);
  const rng = createSeededRng('han:chips');
  withAlpha(ctx, 0.2, () => {
    for (let j = 0; j < 105; j++) {
      const x = rng.range(20, 980), y = rng.range(280, 780);
      poly(ctx, [[x, y], [x + rng.range(1, 7), y - 2]], '#f3e6c9', 0.6);
    }
  });
}

let chopPaths;
function drawChop(ctx, x, y, size) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.rotate(-0.035);
    ctx.fillStyle = SEAL_LIUQIANNIAN.color || '#b6382c'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#edc7a0'; ctx.lineWidth = 0.8; ctx.strokeRect(2, 2, size - 4, size - 4);
    if (typeof Path2D !== 'undefined') {
      if (!chopPaths) chopPaths = [SEAL_LIUQIANNIAN.frame, SEAL_LIUQIANNIAN['六'], SEAL_LIUQIANNIAN['千'], SEAL_LIUQIANNIAN['年']].map(d => new Path2D(d));
      const [vx, vy, vw, vh] = SEAL_LIUQIANNIAN.viewBox.split(/[ ,]+/).map(Number);
      ctx.translate(4, 4); ctx.scale((size - 8) / vw, (size - 8) / vh); ctx.translate(-vx, -vy);
      ctx.fillStyle = '#f5d4ab'; for (const path of chopPaths) ctx.fill(path);
    } else {
      drawGlyphText(ctx, '六千年', size / 2, size * 0.38, size * 0.24, { family: 'serif', align: 'center', color: '#f5d4ab' });
    }
  } finally { ctx.restore(); }
}

function horseChariot(ctx, x, y, scale, t) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const ink = '#dad1b9', gait = t * 4;
    oval(ctx, 62, -65, 44, 17, null, ink, 2.5);
    poly(ctx, [[88, -65], [101, -103], [122, -100], [137, -84], [116, -78], [105, -57]], ink, 2.6);
    poly(ctx, [[108, -102], [104, -117], [116, -106], [123, -116], [126, -99]], ink, 1.4);
    for (let j = 0; j < 4; j++) {
      const x0 = 32 + j * 20, offset = Math.sin(gait + j * Math.PI * 0.7) * 15;
      poly(ctx, [[x0, -54], [x0 + offset, -27], [x0 - offset * 0.7 + 5, -3]], ink, 2.5);
    }
    bezier(ctx, [22, -68], [-5, -79, 0, -43, -19, -39], ink, 2);
    poly(ctx, [[-78, -45], [84, -49], [117, -87], [-41, -75]], ink, 1.3);
    poly(ctx, [[-126, -71], [-48, -71], [-39, -32], [-115, -32]], ink, 2, '#2a2c2b');
    for (const wx of [-103, -48]) {
      oval(ctx, wx, -21, 22, 22, '#2a2c2b', ink, 2);
      for (let j = 0; j < 8; j++) {
        const a = gait * 0.3 + j * TAU / 8;
        poly(ctx, [[wx, -21], [wx + Math.cos(a) * 21, -21 + Math.sin(a) * 21]], ink, 1);
      }
    }
    poly(ctx, [[-87, -71], [-90, -113], [-66, -113], [-64, -72]], ink, 2);
    oval(ctx, -78, -128, 10, 11, null, ink, 2);
    poly(ctx, [[-91, -138], [-65, -138], [-70, -146], [-85, -146]], ink, 2);
    poly(ctx, [[-66, -106], [-39, -89], [107, -95]], ink, 1.3);
    poly(ctx, [[-128, -72], [-132, -192], [-90, -177], [-130, -161]], ink, 2);
  } finally { ctx.restore(); }
}

function willow(ctx, t = 0, moving = false) {
  const ink = '#665144';
  if (!moving) {
    bezier(ctx, [68, 679], [147, 463, 53, 286, 152, 123], ink, 11);
    bezier(ctx, [71, 679], [161, 424, 78, 265, 158, 124], '#aa9169', 3);
    for (let j = 0; j < 6; j++) {
      bezier(ctx, [107, 260], [164 + j * 15, 127 - j * 8, 280 + j * 45, 95 + j * 9, 343 + j * 48, 179 + j * 11], ink, 2.7 - j * 0.25);
    }
  }
  for (let j = 0; j < 26; j++) {
    const x = 146 + j * 17, y = 152 + Math.sin(j * 0.4) * 25;
    const length = 95 + Math.sin(j * 1.7) * 45 + j * 3;
    const sway = Math.sin(t * 1.35 + j * 0.31) * (moving ? 13 : 4);
    bezier(ctx, [x, y], [x + 23 + sway, y + length * 0.4, x - 10 + sway, y + length * 0.75, x + sway, y + length], ink, 0.75);
    for (let k = 1; k < 8; k++) {
      const ly = y + length * k / 8, lx = x + sway * k / 8 + Math.sin(k) * 3;
      poly(ctx, [[lx, ly], [lx + (k % 2 ? 9 : -9), ly + 14]], '#7d8060', 0.9);
    }
  }
}

function bakeTang(ctx) {
  willow(ctx);
  for (const [x, y, s] of [[726, 164, 1.1], [854, 352, 0.8], [353, 456, 0.55], [170, 797, 1.2], [760, 873, 1.5]]) cloud(ctx, x, y, s, '#9c8b6f', 1.2);
  withAlpha(ctx, 0.24, () => {
    for (let j = 0; j < 12; j++) bezier(ctx, [0, 919 + j * 5], [285, 870 + j * 6, 650, 994 - j * 2, 1000, 910 + j * 5], '#b79859', 0.8);
  });
}

function ribbons(ctx, kin, t) {
  if (!kin.ribbon.length) return;
  ctx.save();
  try {
    ctx.translate(kin.x, kin.y); ctx.rotate(kin.rotation); ctx.scale(kin.scale, kin.scale);
    for (let strand = 0; strand < 5; strand++) {
      const points = kin.ribbon.map((v, j) => [v.x, v.y + strand * 3 + Math.sin(t * 3 - j * 0.5 + strand) * strand]);
      const last = points[points.length - 1];
      for (let j = 1; j <= 30; j++) {
        points.push([last[0] - j * 15, last[1] + Math.sin(t * 3.3 - j * 0.24 + strand * 0.2) * (14 + j * 0.8) + strand * 2]);
      }
      poly(ctx, points, ['#bb4435', '#c85b48', '#9f352d', '#d48c66', '#bb4435'][strand], strand === 0 ? 6 : 1.7);
    }
  } finally { ctx.restore(); }
}

function mountain(ctx, points, shade, seed) {
  poly(ctx, points, '#46564b', 1.6, shade);
  ctx.save();
  try {
    ctx.clip();
    const rng = createSeededRng(seed);
    for (let j = 0; j < 370; j++) {
      const x = rng.range(80, 950), y = rng.range(70, 700), length = rng.range(5, 65);
      withAlpha(ctx, rng.range(0.06, 0.25), () => {
        poly(ctx, [[x, y], [x - 5, y + length * 0.3], [x + 3, y + length]], '#243d32', rng.range(0.5, 2));
      });
    }
  } finally { ctx.restore(); }
}

function pine(ctx, x, y, scale) {
  poly(ctx, [[x, y], [x + 3 * scale, y - 41 * scale], [x + 9 * scale, y - 57 * scale]], '#394b3c', 2 * scale);
  for (let j = 0; j < 4; j++) {
    const py = y - (20 + j * 10) * scale;
    oval(ctx, x + (j % 2 ? 9 : -5) * scale, py, (19 - j * 2) * scale, 4 * scale, '#52604d');
  }
}

function creekBridgeY(x) {
  return 646 - 9 * Math.sin(Math.PI * clamp((x - 578) / 114));
}

function bakeSong(ctx) {
  withAlpha(ctx, 0.36, () => {
    mountain(ctx, [[25, 620], [80, 310], [160, 257], [231, 101], [287, 230], [352, 201], [437, 604]], '#b1b6a0', 'song:far');
    mountain(ctx, [[563, 629], [634, 277], [706, 181], [760, 249], [801, 126], [881, 210], [1000, 610]], '#b4b7a0', 'song:east');
  });
  mountain(ctx, [[185, 693], [239, 456], [287, 398], [316, 137], [362, 91], [398, 98], [419, 53], [466, 83], [499, 64], [532, 164], [552, 359], [589, 433], [630, 663]], '#83907b', 'fan-kuan:axial-cliff');
  for (let j = 0; j < 19; j++) {
    const x = 320 + j * 11;
    bezier(ctx, [x, 135 + Math.sin(j) * 36], [x - 12, 277, x + 20, 386, x - 24, 495 + j * 3], '#53654f', 0.8);
  }
  // A pale cleft opens into a long falling cascade, then the creek below.
  poly(ctx, [[540, 278], [550, 277], [563, 445], [580, 508], [573, 548], [560, 447]], null, 1, '#e7e6d6');
  for (let j = 0; j < 6; j++) bezier(ctx, [543 + j, 296], [548 + j, 381, 563 + j, 452, 572 + j, 523], '#d4d9cc', 0.8);
  withAlpha(ctx, 0.7, () => {
    for (let j = 0; j < 8; j++) oval(ctx, 380 + j * 70, 512 + Math.sin(j) * 48, 138, 20, '#e6e0ce');
  });
  poly(ctx, [[565, 533], [604, 603], [622, 656], [786, 1000], [903, 1000], [676, 668], [624, 594], [585, 532]], null, 1, '#c2cbb8');
  mountain(ctx, [[0, 1000], [0, 744], [102, 648], [180, 681], [259, 586], [354, 629], [438, 745], [531, 1000]], '#69795f', 'song:foreground');
  for (let j = 0; j < 18; j++) pine(ctx, 63 + j * 23, 744 + Math.sin(j * 0.7) * 52, 0.55 + j % 3 * 0.24);
  for (const [x, y] of [[578, 652], [692, 652]]) oval(ctx, x, y, 18, 7, '#737e68');
  const deck = Array.from({ length: 31 }, (_, j) => { const x = 578 + j * 114 / 30; return [x, creekBridgeY(x)]; });
  poly(ctx, deck, '#5e6655', 4);
  poly(ctx, deck.map(([x, y]) => [x, y + 5]), '#838773', 2);
  for (let j = 0; j < 9; j++) {
    const x = 580 + j * 13.5, y = creekBridgeY(x);
    poly(ctx, [[x, y - 10], [x, y]], '#737967', 1);
  }
  poly(ctx, deck.map(([x, y]) => [x, y - 10]), '#737967', 0.9);
  drawChop(ctx, 865, 108, 31);
}

function rainbowY(x) {
  return ROAD_Y - 106 * Math.sin(Math.PI * clamp((x - 80) / 840)) ** 2;
}

function seatWheelsOnBridge(kin, heightAt) {
  const radius = kin.wheelRadius * kin.scale;
  const halfAxle = kin.wheels.front.x * kin.scale;
  // Offset each circular tyre along the deck's normal, then solve axle tilt.
  const wheelHeight = (x) => {
    let contactX = x;
    for (let j = 0; j < 4; j++) {
      const slope = (heightAt(contactX + 0.1) - heightAt(contactX - 0.1)) / 0.2;
      contactX = x - radius * slope / Math.hypot(1, slope);
    }
    return heightAt(contactX) - Math.sqrt(Math.max(0, radius ** 2 - (contactX - x) ** 2));
  };
  let left = kin.y, right = kin.y;
  for (let j = 0; j < 5; j++) {
    const dx = halfAxle * Math.cos(kin.rotation);
    left = wheelHeight(kin.x - dx); right = wheelHeight(kin.x + dx);
    kin.rotation = Math.atan2(right - left, dx * 2);
  }
  kin.y = (left + right) / 2;
}

function shop(ctx, x, y, width, shade) {
  ctx.fillStyle = '#d7bb8d'; ctx.fillRect(x, y, width, 61);
  poly(ctx, [[x - 12, y], [x + width * 0.48, y - 42], [x + width + 14, y]], '#67533c', 2, shade);
  for (let j = 0; j < 5; j++) poly(ctx, [[x - 7 + j * width / 5, y - 2], [x + width * 0.48, y - 39]], '#6e654e', 0.7);
  for (let j = 0; j < 4; j++) {
    ctx.strokeStyle = '#796044'; ctx.lineWidth = 1; ctx.strokeRect(x + 7 + j * (width - 10) / 4, y + 15, width / 6, 34);
  }
}

function bakeRainbow(ctx) {
  poly(ctx, [[0, 619], [160, 638], [270, 710], [835, 716], [1000, 650], [1000, 1000], [0, 1000]], null, 1, '#b7c3ab');
  withAlpha(ctx, 0.45, () => {
    for (let j = 0; j < 45; j++) {
      const y = 720 + j * 6;
      bezier(ctx, [0, y], [300, y - 13, 700, y + 14, 1000, y - 1], '#718e81', 0.6);
    }
  });
  for (let j = 0; j < 8; j++) shop(ctx, -25 + j * 143, 343 + Math.sin(j) * 25, 112, j % 2 ? '#879582' : '#a79b7a');
  for (let j = 0; j < 7; j++) {
    const x = 18 + j * 155;
    ctx.fillStyle = '#73543b'; ctx.fillRect(x, 472, 3, 60); ctx.fillRect(x + 57, 472, 3, 60);
    poly(ctx, [[x - 9, 478], [x + 27, 450], [x + 68, 478]], '#71583d', 1, j % 2 ? '#9e7c53' : '#a4a480');
    for (let k = 0; k < 4; k++) oval(ctx, x + 7 + k * 13, 519, 6, 4, '#a37748');
  }
  const deck = Array.from({ length: 101 }, (_, j) => { const x = 80 + j * 8.4; return [x, rainbowY(x)]; });
  // Woven timber ribs and diagonal ties form the unsupported Rainbow Bridge.
  poly(ctx, [...deck, ...[...deck].reverse().map(([x, y]) => [x, y + 36])], '#755538', 2, '#b8915e');
  for (let j = 0; j < 31; j++) {
    const x = 80 + j * 28, y = rainbowY(x);
    poly(ctx, [[x - 15, y + 35], [x + 28, rainbowY(x + 28) + 6]], '#715239', 3);
    poly(ctx, [[x, y + 4], [x + 25, rainbowY(x + 25) + 32]], '#7c5938', 1.5);
    poly(ctx, [[x, y], [x, y - 26]], '#76583e', 2);
  }
  poly(ctx, deck.map(([x, y]) => [x, y - 25]), '#826343', 2);
  poly(ctx, deck.map(([x, y]) => [x, y + 5]), '#dfbc83', 2);
  for (const x of [71, 922]) {
    ctx.fillStyle = '#8f8061'; ctx.fillRect(x - 21, 680, 42, 81);
    poly(ctx, [[x - 25, 682], [x + 25, 682]], '#5d5b44', 4);
  }
}

function songPerson(ctx, x, y, scale, target, t, role = 0) {
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const ink = '#493c2d', robe = ['#7c8a77', '#baad8e', '#91765d', '#a86f4c'][role % 4];
    poly(ctx, [[-5, -39], [-10, -8], [10, -8], [5, -39]], ink, 1.1, robe);
    poly(ctx, [[-5, -8], [-7, 0], [-2, 0]], ink, 1.4);
    poly(ctx, [[5, -8], [7, 0], [11, 0]], ink, 1.4);
    const angle = clamp(Math.atan2(target.y - (y - 48 * scale), target.x - x) * 0.15, -0.34, 0.34);
    const facing = clamp((target.x - x) / 80, -1, 1);
    ctx.save();
    try {
      ctx.translate(0, -47); ctx.rotate(angle);
      oval(ctx, facing * 1.5, 0, 6, 8, '#d0b38d', ink, 0.9);
      poly(ctx, [[facing * 5, -1], [facing * 10, 1], [facing * 5, 3]], ink, 0.8);
      oval(ctx, facing * 4, -2, 0.8, 0.8, ink);
      if (role % 3) poly(ctx, [[-8, -6], [-6, -12], [5, -12], [8, -6]], ink, 1, '#536057');
      else { oval(ctx, 0, -10, 3, 3, ink); poly(ctx, [[-11, -6], [11, -6]], ink, 1.5); }
    } finally { ctx.restore(); }
    const lift = Math.sin(t * 1.8 + role) * 2;
    poly(ctx, [[-6, -34], [-13, -22], [-4, -19]], ink, 1.2);
    poly(ctx, [[6, -34], [13 + facing * 3, -23 - lift], [18 + facing * 4, -33 - lift]], ink, 1.2);
    if (role === 3) poly(ctx, [[17, -44], [25, 10]], ink, 1.4);
  } finally { ctx.restore(); }
}

function barge(ctx, x, y, t, target) {
  ctx.save();
  try {
    ctx.translate(x, y + Math.sin(t * 1.1) * 1.8);
    poly(ctx, [[-154, -14], [-125, 16], [117, 16], [158, -17]], '#554631', 2, '#92714c');
    poly(ctx, [[-139, -12], [148, -15]], '#e0c499', 3);
    for (let j = 0; j < 9; j++) poly(ctx, [[-112 + j * 27, -10], [-108 + j * 27, 13]], '#5f4c33', 1);
    poly(ctx, [[-83, -14], [-73, -59], [58, -59], [82, -15]], '#756144', 1.5, '#bdab82');
    for (let j = 0; j < 9; j++) bezier(ctx, [-76 + j * 16, -16], [-79 + j * 16, -35, -67 + j * 14, -52, -67 + j * 14, -57], '#806d4d', 0.8);
    poly(ctx, [[97, -15], [97, -160], [22, -82], [96, -64]], '#6c593c', 1.5);
    // Deckhands look in world coordinates even though the hull is translated.
    for (const [dx, role] of [[-112, 3], [112, 2]]) songPerson(ctx, dx, -15, 0.8, { x: target.x - x, y: target.y - y }, t, role);
  } finally { ctx.restore(); }
}

function mayaPyramid(ctx, x, y, scale, color) {
  const points = [[-47, 32], [-47, 20], [-35, 20], [-35, 7], [-23, 7], [-23, -6], [-12, -6], [-12, -25], [12, -25], [12, -6], [23, -6], [23, 7], [35, 7], [35, 20], [47, 20], [47, 32]];
  poly(ctx, points.map(([a, b]) => [x + a * scale, y + b * scale]), '#372d24', 1.5, color);
  for (let j = 0; j < 5; j++) poly(ctx, [[x - 7 * scale, y + (j * 9 - 8) * scale], [x + 7 * scale, y + (j * 9 - 8) * scale]], '#e8d6b1', 1);
}

function bakeMaya(ctx) {
  const red = '#a34532';
  for (const x of [18, 328, 662, 982]) {
    withAlpha(ctx, 0.12, () => { ctx.fillStyle = '#6e5139'; ctx.fillRect(x - 5, 0, 10, 1000); });
    poly(ctx, [[x, 0], [x, 1000]], '#b29b79', 1);
  }
  for (const y of [69, 81, 252, 267, 423, 438, 680, 832, 847, 972]) poly(ctx, [[20, y], [980, y]], red, y === 680 ? 2 : 1.5);
  for (let j = 0; j < 9; j++) {
    const x = 64 + j * 108;
    mayaPyramid(ctx, x, 174, 0.61, j % 2 ? '#348781' : red);
    // Angular day-sign enclosure, a jaw, ear-spool and three obsidian dots.
    poly(ctx, [[x - 33, 293], [x + 30, 293], [x + 34, 371], [x - 33, 371]], '#372d24', 1.7, null, true);
    poly(ctx, [[x - 18, 310], [x + 7, 307], [x + 12, 324], [x + 25, 327], [x + 15, 334], [x + 20, 350], [x - 12, 354], [x - 18, 310]], red, 2.2);
    oval(ctx, x - 18, 330, 6, 9, null, '#348781', 2);
    for (let k = 0; k < 3; k++) oval(ctx, x - 7 + k * 8, 362, 2, 2, '#372d24');
  }
  for (let j = 0; j < 8; j++) mayaPyramid(ctx, 72 + j * 122, 917, 0.7, j % 2 ? red : '#348781');
  ctx.strokeStyle = red; ctx.lineWidth = 1.5; ctx.strokeRect(706, 456, 211, 202);
}

function mayaDigit(ctx, value, x, y, color, scale = 1) {
  // One base-20 place: dots sit ABOVE bars. A shell denotes zero.
  ctx.save();
  try {
    ctx.translate(x, y); ctx.scale(scale, scale);
    if (value === 0) {
      oval(ctx, 0, 0, 21, 11, '#d6c39e', color, 2);
      bezier(ctx, [-19, 1], [-8, -6, 10, -6, 19, 1], color, 1.3);
      for (let j = -2; j <= 2; j++) poly(ctx, [[j * 6, -6], [j * 7, 6]], color, 1);
      return;
    }
    const bars = Math.floor(value / 5), dots = value % 5;
    for (let j = 0; j < bars; j++) {
      ctx.fillStyle = color; ctx.fillRect(-23, 8 - j * 9, 46, 5);
    }
    for (let j = 0; j < dots; j++) oval(ctx, (j - (dots - 1) / 2) * 11, bars ? 7 - bars * 9 : 0, 3.5, 3.5, color);
  } finally { ctx.restore(); }
}

function mayaScribe(ctx, kin, t) {
  const revolutions = Math.max(0, kin.crankAngle / TAU);
  const count = Math.floor(revolutions), digits = [count % 20];
  let quotient = Math.floor(count / 20);
  do { digits.push(quotient % 20); quotient = Math.floor(quotient / 20); } while (quotient > 0);
  const scale = Math.min(1, 2.5 / digits.length), spacing = 62 * scale;
  for (let j = digits.length - 1; j >= 0; j--) mayaDigit(ctx, digits[j], 816, 620 - j * spacing, '#372d24', scale);
  const phase = wrap(revolutions, 1), bars = Math.floor(digits[0] / 5), dots = digits[0] % 5;
  let tipX, tipY;
  if (digits[0] === 0) {
    tipX = 816 + 21 * scale * Math.cos(phase * TAU);
    tipY = 620 + 11 * scale * Math.sin(phase * TAU);
  } else if (dots) {
    tipX = 816 + ((dots - 1) * 5.5 + Math.cos(phase * TAU) * 2) * scale;
    tipY = 620 + ((bars ? 7 - bars * 9 : 0) + Math.sin(phase * TAU) * 2) * scale;
  } else {
    tipX = 816 + mix(-23, 23, phase) * scale;
    tipY = 620 + (10 - (bars - 1) * 9) * scale;
  }
  ctx.save();
  try {
    ctx.translate(944, 657); ctx.scale(-0.9, 0.9);
    const ink = '#372d24';
    poly(ctx, [[-2, -61], [-18, -23], [26, -12], [41, -1], [-18, -1]], ink, 1.5, '#a34532');
    poly(ctx, [[-6, -106], [-1, -61], [16, -49], [24, -94]], ink, 1.6, '#b17a4e');
    oval(ctx, 10, -121, 13, 17, '#b17a4e', ink, 1.5);
    poly(ctx, [[22, -127], [34, -116], [23, -112]], ink, 1.4, '#b17a4e');
    oval(ctx, 21, -123, 1.9, 1.3, ink); oval(ctx, -3, -114, 5, 7, '#348781', ink, 1);
    for (let j = 0; j < 5; j++) {
      const x = -11 + j * 8;
      poly(ctx, [[x, -137], [x - 19, -179 - Math.sin(j) * 12], [x + 4, -140]], ink, 1, j % 2 ? '#348781' : '#a34532');
    }
    const reach = Math.sin(t * 3) * 2;
    const localTipX = (944 - tipX) / 0.9, localTipY = (tipY - 657) / 0.9;
    const hand = [localTipX - 21, localTipY + 22];
    poly(ctx, [[18, -93], [57, -67 + reach], hand], ink, 7);
    poly(ctx, [[18, -93], [57, -67 + reach], hand], '#b17a4e', 4.5);
    poly(ctx, [[hand[0] - 5, hand[1] + 5], [localTipX, localTipY]], ink, 1.8);
    oval(ctx, -32, -5, 16, 6, '#a34532', ink, 1.3);
  } finally { ctx.restore(); }
  // The connected brush tip touches the live digit rather than a second tally.
  withAlpha(ctx, 0.55, () => oval(ctx, tipX, tipY, 1.5, 1.2, '#a34532'));
}

function egyptianPelicanSalute(ctx, kin) {
  if (kin.egyptSalute <= 0) return;
  withAlpha(ctx, kin.egyptSalute, () => {
    ctx.translate(kin.x, kin.y); ctx.rotate(kin.rotation); ctx.scale(kin.scale, kin.scale);
    const elbowY = mix(-142, -154, kin.egyptSalute);
    const tipY = mix(-147, -212, kin.egyptSalute);
    const wing = [[-24, kin.body.y], [30, elbowY], [30, tipY]];
    poly(ctx, wing, '#423020', 8); poly(ctx, wing, '#268b9d', 5);
    poly(ctx, [[26, tipY], [46, tipY], [46, tipY - 6]], '#423020', 2.5);
  });
}

const STATIC_PAINTERS = [bakeSahara, bakeEgypt, bakeHan, bakeTang, bakeSong, bakeRainbow, bakeMaya];

// Reused seeded emitters give continuous motion without frame-dependent RNG.
const PARTICLES = MODES.map((_, index) => {
  const rng = createSeededRng(`batch-1:cross-physics:${index}`);
  return Array.from({ length: index === 4 ? 24 : 48 }, () => ({
    x: rng.range(0, 1000), y: rng.range(0, 1000), phase: rng.range(0, TAU),
    speed: rng.range(0.3, 1.2), size: rng.range(0.7, 2.8), life: rng.range(0, 1),
  }));
});

function microPhysics(ctx, index, clock, kin, beat, iron) {
  for (const p of PARTICLES[index]) {
    const age = wrap(clock * p.speed * 0.22 + p.life, 1);
    const alpha = Math.sin(Math.PI * age) * (0.2 + beat * 0.08 + iron * 0.06);
    withAlpha(ctx, alpha, () => {
      if (index === 0 || index === 2) {
        const x = wrap(kin.x - 85 + p.x * 0.35 + age * 70, 1000);
        const y = ROAD_Y - Math.sin(age * Math.PI) * (12 + p.size * 18) + age * age * 12;
        if (index === 0) oval(ctx, x, y, p.size * 1.3, p.size * 0.65, '#d6a56c');
        else poly(ctx, [[x, y], [x + p.size * 2, y - p.size], [x + p.size, y + p.size]], null, 1, '#ada58e');
      } else if (index === 1) {
        const x = wrap(p.x + clock * p.speed * 5, 1000), y = wrap(p.y + clock * 7, 1000);
        poly(ctx, [[x, y], [x + p.size * 3, y - p.size]], '#846139', 0.8);
      } else if (index === 3) {
        const x = wrap(p.x + clock * p.speed * 19, 1100) - 50;
        const y = 470 + Math.sin(p.phase + clock) * 92 + p.y * 0.19;
        bezier(ctx, [x, y], [x - 7, y - 6, x - 15, y + 7, x - 25, y], '#bb4435', 0.8);
      } else if (index === 4) {
        const x = 450 + wrap(p.x * 0.4 + clock * p.speed * 4, 360);
        const y = 535 + p.y * 0.15 + Math.sin(p.phase + clock * 0.3) * 9;
        oval(ctx, x, y, 34 + p.size * 18, 3 + p.size, '#f3efdf');
      } else if (index === 5) {
        const x = wrap(p.x + clock * p.speed * 8, 1000), y = 760 + p.y * 0.21;
        ctx.beginPath(); ctx.ellipse(x, y, 4 + age * 28, 1 + age * 3, 0, 0.1, Math.PI * 0.94);
        ctx.strokeStyle = '#5c837a'; ctx.lineWidth = 0.8; ctx.stroke();
      } else {
        const x = wrap(p.x + Math.sin(clock + p.phase) * 7, 1000);
        const y = wrap(p.y + clock * p.speed * 9, 1000);
        oval(ctx, x, y, p.size, p.size * 0.75, p.size > 1.8 ? '#a34532' : '#348781');
      }
    });
  }
}

function actors(ctx, index, kin, t, progress) {
  if (index === 0) {
    for (const [j, x] of [142, 371, 679, 855].entries()) cattle(ctx, x, 416 + j % 2 * 52, 0.72 + j * 0.045, t, kin.x, j);
    herdsman(ctx, 235, 577, 1.15, kin.x, t); herdsman(ctx, 783, 590, 0.95, kin.x, t);
  } else if (index === 1) {
    egyptian(ctx, 239, ROAD_Y, 1.12, 1, kin.egyptSalute);
    egyptian(ctx, 772, ROAD_Y, 1.12, -1, kin.egyptSalute);
    for (let j = 0; j < 7; j++) egyptian(ctx, 290 + j * 72, 402, 0.53, 1, 0);
    if (kin.stopped) {
      withAlpha(ctx, 0.15 + kin.egyptSalute * 0.2, () => {
        poly(ctx, [[kin.x + 135, 374], [kin.x + 135, 402]], '#268b9d', 1);
        poly(ctx, [[kin.x + 119, 388], [kin.x + 151, 388]], '#268b9d', 1);
      });
    }
  } else if (index === 2) {
    horseChariot(ctx, 154 + Math.sin(t * 0.4) * 13, ROAD_Y, 0.7, t);
    horseChariot(ctx, 739 + Math.sin(t * 0.4 + 1) * 13, ROAD_Y, 0.64, t + 0.5);
    withAlpha(ctx, 0.55, () => {
      for (let j = 0; j < 3; j++) horseChariot(ctx, wrap(j * 365 + t * 9, 1230) - 100, 492, 0.42, t + j);
    });
  } else if (index === 3) {
    withAlpha(ctx, 0.42, () => willow(ctx, t, true));
    cloud(ctx, 781 + Math.sin(t * 0.3) * 10, 266, 0.9, '#ac9b7d', 0.8);
    ribbons(ctx, kin, t);
  } else if (index === 4) {
    for (let j = 0; j < 10; j++) {
      const u = wrap(t * 0.37 + j * 0.1, 1), x = mix(545, 575, u);
      withAlpha(ctx, Math.sin(u * Math.PI) * 0.6, () => poly(ctx, [[x, mix(300, 523, u)], [x + 1, mix(300, 523, u) + 9]], '#f7f5e9', 1));
    }
    for (let j = 0; j < 4; j++) {
      withAlpha(ctx, 0.12, () => oval(ctx, 601 + j * 22 + Math.sin(t * 0.3 + j) * 5, 663, 13 + j * 3, 1.7, '#667d6b'));
    }
  } else if (index === 5) {
    const target = { x: kin.x, y: kin.y - 115 * kin.scale };
    barge(ctx, mix(376, 631, progress), 779, t, target);
    for (let j = 0; j < 24; j++) {
      const x = 116 + j * 33.3;
      songPerson(ctx, x, rainbowY(x) - 1, 0.53 + j % 3 * 0.055, target, t + j * 0.1, j % 4);
    }
    for (let j = 0; j < 19; j++) {
      const x = 38 + j * 51;
      songPerson(ctx, x, 530 + Math.sin(j * 1.2) * 18, 0.57, target, t, j % 4);
    }
  } else mayaScribe(ctx, kin, t);
}

function bakePigment(p, brush, index) {
  if (!p || !brush) return;
  const seed = 6100 + index, rng = createSeededRng(seed);
  let pushed = false;
  try {
    if (typeof p.push === 'function') { p.push(); pushed = true; }
    p.randomSeed?.(seed); p.noiseSeed?.(seed); brush.seed?.(seed);
    const names = ['charcoal', 'cpencil', '2B', 'HB', 'charcoal', 'pen', 'marker'];
    const colors = ['#9b5b38', '#b39c65', '#b8b09c', '#c1ac7d', '#7d8b75', '#9c8258', '#b56c49'];
    brush.noFill?.(); brush.noHatch?.();
    for (let j = 0; j < 18; j++) {
      const x = rng.range(20, 970), y = rng.range(65, index === 4 ? 600 : 950);
      brush.set(names[index], colors[index], index === 4 ? 0.45 : 0.3);
      if (typeof brush.spline === 'function') {
        brush.spline([[x, y, 0.15], [clamp(x + 24, 0, 1000), y + 9, 0.25], [clamp(x + 60, 0, 1000), y + 14, 0.08]], 0.7);
      } else brush.line(x, y, clamp(x + 65, 0, 1000), y + 13);
    }
    // Transparent pigment blooms complement the guaranteed Canvas substrate.
    if (typeof brush.fill === 'function' && typeof brush.rect === 'function') {
      brush.noStroke?.(); brush.fill(colors[index], 5); brush.bleed?.(0.08);
      for (let j = 0; j < 6; j++) brush.rect(rng.range(60, 810), rng.range(80, 540), rng.range(30, 110), rng.range(12, 35));
    }
    if (typeof brush.hatch === 'function' && typeof brush.rect === 'function') {
      brush.noFill?.(); brush.set(index === 2 ? '2B' : 'HB', colors[index], 0.25);
      brush.hatch(7, index === 2 ? 55 : 25, { rand: 0, continuous: true });
      brush.rect(30, 720, 940, 35);
    }
  } catch {
    // p5.brush may be unavailable during warm-up or in a Canvas-only export.
  } finally {
    try { brush.noFill?.(); brush.noHatch?.(); brush.noStroke?.(); } catch { /* optional pigment backend */ }
    if (pushed) p.pop();
  }
}

function createScene(sceneIndex) {
  const meta = SCENES_META[sceneIndex];
  const scene = {
    sceneIndex,
    id: meta.id,
    meta,
    bake2D(ctx, sceneDef = scene) {
      const palette = sceneDef?.meta?.palette || sceneDef?.palette || meta.palette;
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(0, 0, 1000, 1000); ctx.clip();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        texture(ctx, sceneIndex); STATIC_PAINTERS[sceneIndex](ctx);
        road(ctx, sceneIndex === 2 ? '#dad1b9' : palette.ink, sceneIndex);
      } finally { ctx.restore(); }
    },
    bakeBrush(p, brush, sceneDef = scene) {
      // The scene's index fixes the pigment seed independently of bake order.
      void sceneDef;
      bakePigment(p, brush, sceneIndex);
    },
    drawDynamic(ctx, sceneCtx = {}) {
      const suppliedProgress = Number.isFinite(sceneCtx.sceneProgress);
      const absoluteT = finite(sceneCtx.canonicalT, finite(sceneCtx.realT, meta.startT));
      const progress = clamp(suppliedProgress ? sceneCtx.sceneProgress : (absoluteT - meta.startT) / (meta.endT - meta.startT));
      // Explicit progress must position the IK on the same bridge as the camera.
      const poseT = suppliedProgress ? mix(meta.startT, meta.endT, progress) : absoluteT;
      const t = finite(sceneCtx.sceneLocalT, poseT - meta.startT);
      const beat = clamp(finite(sceneCtx.beatPulse)), iron = clamp(finite(sceneCtx.ironPulse));
      const camera = meta.cameraZoom || {};
      const start = finite(camera.startProgress), end = finite(camera.endProgress, 1);
      const u = smooth((progress - start) / Math.max(0.0001, end - start));
      const zoom = mix(finite(camera.from, 1), finite(camera.to, 1), u);
      const focusX = finite(camera.focusX, 500), focusY = finite(camera.focusY, 540);
      const scale = sceneIndex === 4 ? finite(camera.subjectScale, 0.13) : sceneIndex === 5 ? 0.48 : 0.78;
      const kin = computePelicanKinematics(poseT, sceneIndex, { roadY: ROAD_Y, bridgeHeight: 106, scale });
      if (sceneIndex === 4) {
        kin.x = mix(604, 666, progress); kin.roadY = creekBridgeY(kin.x);
        kin.rotation = Math.atan(-9 * Math.PI / 114 * Math.cos(Math.PI * (kin.x - 578) / 114));
      } else if (sceneIndex === 5) {
        kin.x = mix(80, 920, progress);
      } else if (sceneIndex === 1) {
        // Entrance/exit finish outside the long, integrated Egyptian stop hold.
        kin.x = 500 - 230 * (1 - smooth(progress / 0.13)) + 210 * smooth((progress - 0.94) / 0.06);
      }
      // IK's local wheel radius must be scaled before placing the contact point.
      kin.y = kin.roadY - kin.wheelRadius * kin.scale;
      if (sceneIndex === 4 || sceneIndex === 5) seatWheelsOnBridge(kin, sceneIndex === 4 ? creekBridgeY : rainbowY);
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(0, 0, 1000, 1000); ctx.clip();
        ctx.translate(focusX, focusY); ctx.scale(zoom, zoom); ctx.translate(-focusX, -focusY);
        if (sceneCtx.bakedCanvas) ctx.drawImage(sceneCtx.bakedCanvas, 0, 0, 1000, 1000);
        else if (!sceneCtx.backdropAlreadyRendered) scene.bake2D(ctx, scene);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        actors(ctx, sceneIndex, kin, t, progress);
        microPhysics(ctx, sceneIndex, t, kin, beat, iron);
        drawPelicanBicycleCanvas2D(ctx, kin, {
          mode: MODES[sceneIndex], lineWidth: sceneIndex === 4 ? 1.7 : 1.4,
          ...(sceneIndex === 4 ? { palette: { feather: '#fffef5', wing: '#dce0d4' }, spokes: 8 } : {}),
        });
        if (sceneIndex === 1) egyptianPelicanSalute(ctx, kin);
      } finally { ctx.restore(); }
    },
  };
  return scene;
}

export const SCENES_BATCH_1 = Array.from({ length: 7 }, (_, index) => createScene(index));
