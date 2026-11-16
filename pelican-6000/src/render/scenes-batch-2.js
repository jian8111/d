// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG, SCENES_META } from "../data/scenes-meta.js";
import { drawGlyphText } from "../data/glyphs.js";
import { createSeededRng } from "../core/prng.js";
import {
  computePelicanKinematics,
  drawPelicanBicycleCanvas2D,
  quantizeTime8fps,
} from "./ik-pelican.js";

const SIZE = 1000;
const ROAD_Y = MV_TIMELINE_CONFIG.ROAD_EDGE_Y;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const mix = (a, b, u) => a + (b - a) * u;
const fract = (x) => x - Math.floor(x);
const ease = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const windowEnvelope = (p, a, b, fade = 0.06) =>
  ease((p - a) / fade) * (1 - ease((p - b + fade) / fade));

function paint(ctx, fill, stroke, width = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function path(ctx, build, fill, stroke, width = 1) {
  ctx.beginPath();
  build(ctx);
  paint(ctx, fill, stroke, width);
}

function poly(ctx, points, fill, stroke, width = 1, close = true) {
  path(ctx, (c) => {
    c.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
    if (close) c.closePath();
  }, fill, stroke, width);
}

const line = (ctx, points, color, width = 1) => poly(ctx, points, null, color, width, false);

function oval(ctx, x, y, rx, ry, fill, stroke, width = 1, angle = 0) {
  path(ctx, (c) => c.ellipse(x, y, rx, ry, angle, 0, TAU), fill, stroke, width);
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function saved(ctx, draw) {
  ctx.save();
  try { draw(); } finally { ctx.restore(); }
}

function alpha(ctx, opacity, draw) {
  saved(ctx, () => {
    ctx.globalAlpha = finite(ctx.globalAlpha, 1) * clamp(opacity);
    draw();
  });
}

function glyphText(ctx, text, x, y, size, options) {
  if (typeof globalThis.Path2D === "function") {
    drawGlyphText(ctx, text, x, y, size, options);
  } else if (typeof ctx.fillText === "function") {
    saved(ctx, () => {
      ctx.font = `${size}px ${options.family ?? "serif"}`;
      ctx.textAlign = options.align ?? "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = options.color;
      ctx.fillText(text, x, y);
    });
  }
}

// Lightweight mock contexts need not implement gradients or DOM canvases.
function gradient(ctx, radial, coords, stops) {
  const fn = radial ? ctx.createRadialGradient : ctx.createLinearGradient;
  if (typeof fn !== "function") return stops[0][1];
  const result = fn.apply(ctx, coords);
  if (!result || typeof result.addColorStop !== "function") return stops[0][1];
  for (const [offset, color] of stops) result.addColorStop(offset, color);
  return result;
}

function road(ctx, fill, edge, width = 3) {
  rect(ctx, 0, ROAD_Y, SIZE, SIZE - ROAD_Y, fill);
  line(ctx, [[0, ROAD_Y], [SIZE, ROAD_Y]], edge, width);
}

function wavy(ctx, y, amplitude, color, width, phase = 0, x0 = 0, x1 = SIZE) {
  const points = [];
  for (let x = x0; x <= x1; x += 12) {
    points.push([x, y + Math.sin(x * 0.009 + phase) * amplitude + Math.sin(x * 0.022 + phase) * amplitude * 0.22]);
  }
  line(ctx, points, color, width);
}

function cypress(ctx, x, bottom, height, width, fill, stroke) {
  path(ctx, (c) => {
    c.moveTo(x, bottom - height);
    c.bezierCurveTo(x - width * 0.3, bottom - height * 0.67, x - width, bottom - height * 0.23, x - width * 0.42, bottom);
    c.quadraticCurveTo(x, bottom + 14, x + width * 0.43, bottom);
    c.bezierCurveTo(x + width, bottom - height * 0.25, x + width * 0.28, bottom - height * 0.7, x, bottom - height);
    c.closePath();
  }, fill, stroke, 1.5);
}

function flower(ctx, x, y, radius, color, center = "#e5c579") {
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5;
    oval(ctx, x + Math.cos(a) * radius * 0.65, y + Math.sin(a) * radius * 0.65,
      radius * 0.45, radius * 0.25, color, null, 1, a);
  }
  oval(ctx, x, y, radius * 0.23, radius * 0.23, center);
}

function miniatureArch(ctx, x, y, width, height) {
  path(ctx, (c) => {
    c.moveTo(x, y + height);
    c.lineTo(x, y + 108);
    c.bezierCurveTo(x - 3, y + 73, x + 14, y + 51, x + 31, y + 61);
    c.bezierCurveTo(x + 19, y + 25, x + 47, y + 15, x + 59, y + 33);
    c.quadraticCurveTo(x + width * 0.36, y + 4, x + width / 2, y);
    c.quadraticCurveTo(x + width * 0.64, y + 4, x + width - 59, y + 33);
    c.bezierCurveTo(x + width - 47, y + 15, x + width - 19, y + 25, x + width - 31, y + 61);
    c.bezierCurveTo(x + width - 14, y + 51, x + width + 3, y + 73, x + width, y + 108);
    c.lineTo(x + width, y + height);
    c.closePath();
  }, "#142f2b", "#c99d52", 5);
}

function bakeMughal(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#263e37");
  rect(ctx, 22, 25, 956, 614, "#355447");
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 188;
    miniatureArch(ctx, x, 105, 167, 388);
    for (let j = 0; j < 5; j++) {
      const y = 188 + j * 53;
      flower(ctx, x + 15, y, 5, "#d27c87");
      flower(ctx, x + 151, y, 5, "#d27c87");
    }
    oval(ctx, x + 84, 77, 9, 9, "#c99d52", "#eed3a0", 1);
  }
  for (let i = 0; i < 3; i++) {
    const margin = 11 + i * 8;
    line(ctx, [[margin, 16], [margin, 653], [1000 - margin, 653], [1000 - margin, 16], [margin, 16]], "#c99d52", i === 1 ? 3 : 1);
  }
  for (let x = 38; x < 980; x += 28) {
    flower(ctx, x, 39, 5, "#c99d52");
    flower(ctx, x, 636, 4, "#d27c87");
  }
  for (const [x, h, w] of [[93, 310, 25], [255, 270, 22], [747, 270, 22], [915, 310, 25]]) {
    cypress(ctx, x, 502, h, w, "#123a31", "#a09d51");
    for (let k = 0; k < 10; k++) {
      const y = 490 - k * h / 12;
      line(ctx, [[x - 10, y], [x, y - 12], [x + 9, y - 3]], "#637c4b", 1);
    }
  }
  poly(ctx, [[293, 401], [707, 401], [822, 616], [178, 616]], "#cbb387", "#e3c074", 3);
  for (let i = 0; i < 3; i++) {
    const y = 430 + i * 54, half = 167 + i * 43;
    poly(ctx, [[500 - half, y], [500 + half, y], [500 + half + 24, y + 41], [500 - half - 24, y + 41]], "#37776c", "#edd39c", 5);
    for (let j = 0; j < 5; j++) line(ctx, [[500 - half + 23, y + 10 + j * 5], [500 + half - 23, y + 10 + j * 5]], "#76a597", 0.7);
    oval(ctx, 500, y + 19, 17, 5, "#d6c28a", "#e9ddae", 1);
  }
  road(ctx, "#a78b65", "#e6c884", 4);
  for (let y = ROAD_Y + 24; y < 1000; y += 49) {
    line(ctx, [[0, y], [1000, y]], "#796647", 1);
    for (let x = (y % 2) * 50 - 30; x < 1050; x += 100) {
      poly(ctx, [[x, y], [x + 49, y + 23], [x, y + 46], [x - 49, y + 23]], null, "#cbb48a", 1);
    }
  }
  const rng = createSeededRng("batch2:mughal:flowers");
  for (let i = 0; i < 68; i++) {
    const x = rng.range(26, 974), y = rng.range(525, 655);
    if (x > 195 && x < 805) continue;
    line(ctx, [[x, y + 9], [x - 2, y - 5]], "#698248", 1);
    flower(ctx, x - 2, y - 6, rng.range(3, 6), rng.pick(["#d27c87", "#e9bd80", "#c99d52"]));
  }
}

function bakeBada(ctx) {
  // Deliberately leave the top, center and right as untouched Xuan paper.
  rect(ctx, 0, 0, SIZE, SIZE, "#f1ecdf");
  const rng = createSeededRng("batch2:bada:rock");
  alpha(ctx, 0.12, () => {
    poly(ctx, [[57, 677], [83, 569], [115, 559], [127, 506], [153, 546], [191, 525], [203, 616], [256, 676]], "#434641");
  });
  poly(ctx, [[64, 677], [91, 617], [84, 580], [116, 589], [129, 534], [158, 562], [184, 550], [176, 609], [222, 647], [226, 677]], "#434641", "#232723", 3);
  for (let i = 0; i < 31; i++) {
    const x = rng.range(97, 192), y = rng.range(585, 666);
    alpha(ctx, rng.range(0.12, 0.5), () => line(ctx, [[x, y], [x + rng.range(-12, 15), y - rng.range(10, 32)]], "#f1ecdf", rng.range(1, 4)));
  }
  path(ctx, (c) => {
    c.moveTo(155, 638); c.bezierCurveTo(174, 558, 233, 483, 211, 356);
    c.moveTo(210, 407); c.quadraticCurveTo(253, 395, 271, 421);
    c.moveTo(218, 488); c.quadraticCurveTo(263, 464, 293, 492);
  }, null, "#232723", 3.5);
  path(ctx, (c) => {
    c.moveTo(210, 360); c.bezierCurveTo(170, 328, 160, 350, 166, 365);
    c.bezierCurveTo(178, 386, 204, 390, 229, 373); c.lineTo(242, 380);
  }, null, "#434641", 8);
  poly(ctx, [[253, 481], [275, 468], [303, 491], [291, 503], [271, 492]], "#434641");
  for (let i = 0; i < 26; i++) {
    const x = rng.range(87, 278), y = rng.range(560, 682);
    oval(ctx, x, y, rng.range(0.5, 3), rng.range(0.5, 2), "#434641");
  }
  // A lone, mildly affronted bird on the rock.
  oval(ctx, 164, 518, 16, 24, "#434641", null, 1, -0.2);
  oval(ctx, 171, 494, 12, 11, "#434641");
  poly(ctx, [[180, 491], [199, 494], [180, 497]], "#232723");
  oval(ctx, 175, 490, 5, 4, "#f1ecdf");
  oval(ctx, 175, 487, 1.5, 1.5, "#232723");
  line(ctx, [[160, 536], [158, 551], [149, 554]], "#232723", 1.6);
  alpha(ctx, 0.15, () => line(ctx, [[22, ROAD_Y], [197, ROAD_Y], [269, ROAD_Y]], "#434641", 0.8));
  alpha(ctx, 0.78, () => {
    line(ctx, [[272, 575], [299, 575], [299, 607], [272, 607], [272, 575]], "#ad3d30", 2);
    glyphText(ctx, "朱", 285.5, 590, 12, { family: "serif", align: "center", color: "#ad3d30" });
    glyphText(ctx, "耷", 285.5, 604, 12, { family: "serif", align: "center", color: "#ad3d30" });
  });
}

function gunungan(ctx, x, y, scale) {
  saved(ctx, () => {
    ctx.translate(x, y); ctx.scale(scale, scale);
    path(ctx, (c) => {
      c.moveTo(0, -370);
      for (let i = 0; i < 10; i++) {
        const u = (i + 1) / 10, v = i / 10;
        c.quadraticCurveTo(155 * Math.sin((u + v) * Math.PI / 4) + 13, -370 + (v + u) * 174, 155 * Math.sin(u * Math.PI / 2), -370 + u * 348);
      }
      c.quadraticCurveTo(90, 22, 0, 13);
      c.quadraticCurveTo(-90, 22, -155, -22);
      for (let i = 9; i >= 0; i--) {
        const u = i / 10;
        c.quadraticCurveTo(-155 * Math.sin((u + 0.05) * Math.PI / 2) - 13, -370 + (u + 0.05) * 348, -155 * Math.sin(u * Math.PI / 2), -370 + u * 348);
      }
      c.closePath();
    }, "#20130c", "#b9863b", 3);
    line(ctx, [[0, 0], [0, -303]], "#ba893e", 4);
    for (let i = 0; i < 9; i++) {
      const y0 = -55 - i * 25, w = 104 - i * 9;
      for (const sign of [-1, 1]) {
        path(ctx, (c) => {
          c.moveTo(0, y0 + 10); c.quadraticCurveTo(sign * w, y0 - 9, sign * w * 0.66, y0 - 39);
          c.quadraticCurveTo(sign * w * 0.4, y0 - 52, sign * w * 0.4, y0 - 21);
        }, null, "#c8994f", 2);
        for (let j = 0; j < 4; j++) oval(ctx, sign * (22 + j * w / 6), y0 - j * 4, 2, 2.5, "#d8a34c");
      }
    }
    poly(ctx, [[-39, -13], [-39, -53], [0, -78], [39, -53], [39, -13]], "#160f0b", "#d8a34c", 2);
  });
}

function wayangFigure(ctx, x, y, scale, pose = 0, facing = 1) {
  saved(ctx, () => {
    ctx.translate(x, y); ctx.scale(scale * facing, scale);
    path(ctx, (c) => {
      c.moveTo(-28, 0); c.lineTo(-34, -74); c.quadraticCurveTo(-37, -119, -7, -136);
      c.lineTo(-14, -159); c.quadraticCurveTo(-30, -177, -13, -204);
      c.lineTo(3, -239); c.lineTo(11, -206); c.quadraticCurveTo(29, -199, 22, -183);
      c.lineTo(61, -175); c.lineTo(17, -164); c.lineTo(9, -140);
      c.quadraticCurveTo(45, -122, 23, -70); c.lineTo(47, 0); c.closePath();
    }, "#21150d", "#b7843e", 2);
    poly(ctx, [[10, -132], [49, -100 + pose * 14], [79, -143 + pose * 26]], null, "#160f0b", 7, false);
    poly(ctx, [[-17, -130], [-49, -91 - pose * 11], [-62, -59 + pose * 22]], null, "#160f0b", 7, false);
    for (const [hx, hy] of [[79, -143 + pose * 26], [-62, -59 + pose * 22]]) {
      oval(ctx, hx, hy, 5, 5, "#d8a34c", "#160f0b", 1);
      line(ctx, [[hx, hy], [hx + pose * 14, 160]], "#694922", 2);
    }
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 4; i++) oval(ctx, -21 + i * 13 + (j % 2) * 3, -113 + j * 13, 2, 2.5, "#c99545");
    }
    oval(ctx, 16, -186, 2, 2, "#d8a34c");
    line(ctx, [[-26, 1], [47, 1]], "#d8a34c", 3);
  });
}

function bakeWayang(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#392717");
  rect(ctx, 24, 27, 952, 645, gradient(ctx, true, [510, 370, 12, 510, 370, 660], [[0, "#e9bf68"], [0.48, "#d8a34c"], [1, "#392717"]]));
  const rng = createSeededRng("batch2:wayang:cotton");
  alpha(ctx, 0.09, () => {
    for (let x = 26; x < 977; x += 7) line(ctx, [[x, 29], [x + rng.range(-1, 1), 670]], "#51301b", 0.7);
    for (let y = 32; y < 670; y += 9) line(ctx, [[26, y], [974, y]], "#f6d38b", 0.7);
  });
  gunungan(ctx, 493, 537, 1.08);
  for (let x = 28; x < 1000; x += 38) {
    path(ctx, (c) => { c.moveTo(x - 20, 27); c.quadraticCurveTo(x, 79, x + 20, 27); }, "#21150d", "#aa7a36", 2);
  }
  road(ctx, "#392717", "#160f0b", 7);
  for (let x = 12; x < 1000; x += 23) poly(ctx, [[x, 681], [x + 12, 705], [x + 23, 681]], "#b8873e", "#160f0b", 1);
  alpha(ctx, 0.17, () => oval(ctx, 500, 746, 361, 24, "#d8a34c"));
}

function waveCrest(ctx, x, y, scale, phase = 0) {
  saved(ctx, () => {
    ctx.translate(x, y); ctx.scale(scale, scale);
    path(ctx, (c) => {
      c.moveTo(-310, 167);
      c.bezierCurveTo(-207, 108, -191, -150, -51, -196);
      c.bezierCurveTo(37, -228, 150, -162, 127, -91);
      c.bezierCurveTo(120, -152, 43, -165, -4, -125);
      c.bezierCurveTo(-61, -70, 21, 8, 149, 61);
      c.lineTo(272, 167); c.closePath();
    }, "#315982", "#203e58", 3);
    for (let j = 0; j < 10; j++) {
      path(ctx, (c) => {
        c.moveTo(-287 + j * 15, 153);
        c.bezierCurveTo(-149 + j * 4, 14, -186 + j * 8, -133 + j * 4, -47 + j * 8, -167 + j * 5);
      }, null, j % 3 ? "#78959c" : "#efe1bd", j % 3 ? 1.3 : 3);
    }
    for (let j = 0; j < 15; j++) {
      const a = -2.85 + j * 0.138;
      const fx = 34 + Math.cos(a) * 121, fy = -67 + Math.sin(a) * 112;
      path(ctx, (c) => {
        c.moveTo(fx - 19, fy + 17);
        c.quadraticCurveTo(fx + 1, fy - 19, fx + 21, fy - 9);
        c.quadraticCurveTo(fx + 30, fy + 2, fx + 13, fy + 14);
        c.quadraticCurveTo(fx + 21, fy - 8, fx + 8, fy + 3);
        c.lineTo(fx - 1, fy + 25);
      }, "#f6ebcf", "#203e58", 1.3);
    }
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4 + phase, r = 15 + i * 4;
      oval(ctx, 56 + Math.cos(a) * r, -167 + Math.sin(a) * r * 0.47, 2.4, 4.5, "#f6ebcf", "#203e58", 0.7, a);
    }
  });
}

function bakeUkiyoe(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#efe1bd");
  rect(ctx, 0, 0, SIZE, 550, gradient(ctx, false, [0, 40, 0, 550], [[0, "#cfb78c"], [0.48, "#efe1bd"], [1, "#d8d3b5"]]));
  // Fuji remains legible beyond the clawed foreground wave.
  poly(ctx, [[468, 533], [674, 236], [885, 533]], "#718b9b", "#203e58", 2.5);
  poly(ctx, [[615, 322], [674, 236], [735, 324], [705, 311], [691, 335], [675, 312], [647, 331], [638, 315]], "#fff2d2", "#203e58", 1.3);
  for (let i = 0; i < 12; i++) line(ctx, [[674 + i * 3, 340 + i * 9], [791 + i * 4, 514]], "#315982", 1);
  rect(ctx, 0, 503, SIZE, 177, "#50748a");
  for (let y = 521; y < 678; y += 12) wavy(ctx, y, 5, "#e4d8b8", 1.2, y * 0.07);
  waveCrest(ctx, 223, 497, 1.16);
  waveCrest(ctx, 860, 588, 0.55, 1.3);
  poly(ctx, [[422, 592], [470, 577], [629, 583], [610, 599]], "#bb9e6e", "#203e58", 2);
  for (let x = 470; x < 605; x += 17) line(ctx, [[x, 583], [x - 3, 592]], "#203e58", 2);
  road(ctx, "#b59b75", "#203e58", 5);
  for (let y = ROAD_Y + 12; y < 1000; y += 32) {
    line(ctx, [[0, y], [1000, y]], "#203e58", 2);
    line(ctx, [[0, y + 3], [1000, y + 3]], "#e0caa0", 1.2);
  }
  for (let x = -20; x < 1040; x += 95) line(ctx, [[x, ROAD_Y], [x - 75, 1000]], "#6f6555", 1.5);
  const rng = createSeededRng("batch2:ukiyoe:keyblock");
  alpha(ctx, 0.10, () => {
    for (let i = 0; i < 125; i++) {
      const x = rng.range(0, 1000), y = rng.range(0, 1000);
      line(ctx, [[x, y], [x + rng.range(7, 53), y + rng.range(-1, 1)]], "#203e58", 0.6);
    }
  });
  rect(ctx, 871, 70, 51, 142, "#efe1bd");
  line(ctx, [[871, 70], [922, 70], [922, 212], [871, 212], [871, 70]], "#203e58", 2);
  for (const [i, char] of [..."富嶽"].entries()) glyphText(ctx, char, 896, 104 + i * 42, 30, { family: "serif", align: "center", color: "#203e58" });
  rect(ctx, 883, 175, 25, 22, "#b75042");
}

const STAR_CENTERS = [
  [210, 119, 29], [365, 178, 38], [536, 107, 23], [668, 221, 32],
  [827, 111, 30], [901, 335, 22], [467, 362, 25], [275, 344, 20],
];

function impastoSwirl(ctx, cx, cy, radius, rotation, color, width = 4) {
  const points = [];
  for (let i = 0; i <= 78; i++) {
    const u = i / 78, a = rotation + u * TAU * 2.3;
    const r = radius * (0.14 + u * 0.86);
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.69]);
  }
  line(ctx, points, color, width);
}

function bakeStarry(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#152d56");
  const rng = createSeededRng("batch2:starry:impasto");
  for (let i = 0; i < 640; i++) {
    const x = rng.range(0, 1000), y = rng.range(0, 640);
    const a = Math.atan2(y - 325, x - 560) + Math.PI / 2;
    const length = rng.range(6, 23);
    line(ctx, [[x, y], [x + Math.cos(a) * length, y + Math.sin(a) * length]], rng.pick(["#294a78", "#355f91", "#4f78ab", "#24416a"]), rng.range(2, 5));
  }
  for (let j = 0; j < 8; j++) {
    path(ctx, (c) => {
      c.moveTo(-45, 365 + j * 10);
      c.bezierCurveTo(193, 220 + j * 10, 381, 580 - j * 9, 618, 349 + j * 8);
      c.bezierCurveTo(790, 167 + j * 7, 881, 448 + j * 8, 1036, 281 + j * 13);
    }, null, j % 3 === 0 ? "#b8bc83" : j % 2 ? "#6793b3" : "#345c91", j % 2 ? 6 : 9);
  }
  for (const [x, y, r] of STAR_CENTERS) {
    for (let ring = 3; ring > 0; ring--) oval(ctx, x, y, r + ring * 11, r * 0.8 + ring * 8, null, ring % 2 ? "#6588a1" : "#b4b983", 5);
    oval(ctx, x, y, r * 0.35, r * 0.35, "#ead064");
  }
  path(ctx, (c) => {
    c.moveTo(840, 163); c.bezierCurveTo(942, 199, 965, 57, 878, 46);
    c.bezierCurveTo(922, 91, 883, 153, 840, 163); c.closePath();
  }, "#f3d77c", "#dcae46", 5);
  for (let i = 0; i < 3; i++) impastoSwirl(ctx, 603, 308, 113 + i * 17, i * 0.35, i % 2 ? "#b2bb9b" : "#4f78ab", 5);
  path(ctx, (c) => {
    c.moveTo(0, 596); c.quadraticCurveTo(177, 500, 349, 565);
    c.quadraticCurveTo(627, 471, 1000, 566); c.lineTo(1000, ROAD_Y); c.lineTo(0, ROAD_Y); c.closePath();
  }, "#253b4f", "#6a8c94", 5);
  for (let i = 0; i < 13; i++) {
    const x = 226 + i * 57, y = 596 + Math.sin(i * 1.7) * 22;
    rect(ctx, x, y, 38, ROAD_Y - y, "#32485a");
    poly(ctx, [[x - 6, y], [x + 18, y - 24], [x + 44, y]], "#182d44", "#668393", 2);
    rect(ctx, x + 12, y + 13, 7, 13, i % 3 ? "#d0b85e" : "#65869e");
  }
  poly(ctx, [[590, 655], [590, 566], [602, 536], [614, 566], [614, 655]], "#152d48", "#718b9c", 2);
  cypress(ctx, 127, 712, 642, 65, "#10213c", "#294239");
  for (let j = 0; j < 23; j++) {
    const x = 87 + (j % 6) * 13;
    path(ctx, (c) => { c.moveTo(x, 682); c.bezierCurveTo(x - 19, 477, 165, 353, 127, 112 + j * 9); }, null, j % 3 ? "#233b36" : "#59613e", 3);
  }
  road(ctx, "#243b47", "#b5ad65", 4);
  for (let j = 0; j < 15; j++) wavy(ctx, 706 + j * 22, 5, j % 2 ? "#365669" : "#7a8e80", 4, j * 0.8);
}

function bakeScream(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#423c48");
  rect(ctx, 0, 0, SIZE, 442, "#d37144");
  for (let j = 0; j < 24; j++) {
    const y = 18 + j * 17;
    wavy(ctx, y, 21 + j * 0.9, ["#e4b774", "#b94536", "#e18b4e", "#773f40"][j % 4], 9 + j % 5, j * 0.19);
  }
  path(ctx, (c) => {
    c.moveTo(0, 470); c.bezierCurveTo(201, 388, 489, 396, 694, 468);
    c.bezierCurveTo(819, 505, 859, 400, 1000, 402); c.lineTo(1000, ROAD_Y); c.lineTo(0, ROAD_Y); c.closePath();
  }, "#2b414d", "#222e3c", 8);
  for (let i = 0; i < 13; i++) {
    path(ctx, (c) => {
      c.moveTo(409 + i * 22, 462);
      c.bezierCurveTo(530 + i * 20, 478, 788 + i * 3, 511, 531 + i * 38, 658);
    }, null, i % 2 ? "#797e7e" : "#172f43", 5);
  }
  poly(ctx, [[0, 485], [1000, 827], [1000, 1000], [0, 1000]], "#87664e", "#252c38", 4);
  // The riding edge stays horizontal at 680; rails carry the diagonal perspective.
  road(ctx, "#84644f", "#c18d60", 3);
  for (let y = ROAD_Y + 17; y < 1040; y += 35) line(ctx, [[0, y - 10], [1000, y + 60]], "#473f3b", 4);
  for (let x = -100; x < 1150; x += 141) {
    const y = 470 + x * 0.19;
    line(ctx, [[x, y], [x, y + 160]], "#252c38", 13);
    line(ctx, [[x + 4, y], [x + 4, y + 153]], "#c58c5f", 3);
  }
  for (const offset of [0, 57, 115]) line(ctx, [[-20, 464 + offset], [1020, 662 + offset]], "#252c38", 11);
  for (const offset of [0, 57]) line(ctx, [[-20, 459 + offset], [1020, 657 + offset]], "#c38a5c", 4);
  for (const x of [96, 137]) {
    oval(ctx, x, 424 + x * 0.12, 10, 14, "#252c38");
    poly(ctx, [[x - 8, 438 + x * 0.12], [x + 10, 438 + x * 0.12], [x + 18, 496 + x * 0.12], [x - 12, 495 + x * 0.12]], "#252c38");
  }
}

function filmBorder(ctx) {
  for (const inset of [18, 27]) {
    line(ctx, [[inset, inset], [1000 - inset, inset], [1000 - inset, 1000 - inset], [inset, 1000 - inset], [inset, inset]], "#a3aba8", inset === 18 ? 3 : 1);
  }
  for (const x of [42, 958]) {
    for (const y of [43, 956]) {
      line(ctx, [[x - 13, y], [x, y - 10], [x + 13, y], [x, y + 10], [x - 13, y]], "#c6c9bb", 1.3);
      oval(ctx, x, y, 3, 3, "#c6c9bb");
    }
  }
  line(ctx, [[375, 64], [452, 64]], "#858d8d", 1);
  line(ctx, [[548, 64], [625, 64]], "#858d8d", 1);
  glyphText(ctx, "1922", 500, 71, 22, { family: "serif", align: "center", color: "#bfc4bd" });
}

function bakeNoir(ctx) {
  rect(ctx, 0, 0, SIZE, SIZE, "#161a20");
  poly(ctx, [[66, 122], [908, 88], [956, 678], [89, 678]], "#454b4f", "#080c11", 6);
  path(ctx, (c) => {
    c.moveTo(387, 661); c.lineTo(399, 279);
    c.bezierCurveTo(427, 124, 714, 76, 762, 252);
    c.lineTo(816, 661); c.closePath();
  }, "#777e7b", "#11171c", 18);
  path(ctx, (c) => {
    c.moveTo(444, 644); c.lineTo(447, 290);
    c.bezierCurveTo(462, 180, 670, 139, 700, 269);
    c.lineTo(748, 644); c.closePath();
  }, "#292f34", "#9aa099", 4);
  poly(ctx, [[71, 133], [301, 112], [291, 621], [94, 669]], "#222830", "#080c11", 6);
  poly(ctx, [[135, 221], [244, 179], [229, 393], [150, 429]], "#070c11", "#707b7d", 3);
  line(ctx, [[184, 209], [189, 415]], "#7b8581", 5);
  line(ctx, [[143, 311], [234, 282]], "#7b8581", 4);
  for (let i = 0; i < 9; i++) {
    const x = 543 + i * 42, y = ROAD_Y - i * 35;
    poly(ctx, [[x, y], [x + 40, y - 14], [996, y - 31], [996, y + 19], [x, y + 35]], i % 2 ? "#646d6b" : "#858c85", "#151b21", 3);
    line(ctx, [[x + 3, y], [991, y - 25]], "#bec4b7", 2);
  }
  line(ctx, [[510, 611], [955, 246]], "#141b21", 10);
  for (let i = 0; i < 7; i++) line(ctx, [[552 + i * 57, 645 - i * 43], [544 + i * 57, 584 - i * 47]], "#141b21", 6);
  road(ctx, "#242b31", "#9aa39f", 3);
  for (let i = 0; i < 11; i++) line(ctx, [[0, ROAD_Y + 20 + i * 32], [1000, ROAD_Y + 10 + i * 39]], "#39434a", 2);
  poly(ctx, [[120, 1000], [930, ROAD_Y], [1000, ROAD_Y], [1000, 1000]], "#485154");
  const rng = createSeededRng("batch2:noir:plaster");
  alpha(ctx, 0.12, () => {
    for (let i = 0; i < 160; i++) {
      const x = rng.range(60, 970), y = rng.range(115, 661);
      line(ctx, [[x, y], [x + rng.range(2, 14), y + rng.range(-6, 6)]], rng.pick(["#bfc4bd", "#080c11"]), 1);
    }
  });
  filmBorder(ctx);
}

function brushCall(brush, method, ...args) {
  try {
    if (typeof brush?.[method] === "function") brush[method](...args);
  } catch {
    // A missing pigment or unsupported brush extension must not stop playback.
  }
}

function bakePigment(p, brush, sceneDef, index) {
  if (!brush) return;
  const rng = createSeededRng(`batch2:pigment:${index}`);
  const palette = sceneDef?.palette ?? sceneDef?.meta?.palette ?? SCENES_META[index].palette;
  let pushed = false;
  try {
    if (typeof p?.push === "function") { p.push(); pushed = true; }
    if (typeof p?.randomSeed === "function") p.randomSeed(6000 + index);
    if (typeof p?.noiseSeed === "function") p.noiseSeed(6000 + index);
    brushCall(brush, "seed", 6000 + index);
    brushCall(brush, "noHatch");
    brushCall(brush, "noFill");
    const count = index === 8 ? 9 : index === 11 ? 108 : 60;
    for (let i = 0; i < count; i++) {
      let x, y, x2, y2, name, color, weight;
      if (index === 7) {
        x = rng.range(36, 964); y = rng.range(575, 655);
        x2 = x + rng.range(-8, 8); y2 = y - rng.range(7, 23);
        name = "cpencil"; color = i % 3 ? palette.primary : palette.accent; weight = 0.7;
      } else if (index === 8) {
        x = rng.range(100, 193); y = rng.range(594, 663);
        x2 = x + rng.range(-12, 12); y2 = y - rng.range(9, 38);
        name = "charcoal"; color = palette.ink; weight = 1.5;
      } else if (index === 9) {
        x = rng.range(38, 962); y = rng.range(80, 641);
        x2 = clamp(x + rng.range(10, 25), 30, 970); y2 = y + 1;
        name = "HB"; color = i % 2 ? "#835a2d" : "#e5ba68"; weight = 0.25;
      } else if (index === 10) {
        x = rng.range(20, 980); y = rng.range(518, 655);
        x2 = clamp(x + rng.range(12, 48), 20, 980); y2 = y + rng.range(-3, 3);
        name = "pen"; color = i % 4 ? palette.primary : "#efe1bd"; weight = 0.6;
      } else if (index === 11) {
        x = rng.range(20, 980); y = rng.range(34, 527);
        const a = Math.atan2(y - 320, x - 566) + Math.PI / 2;
        x2 = x + Math.cos(a) * 19; y2 = y + Math.sin(a) * 19;
        name = "marker"; color = i % 6 ? palette.primary : palette.accent; weight = 2.2;
      } else if (index === 12) {
        x = rng.range(22, 942); y = rng.range(44, 384);
        x2 = x + 34; y2 = y + Math.sin(x * 0.013) * 11;
        name = "cpencil"; color = i % 3 ? palette.primary : palette.accent; weight = 2.1;
      } else {
        x = rng.range(90, 330); y = rng.range(156, 625);
        x2 = x + 18; y2 = y - 27;
        name = i % 3 ? "charcoal" : "2B"; color = i % 3 ? palette.ink : "#707c7d"; weight = 0.8;
      }
      brushCall(brush, "set", name, color, weight);
      brushCall(brush, "line", x, y, x2, y2);
    }
    // Low-opacity washes stay inside existing painted regions, preserving Bada's void.
    if (index !== 8) {
      brushCall(brush, "noStroke");
      brushCall(brush, "fill", palette.primary, index === 9 ? 2 : 4);
      brushCall(brush, "bleed", 0.12);
      brushCall(brush, "rect", index === 13 ? 93 : 36, index === 11 ? 510 : 612, index === 13 ? 170 : 928, 36);
    }
  } catch {
    // Also tolerate a partial p5 instance during a static preview or Node smoke check.
  } finally {
    brushCall(brush, "noFill");
    brushCall(brush, "noHatch");
    try { if (pushed && typeof p?.pop === "function") p.pop(); } catch { /* optional p5 state */ }
  }
}

function inPelicanSpace(ctx, kin, draw) {
  saved(ctx, () => {
    ctx.translate(kin.x, kin.y); ctx.rotate(kin.rotation); ctx.scale(kin.scale, kin.scale);
    draw();
  });
}

function worldPoint(kin, x, y) {
  const a = kin.rotation, s = kin.scale;
  return { x: kin.x + (x * Math.cos(a) - y * Math.sin(a)) * s,
    y: kin.y + (x * Math.sin(a) + y * Math.cos(a)) * s };
}

function groundKin(kin) {
  kin.y = ROAD_Y - kin.wheelRadius * kin.scale;
  return kin;
}

function attendant(ctx, x, y, scale, kin, time, color) {
  saved(ctx, () => {
    ctx.translate(x, y); ctx.scale(scale, scale);
    const turn = clamp((kin.x - x) / 150, -1, 1);
    const nod = Math.sin(time * 1.7 + x) * 0.1;
    poly(ctx, [[-17, -73], [15, -73], [26, -5], [-27, -5]], color, "#172c29", 2);
    for (let i = -1; i <= 1; i++) line(ctx, [[i * 7, -69], [i * 9, -7]], "#e2bd7d", 1);
    oval(ctx, 0, -79, 10, 8, "#cfa775", "#172c29", 1);
    saved(ctx, () => {
      ctx.translate(turn * 3, -94); ctx.rotate(turn * 0.2 + nod);
      oval(ctx, 0, 0, 12, 16, "#d8b789", "#172c29", 1);
      oval(ctx, 0, -13, 18, 9, "#ddc893", "#c99d52", 2);
      line(ctx, [[-16, -12], [12, -17]], "#d27c87", 2);
      oval(ctx, turn * 6, -1, 1.7, 1.7, "#172c29");
      line(ctx, [[turn * 4, 9], [turn * 9, 7]], "#6d4a31", 1);
    });
    line(ctx, [[-16, -66], [turn * 20 - 6, -43], [turn * 35, -64 + Math.sin(time * 2 + x) * 3]], "#d8b789", 6);
    line(ctx, [[-12, -4], [-16, 2], [-4, 2]], "#172c29", 3);
    line(ctx, [[10, -4], [8, 2], [20, 2]], "#172c29", 3);
  });
}

function dynamicMughal(ctx, state, kin) {
  const t = state.local;
  for (const [i, y] of [449, 503, 557].entries()) {
    for (const sign of [-1, 1]) {
      path(ctx, (c) => {
        c.moveTo(500, y + 13);
        c.quadraticCurveTo(500 + sign * 20, y - 83 + i * 10, 500 + sign * 52, y + 10);
      }, null, "#9ad6c2", 1.6);
      for (let n = 0; n < 9; n++) {
        const u = fract(n / 9 + t * 0.43);
        oval(ctx, 500 + sign * 52 * u, y + 13 - Math.sin(u * Math.PI) * (50 - i * 6), 1.4, 2.8, "#e3edc6");
      }
    }
    oval(ctx, 500, y + 15, 29 + Math.sin(t * 3 + i) * 8, 4, null, "#b4d5ad", 1);
  }
  const people = [[72, 624, 1.06], [173, 574, 0.75], [287, 540, 0.6], [728, 540, 0.6], [829, 574, 0.75], [934, 624, 1.06]];
  people.forEach(([x, y, s], i) => attendant(ctx, x, y, s, kin, t, i % 2 ? "#906264" : "#bd9c5e"));
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "museum_white", palette: { frame: "#c99d52", metal: "#e4cd83", accent: "#d27c87", ink: "#263e37" } });
  inPelicanSpace(ctx, kin, () => {
    oval(ctx, kin.body.x, kin.body.y, 61, 35, null, "#c99d52", 2.5, -0.1);
    for (let i = 0; i < 6; i++) flower(ctx, -86 + i * 15, kin.body.y + Math.sin(i) * 10, 3.2, "#d27c87");
    line(ctx, [[32, kin.head.y - 21], [37, kin.head.y - 42], [47, kin.head.y - 31], [55, kin.head.y - 47], [66, kin.head.y - 21]], "#e3c06f", 3);
    oval(ctx, 55, kin.head.y - 40, 3, 5, "#d27c87", "#e3c06f", 1);
    for (const x of [-112, 112]) oval(ctx, x, 0, kin.wheelRadius - 4, kin.wheelRadius - 4, null, "#e9cd87", 2);
  });
}

function dynamicBada(ctx, state, kin) {
  // The legs pause, but Zhu Da's disdainful eyes retain their own acting clock.
  kin.eyeRoll = ease(0.5 + 0.5 * Math.sin(state.local * 1.65 - 1));
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "ink_minimal", lineWidth: 1.8, spokes: 6 });
  inPelicanSpace(ctx, kin, () => {
    const x = kin.head.x + 11, y = kin.head.y - 6;
    oval(ctx, x, y, 8.5, 9, "#f1ecdf", "#232723", 1.2);
    oval(ctx, x + 1 - kin.eyeRoll * 2, y + 1 - kin.eyeRoll * 7, 2.4, 2.7, "#232723");
    line(ctx, [[x - 10, y - 12], [x + 8, y - 14]], "#232723", 2.2);
    alpha(ctx, 0.35, () => line(ctx, [[x - 7, y + 11], [x + 7, y + 10]], "#434641", 1));
  });
  alpha(ctx, 0.1, () => oval(ctx, kin.x, ROAD_Y + 2, 113, 3, "#434641"));
}

function dynamicWayang(ctx, state, kin) {
  const t = state.time, pose = Math.sin(t * 4);
  const flicker = 0.025 + 0.018 * Math.sin(t * 31) + 0.012 * Math.sin(t * 47);
  alpha(ctx, Math.max(0, flicker), () => rect(ctx, 24, 27, 952, 645, "#ffe0a0"));
  wayangFigure(ctx, 164, 588, 1.05, pose, 1);
  wayangFigure(ctx, 854, 581, 0.93, -pose, -1);
  inPelicanSpace(ctx, kin, () => {
    const elbow = { x: -54 + pose * 8, y: -181 + pose * 11 };
    line(ctx, [[18, -152], [elbow.x, elbow.y], [-93 + pose * 15, -129]], "#21150d", 5);
    for (const [x, y] of [[-93 + pose * 15, -129], [105, -112], [-32, -87]]) {
      line(ctx, [[x, y], [x + pose * 23, 333]], "#3d2918", 2.5);
      line(ctx, [[x + 2, y], [x + pose * 23 + 2, 333]], "#a77c39", 0.8);
    }
  });
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "wayang_puppet", alpha: 0.86, lineWidth: 2.3 });
  inPelicanSpace(ctx, kin, () => {
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 6; i++) {
        const x = -89 + i * 14, y = -166 + j * 7;
        if (((x + 49) / 63) ** 2 + ((y + 149) / 34) ** 2 < 1) oval(ctx, x, y, 1.8, 1.4, "#e7b95f");
      }
    }
    for (const [x, y] of [[kin.hip.x, kin.hip.y], [kin.legs.left.knee.x, kin.legs.left.knee.y], [65, -92]]) {
      oval(ctx, x, y, 3.5, 3.5, "#c79946", "#160f0b", 1);
    }
  });
  // Flame, rods, embers, light and camera all share this same quantized clock.
  oval(ctx, 508, 831, 52, 15, "#160f0b", "#b7863d", 2);
  path(ctx, (c) => {
    c.moveTo(497, 818); c.quadraticCurveTo(479, 793, 508 + pose * 5, 764);
    c.quadraticCurveTo(509, 787, 520, 794); c.quadraticCurveTo(529, 817, 497, 818);
  }, "#e5a54a", "#f6cd72", 2);
}

function dynamicUkiyoe(ctx, state, kin) {
  const glance = windowEnvelope(state.progress, 0.20, 0.82, 0.15);
  kin.head = { ...kin.head, x: kin.head.x - 25 * glance, angle: -0.24 * glance };
  kin.beak = { ...kin.beak, x: kin.head.x + 19 - 30 * glance, y: kin.head.y - 1,
    angle: kin.beak.angle - 2.72 * glance };
  kin.neck = kin.neck.map((point, i) => i === 3 ? { x: kin.head.x - 15, y: kin.head.y } : point);
  wavy(ctx, 627, 4, "#f6ebcf", 3, state.local * 1.1);
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "ukiyoe_woodblock", lineWidth: 2.4 });
  if (glance > 0.05) inPelicanSpace(ctx, kin, () => {
    alpha(ctx, glance, () => {
      oval(ctx, kin.head.x - 7, kin.head.y - 8, 5.2, 5.5, "#fff2d2", "#203e58", 1);
      oval(ctx, kin.head.x - 9, kin.head.y - 9, 2, 2, "#203e58");
      line(ctx, [[kin.head.x - 16, kin.head.y - 18], [kin.head.x - 1, kin.head.y - 21]], "#203e58", 1.4);
    });
  });
}

function dynamicStarry(ctx, state, kin) {
  // There is deliberately no independent time term in any vortex's angle.
  STAR_CENTERS.forEach(([x, y, r], i) => {
    const rotation = kin.wheelAngle * (i % 2 ? -0.7 : 1) + i * 1.7;
    for (let band = 0; band < 3; band++) impastoSwirl(ctx, x, y, r + band * 8, rotation + band * 0.38, band % 2 ? "#7493a5" : "#ead064", band === 0 ? 5 : 3);
    oval(ctx, x, y, 5 + state.beat * 2, 5 + state.beat * 2, "#ffed9c");
  });
  impastoSwirl(ctx, 603, 308, 127, kin.wheelAngle * 0.55, "#bfc99d", 7);
  impastoSwirl(ctx, 603, 308, 143, kin.wheelAngle * 0.55 + 0.4, "#648eb0", 5);
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "impasto_oil", lineWidth: 3.5 });
  inPelicanSpace(ctx, kin, () => {
    for (const x of [-112, 112]) {
      for (let i = 0; i < 17; i++) {
        const a = kin.wheelAngle + i * TAU / 17;
        const r = kin.wheelRadius;
        line(ctx, [[x + Math.cos(a) * r, Math.sin(a) * r], [x + Math.cos(a + 0.13) * r, Math.sin(a + 0.13) * r]], i % 2 ? "#ead064" : "#6e9ab2", 4.2);
      }
    }
  });
}

function screamer(ctx, x, base, recoil, mouth, uneasy, time) {
  saved(ctx, () => {
    ctx.translate(x + recoil * 17, base); ctx.rotate(recoil * 0.055);
    path(ctx, (c) => {
      c.moveTo(-39, 0); c.bezierCurveTo(-61, -49, 13, -92, -23, -161);
      c.quadraticCurveTo(-42, -197, -15, -202);
      c.quadraticCurveTo(27, -212, 30, -165);
      c.bezierCurveTo(57, -103, 2, -67, 43, 0); c.closePath();
    }, "#33393d", "#202b34", 4);
    for (let j = 0; j < 5; j++) {
      path(ctx, (c) => {
        c.moveTo(-25 + j * 12, -4);
        c.bezierCurveTo(-48 + j * 14, -54, 30 + j * 3, -107, -10 + j * 7, -171);
      }, null, j % 2 ? "#7b7769" : "#4e5554", 4);
    }
    path(ctx, (c) => {
      c.moveTo(-20, -193); c.bezierCurveTo(-60, -221, -45, -282, -4, -283);
      c.bezierCurveTo(40, -284, 49, -233, 18, -198);
      c.quadraticCurveTo(1, -180, -20, -193); c.closePath();
    }, "#d8c79c", "#725d50", 3);
    oval(ctx, -15, -246, 7, uneasy ? 2 : 5, "#34363b", null, 1, -0.12);
    oval(ctx, 14, -246, 7, uneasy ? 2 : 5, "#34363b", null, 1, 0.12);
    line(ctx, [[0, -246], [-4, -230], [4, -227]], "#7b6b58", 2.5);
    oval(ctx, 0, -213, 5 + mouth * 8, 2 + mouth * 23, "#252c38", "#9c7d61", 2);
    for (const sign of [-1, 1]) {
      path(ctx, (c) => {
        c.moveTo(sign * 24, -122); c.bezierCurveTo(sign * 56, -153, sign * 53, -200, sign * 30, -236);
        c.quadraticCurveTo(sign * 23, -246, sign * 22, -225);
        c.lineTo(sign * 31, -201); c.quadraticCurveTo(sign * 41, -166, sign * 17, -141);
      }, "#c3ad85", "#6d6356", 3);
      line(ctx, [[sign * 26, -232], [sign * 25, -216]], "#7f705b", 1.3);
    }
    if (uneasy) line(ctx, [[-8, -212 + Math.sin(time) * 0.3], [8, -212]], "#252c38", 2);
  });
}

function dynamicScream(ctx, state, kin) {
  const p = state.progress, meta = SCENES_META[12];
  const shock = windowEnvelope(p, 0.28, 0.68, 0.045);
  const holdBeats = meta.cameraZoom.holdBeats;
  const bpm = clamp(finite(state.input.audio?.bpm, 108), 40, 240);
  const silenceStart = Math.max(0.40, 0.68 - holdBeats * 60 / bpm / (meta.endT - meta.startT));
  const intensity = windowEnvelope(p, 0.30, silenceStart, 0.018);
  const turn = fract((p - 0.30) / 0.09);
  const birdSpeak = intensity * (turn < 0.54 ? 1 : 0.2);
  const figureSpeak = intensity * (turn > 0.40 ? 1 : 0.16);
  const uneasy = p >= silenceStart && p <= 0.68;
  kin.x -= shock * 16;
  kin.rotation = -shock * 0.065;
  kin.head = { ...kin.head, y: kin.head.y - shock * 7 };
  kin.eyeRoll = shock;
  screamer(ctx, 754, ROAD_Y, shock, figureSpeak, uneasy, state.local);
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "impasto_oil", palette: { wing: "#858a7e", ink: "#252c38", frame: "#d37144", feather: "#dfcca0", accent: "#e4b774" }, lineWidth: 3 });
  inPelicanSpace(ctx, kin, () => {
    if (birdSpeak > 0.05) {
      oval(ctx, kin.head.x + 13, kin.head.y + 15, 9, 3 + birdSpeak * 14, "#252c38", "#d37144", 2);
      poly(ctx, [[kin.beak.x + 13, kin.beak.y + 14], [kin.beak.x + 106, kin.beak.y + 26 * birdSpeak], [kin.beak.x + 25, kin.beak.y + 34 * birdSpeak]], "#d5a66c", "#252c38", 2);
    }
    if (uneasy) {
      line(ctx, [[kin.head.x + 3, kin.head.y - 12], [kin.head.x + 22, kin.head.y - 12]], "#252c38", 2.6);
      line(ctx, [[kin.head.x + 23, kin.head.y + 12], [kin.head.x + 42, kin.head.y + 11]], "#252c38", 1.5);
    }
  });
  if (uneasy) {
    const elapsedBeats = (p - silenceStart) * (meta.endT - meta.startT) * bpm / 60;
    for (let i = 0; i < holdBeats; i++) alpha(ctx, elapsedBeats >= i ? 0.7 : 0.15, () => oval(ctx, 659 + i * 12, 374, 2.2, 2.2, "#e4b774"));
  }
  state.expression = {
    bird: worldPoint(kin, kin.beak.x + 30, kin.beak.y + 20),
    figure: { x: 754 + shock * 17, y: ROAD_Y - 213 },
    birdSpeak, figureSpeak,
  };
}

function vampireShadow(ctx, time) {
  const step = Math.floor(time * 2.4), advance = (step % 8) / 8;
  const x = 602 + advance * 252;
  const base = ROAD_Y - Math.floor((x - 543) / 42) * 35;
  saved(ctx, () => {
    ctx.translate(x, base); ctx.transform(1, -0.12, 0.31, 1, 0, 0);
    path(ctx, (c) => {
      c.moveTo(-34, 0); c.lineTo(-17, -126); c.lineTo(-25, -210);
      c.quadraticCurveTo(-52, -235, -21, -253);
      c.lineTo(-25, -290); c.lineTo(-10, -272);
      c.quadraticCurveTo(13, -288, 25, -266);
      c.lineTo(39, -284); c.lineTo(32, -247);
      c.quadraticCurveTo(48, -224, 21, -208);
      c.lineTo(30, -118); c.lineTo(48, -9); c.lineTo(13, -6);
      c.lineTo(1, -92); c.lineTo(-4, 0); c.closePath();
    }, "#080c11");
    for (const sign of [-1, 1]) {
      const reach = Math.sin(step * 1.7 + sign) * 16;
      line(ctx, [[sign * 20, -198], [sign * 62, -170], [sign * 91, -205 + reach]], "#080c11", 15);
      for (let f = 0; f < 5; f++) {
        const x1 = sign * (85 + f * 4), y1 = -209 + reach;
        line(ctx, [[x1, y1], [x1 + sign * (8 + f * 2), y1 - 22 - f * 4], [x1 + sign * (17 + f * 2), y1 - 27 - f * 3]], "#080c11", 3.3);
      }
    }
  });
}

function dynamoArcs(ctx, state, kin) {
  const hub = worldPoint(kin, kin.wheels.front.x, kin.wheels.front.y);
  const tick = Math.floor(state.time * 18);
  const rng = createSeededRng(`batch2:dynamo:${tick}`);
  const live = 0.42 + state.iron * 0.38 + state.beat * 0.2;
  saved(ctx, () => {
    ctx.shadowColor = "#b5d8de"; ctx.shadowBlur = 8;
    oval(ctx, hub.x, hub.y, 6 + live * 4, 6 + live * 4, "#eff8ec", "#b5d8de", 2);
    for (let branch = 0; branch < 5; branch++) {
      const a = -Math.PI + branch * 0.67 + rng.range(-0.18, 0.18);
      const length = rng.range(40, 104) * live;
      const points = [[hub.x, hub.y]];
      for (let j = 1; j < 7; j++) {
        const along = j / 6 * length, jitter = rng.range(-9, 9);
        points.push([hub.x + Math.cos(a) * along - Math.sin(a) * jitter,
          hub.y + Math.sin(a) * along + Math.cos(a) * jitter]);
      }
      line(ctx, points, "#b5d8de", 2.5);
      line(ctx, points, "#f0f5e9", 0.8);
      for (const split of [2, 4]) {
        const start = points[split], direction = a + rng.range(-1.1, 1.1);
        line(ctx, [start, [start[0] + Math.cos(direction) * 16, start[1] + Math.sin(direction) * 16],
          [start[0] + Math.cos(direction + 0.4) * 31, start[1] + Math.sin(direction + 0.4) * 31]], "#d3e7e2", 1);
      }
    }
    const ground = worldPoint(kin, kin.wheels.front.x, kin.wheelRadius);
    line(ctx, [[hub.x, hub.y], [hub.x - 7, hub.y + 22], [hub.x + 12, hub.y + 38], [ground.x, ground.y]], "#b5d8de", 1);
  });
}

function dynamicNoir(ctx, state, kin) {
  vampireShadow(ctx, state.local);
  const wheel = worldPoint(kin, 112, 0);
  alpha(ctx, 0.12 + state.iron * 0.08, () => {
    poly(ctx, [[wheel.x, wheel.y], [wheel.x + 188, 200], [wheel.x + 323, 226]], "#b5d8de");
  });
  drawPelicanBicycleCanvas2D(ctx, kin, { mode: "noir_silver", lineWidth: 2.2 });
  inPelicanSpace(ctx, kin, () => {
    line(ctx, [[126, -48], [142, -29], [122, -13]], "#bfc4bd", 3);
    oval(ctx, 130, -40, 7, 9, "#454f54", "#cbd2c9", 1.5, -0.6);
    line(ctx, [[130, -40], [121, -11], [112, 0]], "#899b9f", 1.3);
  });
  dynamoArcs(ctx, state, kin);
}

function expressionRing(ctx, origin, age, strength, phase) {
  const r = 16 + age * 116;
  alpha(ctx, strength * (1 - age), () => {
    const points = [];
    for (let i = 0; i <= 72; i++) {
      const a = i * TAU / 72, ripple = Math.sin(a * 7 + phase) * 4;
      points.push([origin.x + Math.cos(a) * (r + ripple), origin.y + Math.sin(a) * (r * 0.7 + ripple)]);
    }
    line(ctx, points, phase % 2 > 1 ? "#e4b774" : "#ba4938", 2.6);
  });
}

function makeParticles(index) {
  const rng = createSeededRng(`batch2:physics:${index}`);
  return Array.from({ length: index === 8 ? 10 : 38 }, () => ({
    phase: rng.next(), x: rng.range(0, 1000), y: rng.range(0, ROAD_Y),
    vx: rng.range(-95, 95), vy: rng.range(25, 100), speed: rng.range(0.20, 0.49),
    size: rng.range(1.1, 3.2), spin: rng.range(-3, 3), hue: rng.int(0, 3),
  }));
}

// Analytic lifetimes give continuous local physics without mutable frame history.
// Seeking, paused redraws and rendering frames out of order produce identical marks.
function microPhysics(ctx, state, kin, index, particles) {
  const t = Math.max(0, state.local);
  if (index === 12) {
    const expression = state.expression;
    if (!expression) return;
    for (let i = 0; i < 4; i++) {
      const age = fract(t * 1.9 + i / 4);
      expressionRing(ctx, expression.bird, age, expression.birdSpeak, t + i);
      expressionRing(ctx, expression.figure, fract(age + 0.2), expression.figureSpeak, t + i + 1);
    }
    return;
  }
  if (index === 13) {
    const frame = Math.floor(state.time * 24);
    const rng = createSeededRng(`batch2:silver-halide:${frame}`);
    alpha(ctx, 0.12, () => {
      for (let i = 0; i < 200; i++) rect(ctx, rng.range(30, 970), rng.range(30, 970), rng.range(0.6, 1.8), rng.range(0.6, 1.8), i % 2 ? "#dce1d5" : "#080c11");
    });
    if (frame % 17 < 3) alpha(ctx, 0.1, () => line(ctx, [[127 + frame % 769, 32], [126 + frame % 769, 968]], "#c5d0c9", 0.6));
    alpha(ctx, 0.018 + (Math.sin(frame * 2.1) + 1) * 0.012, () => rect(ctx, 0, 0, SIZE, SIZE, "#080c11"));
    return;
  }
  particles.forEach((particle, i) => {
    const u = fract(t * particle.speed + particle.phase);
    if (index === 7) {
      const x = fract(particle.x / SIZE + t * 0.014 + Math.sin(t + particle.phase * TAU) * 0.016) * SIZE;
      const y = fract(particle.y / 740 + t * particle.speed * 0.19) * 740;
      alpha(ctx, 0.58 + Math.sin(u * Math.PI) * 0.3, () => oval(ctx, x, y, particle.size * 1.7, particle.size * 0.65, i % 4 ? "#d9b768" : "#d27c87", "#f4d99d", 0.4, t * particle.spin));
    } else if (index === 8) {
      const source = i % 2 ? { x: 211, y: 369 } : worldPoint(kin, kin.beak.x + 73, kin.beak.y + 16);
      const age = u * 2.0, y = source.y + 100 * age * age;
      const x = source.x + particle.vx * age * 0.035;
      if (y < ROAD_Y - 2) {
        oval(ctx, x, y, particle.size * 0.55, particle.size * (1 + age * 0.6), "#434641");
      } else if (y < ROAD_Y + 40) {
        alpha(ctx, (ROAD_Y + 40 - y) / 40, () => oval(ctx, x, ROAD_Y, 4 + (y - ROAD_Y) * 0.4, 1.2, null, "#434641", 0.8));
      }
    } else if (index === 9) {
      const age = u * 3.2;
      const x = 508 + particle.vx * age + Math.sin(age * 3 + particle.phase * 10) * 12;
      const y = 808 - age * (105 + particle.vy) + age * age * 7;
      alpha(ctx, Math.sin(u * Math.PI) * 0.72, () => line(ctx, [[x, y], [x - particle.vx * 0.025, y + 5]], i % 3 ? "#e4b45c" : "#e16b32", particle.size * 0.7));
    } else if (index === 10) {
      const age = u * 1.65;
      const source = i % 3 ? { x: 260 + (particle.x - 500) * 0.29, y: 300 + particle.phase * 85 } : worldPoint(kin, 112, 30);
      const x = source.x + particle.vx * age;
      const y = source.y - particle.vy * age + 112 * age * age;
      if (y <= ROAD_Y + 6) alpha(ctx, Math.sin(Math.PI * u), () => oval(ctx, x, y, particle.size, particle.size * 1.4, "#f6ebcf", "#315982", 0.7, particle.spin));
    } else if (index === 11) {
      const age = u * 1.2, angle = kin.wheelAngle - kin.speed / kin.wheelRadius * age;
      const source = worldPoint(kin, (i % 2 ? 112 : -112) + Math.cos(angle) * kin.wheelRadius, Math.sin(angle) * kin.wheelRadius);
      const x = source.x - (38 + Math.abs(particle.vx)) * age;
      const y = source.y - particle.vy * age + 118 * age * age;
      alpha(ctx, 1 - u, () => line(ctx, [[x, y], [x + Math.cos(particle.spin + angle) * 7, y + Math.sin(particle.spin + angle) * 5]], ["#ead064", "#6f9ebe", "#f4d991", "#4f78ab"][particle.hue], particle.size * 1.4));
    }
  });
}

function frameState(input, meta) {
  const duration = meta.endT - meta.startT;
  const fallbackLocal = finite(input.sceneLocalT, finite(input.sceneProgress) * duration);
  let time = finite(input.realT, finite(input.canonicalT, meta.startT + fallbackLocal));
  let local = finite(input.sceneLocalT, time - meta.startT);
  let progress = clamp(finite(input.sceneProgress, local / duration));
  if (meta.index === 9) {
    time = quantizeTime8fps(time);
    local = time - meta.startT;
    progress = clamp(local / duration);
  }
  // Supplied audio envelopes remain responsive except on the strict 8 fps screen.
  const beat = meta.index === 9 ? Math.max(0, Math.sin(time * TAU * 1.8)) ** 8 : clamp(finite(input.beatPulse));
  const iron = meta.index === 9 ? beat : clamp(finite(input.ironPulse));
  return { input, time, local, progress, beat, iron };
}

function sceneKinematics(state, meta) {
  const options = { roadY: ROAD_Y };
  if (meta.index === 8) {
    options.scale = 0.70; options.x = 552;
    options.stopWindows = [{ start: meta.startT + 1.6, end: meta.endT - 1.2, fade: 0.2 }];
  } else if (meta.index === 9) {
    options.quantize8fps = true; options.scale = 0.9;
  } else if (meta.index === 12) {
    const duration = meta.endT - meta.startT;
    options.stopWindows = [{ start: meta.startT + duration * 0.28, end: meta.startT + duration * 0.68, fade: 0.12 }];
    options.scale = 0.82;
  }
  const kin = groundKin(computePelicanKinematics(state.time, meta.index, options));
  if (meta.index === 12) {
    kin.x = state.progress < 0.28 ? mix(390, 510, ease(state.progress / 0.28)) :
      state.progress <= 0.68 ? 510 : mix(510, 647, ease((state.progress - 0.68) / 0.32));
  }
  return kin;
}

const BACKDROPS = [bakeMughal, bakeBada, bakeWayang, bakeUkiyoe, bakeStarry, bakeScream, bakeNoir];
const DYNAMICS = [dynamicMughal, dynamicBada, dynamicWayang, dynamicUkiyoe, dynamicStarry, dynamicScream, dynamicNoir];

function createScene(sceneIndex) {
  const meta = SCENES_META[sceneIndex];
  const backdrop = BACKDROPS[sceneIndex - 7];
  const dynamic = DYNAMICS[sceneIndex - 7];
  const particles = makeParticles(sceneIndex);
  let lazyCanvas = null, attemptedCache = false;
  const scene = {
    sceneIndex,
    id: meta.id,
    meta,
    bake2D(ctx, sceneDef = meta) {
      // sceneDef is accepted by the shared baker; all composition uses canonical metadata.
      void sceneDef;
      saved(ctx, () => { ctx.lineCap = "round"; ctx.lineJoin = "round"; backdrop(ctx); });
    },
    bakeBrush(p, brush, sceneDef = meta) {
      bakePigment(p, brush, sceneDef, sceneIndex);
    },
    drawDynamic(ctx, sceneCtx = {}) {
      const state = frameState(sceneCtx, meta);
      const kin = sceneKinematics(state, meta);
      saved(ctx, () => {
        const camera = meta.cameraZoom;
        const u = ease((state.progress - finite(camera.startProgress)) /
          Math.max(1e-6, finite(camera.endProgress, 1) - finite(camera.startProgress)));
        const zoom = mix(camera.from, camera.to, u);
        ctx.translate(camera.focusX, camera.focusY);
        ctx.scale(zoom, zoom);
        ctx.translate(-camera.focusX, -camera.focusY);
        if (sceneIndex === 13) {
          const frame = Math.floor(state.time * 24);
          ctx.translate(Math.sin(frame * 2.399) * 1.05, Math.sin(frame * 1.73) * 0.8);
        }
        if (!sceneCtx.bakedCanvas && !attemptedCache) {
          attemptedCache = true;
          try {
            const doc = ctx.canvas?.ownerDocument ?? globalThis.document;
            const candidate = typeof globalThis.OffscreenCanvas === "function" ?
              new globalThis.OffscreenCanvas(SIZE, SIZE) : doc?.createElement?.("canvas");
            if (candidate) {
              candidate.width = SIZE; candidate.height = SIZE;
              const bakeCtx = candidate.getContext?.("2d");
              if (bakeCtx && typeof bakeCtx.fillRect === "function") {
                scene.bake2D(bakeCtx, meta);
                lazyCanvas = candidate;
              }
            }
          } catch { lazyCanvas = null; }
        }
        const baked = sceneCtx.bakedCanvas ?? lazyCanvas;
        let composed = false;
        if (baked && typeof ctx.drawImage === "function") {
          try { ctx.drawImage(baked, 0, 0, SIZE, SIZE); composed = true; } catch { /* mock image source */ }
        }
        if (!composed) scene.bake2D(ctx, meta);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        dynamic(ctx, state, kin);
        microPhysics(ctx, state, kin, sceneIndex, particles);
      });
    },
  };
  return scene;
}

export const SCENES_BATCH_2 = Array.from({ length: 7 }, (_, offset) => createScene(offset + 7));
