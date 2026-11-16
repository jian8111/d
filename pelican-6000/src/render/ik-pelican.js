// 署名: PRO2H(hadcockulloa@gmail.com)
import { SCENES_META } from "../data/scenes-meta.js";

const TAU = Math.PI * 2;
const EPSILON = 1e-4;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? clamp(x, -1e12, 1e12) : fallback;
const point = (x, y) => ({ x, y });
const smoothstep = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

/** Analytical IK, in the same coordinates as the supplied hip and pedal.
 * bendSign selects the side of the directed hip-to-pedal line. Zero-length
 * bones get a tiny positive length, including the coincident-target case.
 */
export function solveTwoBoneIK(rootX, rootY, targetX, targetY, L1, L2, bendSign = 1) {
  const rx = finite(rootX), ry = finite(rootY);
  const tx = finite(targetX, rx), ty = finite(targetY, ry);
  const a = Math.max(EPSILON, Math.abs(finite(L1, 1)));
  const b = Math.max(EPSILON, Math.abs(finite(L2, 1)));
  const dx = tx - rx, dy = ty - ry;
  const requested = Math.hypot(dx, dy);
  const lower = Math.abs(a - b) + EPSILON;
  const upper = Math.max(lower, a + b - EPSILON);
  const reach = clamp(requested, lower, upper);
  const heading = requested > 0 ? Math.atan2(dy, dx) : 0;
  // This form of the cosine rule avoids subtracting two nearly equal squares.
  const cosine = clamp((reach / a + (a - b) / reach * (1 + b / a)) / 2, -1, 1);
  const angle = heading + (bendSign < 0 ? -1 : 1) * Math.acos(cosine);
  return {
    jointX: rx + Math.cos(angle) * a,
    jointY: ry + Math.sin(angle) * a,
    endX: rx + Math.cos(heading) * reach,
    endY: ry + Math.sin(heading) * reach,
    clamped: requested < lower || requested > upper,
  };
}

export function quantizeTime8fps(t) {
  return Math.floor(finite(t) * 8 + 1e-9) / 8;
}

// Antiderivative of smoothstep, continued linearly past its right endpoint.
function smoothIntegral(u) {
  if (u <= 0) return 0;
  if (u >= 1) return u - 0.5;
  return u * u * u * (1 - u / 2);
}

function defaultStops(options) {
  const beat = 60 / Math.max(1, finite(options.bpm, 108));
  return [
    { start: SCENES_META[1].startT + 1.2, end: SCENES_META[1].endT - 1.1, fade: 0.45 },
    { start: SCENES_META[12].startT + 2.1, end: SCENES_META[12].startT + 2.1 + 3 * beat, fade: 0.22 },
    { start: SCENES_META[18].startT + 3, end: SCENES_META[18].startT + 4.6, fade: 0.18 },
  ];
}

function ridingClock(t, windows) {
  // Integrate a product of stop envelopes exactly (a cubic on each segment).
  // This also supports overlapping custom windows without negative speed.
  const stops = windows.map((w) => ({
    start: Math.max(0, finite(w.start)),
    end: Math.max(0, finite(w.end)),
    fade: Math.max(EPSILON, finite(w.fade, 0.25)),
  })).filter((w) => w.end >= w.start);
  const boundaries = [0, t];
  for (const w of stops) {
    for (const edge of [w.start - w.fade, w.start, w.end, w.end + w.fade]) {
      if (edge > 0 && edge < t) boundaries.push(edge);
    }
  }
  boundaries.sort((a, b) => a - b);
  const velocity = (time) => {
    let multiplier = 1;
    for (const w of stops) {
      const hold = smoothstep((time - w.start + w.fade) / w.fade) - smoothstep((time - w.end) / w.fade);
      multiplier *= 1 - hold;
    }
    return clamp(multiplier, 0, 1);
  };
  // Default windows never overlap: their integral is analytic and inexpensive.
  const sorted = [...stops].sort((a, b) => a.start - a.fade - b.start + b.fade);
  const overlapping = sorted.some((w, i) => i && w.start - w.fade < sorted[i - 1].end + sorted[i - 1].fade);
  let elapsed = t;
  if (!overlapping) {
    for (const w of stops) {
      const integral = (time) => w.fade * (
        smoothIntegral((time - w.start + w.fade) / w.fade) - smoothIntegral((time - w.end) / w.fade)
      );
      elapsed -= integral(t) - integral(0);
    }
  } else {
    elapsed = 0;
    // Eight-point Gauss-Legendre integrates a product of three cubics exactly.
    const nodes = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
    const weights = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
    for (let i = 1; i < boundaries.length; i++) {
      const half = (boundaries[i] - boundaries[i - 1]) / 2;
      const middle = (boundaries[i] + boundaries[i - 1]) / 2;
      for (let j = 0; j < nodes.length; j++) {
        elapsed += half * weights[j] * (velocity(middle - half * nodes[j]) + velocity(middle + half * nodes[j]));
      }
    }
  }
  return { elapsed: Math.max(0, elapsed), multiplier: velocity(t) };
}

/** t is absolute MV seconds; sceneIndex is zero based, matching SCENES_META.
 * Use timeIsLocal for scene-relative previews. Geometry is bicycle-local;
 * (x,y), rotation and scale place it in a 1000 x 1000 frame. worldX/distance
 * describe continuous travel while the default camera tracks the cyclist.
 */
export function computePelicanKinematics(t, sceneIndex, options = {}) {
  const index = clamp(Math.trunc(finite(sceneIndex)), 0, SCENES_META.length - 1);
  const scene = SCENES_META[index];
  const suppliedTime = finite(t) + (options.timeIsLocal ? scene.startT : 0);
  let time = Math.max(0, finite(options.freezeAt, suppliedTime));
  if (index === 9 || options.quantize8fps) time = quantizeTime8fps(time);
  const localTime = time - scene.startT;
  const progress = clamp(localTime / (scene.endT - scene.startT), 0, 1);
  const clock = ridingClock(time, options.stopWindows ?? defaultStops(options));
  const nominalSpeed = Math.max(0, finite(options.speed, 72));
  const distance = finite(options.distanceOffset) + nominalSpeed * clock.elapsed;
  const speed = nominalSpeed * clock.multiplier;
  const wheelRadius = Math.max(1, finite(options.wheelRadius, 70));
  const crankRadius = Math.max(1, finite(options.crankRadius, 24));
  const crankAngle = distance / (wheelRadius * Math.max(0.1, finite(options.gearRatio, 2.6))) + finite(options.crankPhase);
  const wheelAngle = distance / wheelRadius;
  const motionTime = clock.elapsed;
  const bob = Math.sin(crankAngle * 2) * 2.8;
  let roadY = finite(options.roadY, 680);
  let rotation = finite(options.rotation);
  let jumpHeight = 0;
  if (index === 5) {
    const height = Math.max(0, finite(options.bridgeHeight, 106));
    roadY -= height * Math.sin(Math.PI * progress) ** 2;
    const rise = -height * Math.PI * Math.sin(TAU * progress) / (scene.endT - scene.startT);
    rotation += Math.atan2(rise, Math.max(1, nominalSpeed)) * 0.6;
  }
  if (index === 15) {
    const u = clamp((progress - 0.22) / 0.56, 0, 1);
    jumpHeight = Math.max(0, finite(options.jumpHeight, 146)) * Math.sin(Math.PI * u) ** 2;
    roadY -= jumpHeight;
    rotation += -Math.sin(TAU * u) * 0.14;
  }
  const crank = point(-5, -4);
  const leftPedal = point(crank.x + Math.cos(crankAngle) * crankRadius, crank.y + Math.sin(crankAngle) * crankRadius);
  const rightPedal = point(crank.x - Math.cos(crankAngle) * crankRadius, crank.y - Math.sin(crankAngle) * crankRadius);
  const hip = point(-32, -87 + bob);
  const thigh = Math.max(1, finite(options.thigh, 57));
  const shin = Math.max(1, finite(options.shin, 58));
  const leg = (pedal, side) => {
    const root = point(hip.x + (side === "right" ? -6 : 0), hip.y);
    const solved = solveTwoBoneIK(root.x, root.y, pedal.x, pedal.y, thigh, shin, -1);
    return {
      side, hip: root, knee: point(solved.jointX, solved.jointY),
      ankle: point(solved.endX, solved.endY), pedal, clamped: solved.clamped, thigh, shin,
    };
  };
  const egyptSalute = index === 1 ? 1 - clock.multiplier : 0;
  const headBob = -bob * 0.65 + Math.sin(motionTime * 2.4) * 1.8 - egyptSalute * 7;
  const head = { x: 58, y: -241 + headBob, radiusX: 29, radiusY: 25, angle: Math.sin(crankAngle) * 0.025 };
  const beakAngle = 0.065 + Math.sin(crankAngle - 0.6) * 0.035 - egyptSalute * 0.09;
  const eyeRoll = index === 8 ? smoothstep(Math.sin(motionTime * 1.6) * 0.8 + 0.5) : 0;
  const ribbon = [];
  if (index === 3 || options.ribbon) {
    for (let i = 0; i < 8; i++) {
      ribbon.push(point(15 - i * 29, -190 + headBob + Math.sin(motionTime * 4.5 - i * 0.85) * i * 3.3));
    }
  }
  const x = finite(options.x, 500) + (options.trackCamera === false ? distance : 68 * Math.sin(distance / 520));
  return {
    time, sceneTime: localTime, sceneIndex: index, sceneId: index + 1, progress,
    quantize8fps: quantizeTime8fps, quantizedTime: quantizeTime8fps(time),
    motionTime, distance, worldX: distance, speed, stopped: clock.multiplier < 1e-6,
    x, y: roadY - wheelRadius, roadY, rotation, scale: Math.max(0.01, finite(options.scale, 1)),
    wheelAngle, crankAngle, crankRadius, wheelRadius, crank,
    wheels: { rear: point(-112, 0), front: point(112, 0), radius: wheelRadius },
    frame: { seat: point(-42, -92), headTube: point(65, -92), handlebar: point(105, -112) },
    pedals: { left: leftPedal, right: rightPedal }, hip,
    legs: { left: leg(leftPedal, "left"), right: leg(rightPedal, "right") },
    body: { x: -49, y: -149 + bob, radiusX: 69, radiusY: 42, angle: -0.1 },
    neck: [point(-22, -157 + bob), point(8, -175 - bob), point(11, -222 + headBob), point(43, -241 + headBob)],
    head, beak: { x: head.x + 19, y: head.y - 1, length: 128, angle: beakAngle },
    pouch: { droop: 31 + Math.sin(crankAngle - 0.9) * 6, sway: Math.sin(crankAngle * 2 - 0.4) * 4 },
    ribbon, eyeRoll, egyptSalute, jumpHeight,
  };
}

const PALETTES = {
  museum_white: { ink: "#384348", feather: "#fffdf4", wing: "#e4e8e5", beak: "#dfac4a", pouch: "#edc77c", frame: "#45666d", metal: "#b5c4c3", feet: "#ca8b3c", accent: "#ba963f" },
  silhouette: { ink: "#11141a", feather: "#11141a", wing: "#11141a", beak: "#11141a", pouch: "#11141a", frame: "#11141a", metal: "#11141a", feet: "#11141a", accent: "#11141a" },
  ochre_cave: { ink: "#713d28", feather: "#bd7447", wing: "#9b5234", beak: "#d49454", pouch: "#b9663c", frame: "#b9663c", metal: "#e4c68b", feet: "#d49454", accent: "#e4c68b" },
  egypt_profile: { ink: "#423020", feather: "#f4e7bd", wing: "#268b9d", beak: "#c99e36", pouch: "#dba953", frame: "#b8462c", metal: "#c99e36", feet: "#b8462c", accent: "#268b9d" },
  han_rubbing: { ink: "#e1d8c0", feather: "#dad1b9", wing: "#747770", beak: "#e1d8c0", pouch: "#a8a99a", frame: "#ddd3bd", metal: "#a8a99a", feet: "#ddd3bd", accent: "#bc3e2f" },
  tang_line: { ink: "#665144", feather: "#f5ead3", wing: "#e5d9c0", beak: "#c09a5f", pouch: "#e8cda1", frame: "#665144", metal: "#a99a80", feet: "#aa744a", accent: "#bb4435" },
  ink_minimal: { ink: "#232723", feather: "#f1ecdf", wing: "#434641", beak: "#b3a77f", pouch: "#e3d9bd", frame: "#434641", metal: "#777c70", feet: "#434641", accent: "#ad3d30" },
  wayang_puppet: { ink: "#160f0b", feather: "#21150d", wing: "#392717", beak: "#21150d", pouch: "#21150d", frame: "#21150d", metal: "#d8a34c", feet: "#21150d", accent: "#d8a34c" },
  ukiyoe_woodblock: { ink: "#203e58", feather: "#f3e8c9", wing: "#718e9c", beak: "#c69b46", pouch: "#ddbb78", frame: "#315982", metal: "#8ea19c", feet: "#b75042", accent: "#b75042" },
  impasto_oil: { ink: "#253e59", feather: "#fff0b1", wing: "#7d9aa3", beak: "#e9ac40", pouch: "#d68a43", frame: "#e2c05d", metal: "#7aa3b9", feet: "#d99b45", accent: "#f1d575" },
  noir_silver: { ink: "#252d34", feather: "#dbe1da", wing: "#87928f", beak: "#bfc4bd", pouch: "#969f9b", frame: "#bfc4bd", metal: "#e1e8dd", feet: "#a4b2ad", accent: "#b5d8de" },
  oscilloscope: { ink: "#7efcb1", feather: "#7efcb1", wing: "#7efcb1", beak: "#7efcb1", pouch: "#7efcb1", frame: "#7efcb1", metal: "#4cbd7a", feet: "#7efcb1", accent: "#d4ffd4" },
  pixel_8bit: { ink: "#0d1230", feather: "#fff5d5", wing: "#78c7ee", beak: "#f5cb50", pouch: "#e99545", frame: "#f05667", metal: "#78c7ee", feet: "#f5cb50", accent: "#f5cb50" },
  gif_256: { ink: "#25374b", feather: "#ffffff", wing: "#b6d4e0", beak: "#ffcc33", pouch: "#ff9933", frame: "#477ab6", metal: "#b6d4e0", feet: "#ff9933", accent: "#7bbc67" },
  vaporwave: { ink: "#67ded7", feather: "#f7d9ee", wing: "#bd8bcb", beak: "#f6bbd5", pouch: "#df8dcb", frame: "#ff71cb", metal: "#67ded7", feet: "#ff71cb", accent: "#67ded7" },
  code_svg: { ink: "#8ad9d0", feather: "#8ad9d0", wing: "#8ad9d0", beak: "#e7c47b", pouch: "#8ad9d0", frame: "#8ad9d0", metal: "#659ba0", feet: "#e7c47b", accent: "#e7c47b" },
};

function line(ctx, points, color, width = 2, close = false) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function paint(ctx, fill, stroke, width = 2, rule = "nonzero") {
  if (fill) { ctx.fillStyle = fill; ctx.fill(rule); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  paint(ctx, fill, stroke, width);
}

function drawLeg(ctx, leg, palette, width, wire) {
  line(ctx, [leg.hip, leg.knee, leg.ankle], palette.feet, width);
  if (!wire) ellipse(ctx, leg.knee.x, leg.knee.y, width / 2, width / 2, palette.feet, null);
  line(ctx, [point(leg.ankle.x - 9, leg.ankle.y), point(leg.ankle.x + 12, leg.ankle.y)], palette.feet, width * 0.65);
}

function drawPixelPelican(ctx, k, colors, grid) {
  const plot = (x, y, c, size = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x / grid) * grid, Math.round(y / grid) * grid, grid * size, grid * size);
  };
  const segment = (a, b, c, size = 1) => {
    const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / grid);
    for (let i = 0; i <= steps; i++) {
      const u = steps ? i / steps : 0;
      plot(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, c, size);
    }
  };
  const oval = (x, y, rx, ry, c) => {
    for (let yy = -ry; yy <= ry; yy += grid) {
      const half = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2));
      for (let xx = -half; xx <= half; xx += grid) plot(x + xx, y + yy, c);
    }
  };
  for (const wheel of [k.wheels.rear, k.wheels.front]) {
    for (let i = 0; i < 48; i++) {
      const a = i * TAU / 48, b = (i + 1) * TAU / 48;
      segment(point(wheel.x + Math.cos(a) * k.wheelRadius, Math.sin(a) * k.wheelRadius), point(wheel.x + Math.cos(b) * k.wheelRadius, Math.sin(b) * k.wheelRadius), colors.ink);
    }
    for (let i = 0; i < 8; i++) {
      const a = k.wheelAngle + i * TAU / 8;
      segment(wheel, point(wheel.x + Math.cos(a) * (k.wheelRadius - 4), Math.sin(a) * (k.wheelRadius - 4)), colors.metal);
    }
  }
  const { rear, front } = k.wheels;
  for (const chain of [[rear, k.frame.seat, k.crank, rear], [k.crank, k.frame.headTube, k.frame.seat], [k.crank, front, k.frame.headTube, k.frame.handlebar]]) {
    for (let i = 1; i < chain.length; i++) segment(chain[i - 1], chain[i], colors.frame);
  }
  for (const leg of [k.legs.right, k.legs.left]) {
    segment(leg.hip, leg.knee, colors.feet);
    segment(leg.knee, leg.ankle, colors.feet);
    segment(point(leg.ankle.x - 7, leg.ankle.y), point(leg.ankle.x + 10, leg.ankle.y), colors.feet);
  }
  oval(k.body.x, k.body.y, 70, 42, colors.ink);
  oval(k.body.x, k.body.y - 3, 66, 37, colors.feather);
  segment(point(-20, -157), point(43, k.head.y + 4), colors.feather, 3);
  oval(k.head.x, k.head.y, 29, 24, colors.feather);
  oval(k.body.x - 6, k.body.y + 3, 44, 19, colors.wing);
  for (let i = 0; i < k.beak.length; i += grid) {
    const angle = k.beak.angle;
    const bx = k.beak.x + Math.cos(angle) * i, by = k.beak.y + Math.sin(angle) * i;
    segment(point(bx, by), point(bx, by + (1 - i / k.beak.length) * 19), colors.beak);
  }
  oval(k.beak.x + 31, k.beak.y + 21, 31, 13, colors.pouch);
  plot(k.head.x + 10, k.head.y - 5, colors.ink);
}

/** Draws only the cyclist, leaving the caller's background and state intact.
 * style supports mode, palette overrides, x/y, scale, facing (-1 or 1), alpha,
 * lineWidth and spokes. All vector detail follows the supplied articulated pose.
 */
export function drawPelicanBicycleCanvas2D(ctx, kinematics, style = {}) {
  if (!ctx || !kinematics) return;
  const k = kinematics;
  const mode = Object.hasOwn(PALETTES, style.mode) ? style.mode : "museum_white";
  const colors = { ...PALETTES[mode], ...style.palette };
  const wire = mode === "oscilloscope" || mode === "code_svg";
  const shadow = mode === "silhouette";
  const fine = mode === "tang_line" || mode === "ink_minimal";
  const width = Math.max(0.5, finite(style.lineWidth, fine ? 1.35 : wire ? 1.7 : 2.6));
  ctx.save();
  try {
    ctx.translate(finite(style.x, k.x), finite(style.y, k.y));
    ctx.rotate(k.rotation);
    const scale = k.scale * Math.max(0.01, finite(style.scale, 1));
    ctx.scale(scale * (style.facing === -1 ? -1 : 1), scale);
    ctx.globalAlpha *= clamp(finite(style.alpha, 1), 0, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (mode === "pixel_8bit" || mode === "gif_256") {
      ctx.imageSmoothingEnabled = false;
      drawPixelPelican(ctx, k, colors, mode === "pixel_8bit" ? 5 : 3);
      return;
    }
    if (mode === "oscilloscope" || mode === "vaporwave") {
      ctx.shadowColor = colors.ink;
      ctx.shadowBlur = mode === "oscilloscope" ? 7 : 5;
    }
    if (mode === "ochre_cave") ctx.setLineDash([9, 2, 3, 1]);
    const { rear, front } = k.wheels;
    const spokes = clamp(Math.trunc(finite(style.spokes, mode === "ink_minimal" ? 8 : 20)), 3, 64);
    for (const wheel of [rear, front]) {
      ellipse(ctx, wheel.x, wheel.y, k.wheelRadius, k.wheelRadius, null, colors.ink, width + 2.4);
      ellipse(ctx, wheel.x, wheel.y, k.wheelRadius - 5, k.wheelRadius - 5, null, colors.metal, width * 0.6);
      for (let i = 0; i < spokes; i++) {
        const a = k.wheelAngle + TAU * i / spokes;
        line(ctx, [wheel, point(wheel.x + Math.cos(a) * (k.wheelRadius - 6), wheel.y + Math.sin(a) * (k.wheelRadius - 6))], shadow ? colors.ink : colors.metal, width * 0.45);
      }
      ellipse(ctx, wheel.x, wheel.y, 5, 5, wire ? null : colors.accent, colors.ink, width * 0.6);
    }
    drawLeg(ctx, k.legs.right, { ...colors, feet: shadow ? colors.ink : colors.wing }, wire ? width : 6, wire);
    for (const frameLine of [[rear, k.frame.seat, k.crank, rear], [k.crank, k.frame.headTube, k.frame.seat], [k.crank, front, k.frame.headTube, k.frame.handlebar]]) {
      line(ctx, frameLine, colors.frame, wire ? width : width + 1.8);
    }
    line(ctx, [point(-58, -94), point(-29, -94)], colors.ink, width + 4);
    line(ctx, [k.frame.handlebar, point(118, -111), point(123, -101)], colors.ink, width + 1);
    // Visible chainring, crank arms, platform pedals and brass handlebar bell.
    ellipse(ctx, k.crank.x, k.crank.y, 13, 13, null, colors.metal, width);
    line(ctx, [k.pedals.right, k.crank, k.pedals.left], colors.ink, width);
    for (const pedal of Object.values(k.pedals)) line(ctx, [point(pedal.x - 10, pedal.y + 3), point(pedal.x + 10, pedal.y + 3)], colors.ink, width + 1);
    ellipse(ctx, 101, -120, 7, 5, wire ? null : colors.accent, colors.ink, width * 0.6);
    if (k.ribbon.length) {
      line(ctx, k.ribbon, shadow ? colors.ink : "#b62e3c", 7);
      line(ctx, k.ribbon.map((v, i) => point(v.x + 2, v.y + 4 + i)), shadow ? colors.ink : "#df6859", 2);
    }
    // Tail feathers form a fan rather than a generic oval bird silhouette.
    ctx.beginPath();
    ctx.moveTo(-94, k.body.y - 15);
    ctx.lineTo(-153, k.body.y - 28);
    ctx.lineTo(-131, k.body.y - 3);
    ctx.lineTo(-148, k.body.y + 4);
    ctx.lineTo(-99, k.body.y + 19);
    ctx.closePath();
    paint(ctx, wire ? null : colors.feather, colors.ink, width);
    // Curved, counter-bobbing neck, drawn behind the body and head.
    const n = k.neck;
    ctx.beginPath();
    ctx.moveTo(n[0].x - 13, n[0].y);
    ctx.bezierCurveTo(n[1].x - 18, n[1].y - 7, n[2].x - 11, n[2].y, n[3].x - 8, n[3].y - 5);
    ctx.lineTo(n[3].x + 15, n[3].y + 10);
    ctx.bezierCurveTo(n[2].x + 17, n[2].y + 18, n[1].x + 24, n[1].y + 13, n[0].x + 18, n[0].y + 17);
    ctx.closePath();
    paint(ctx, wire ? null : colors.feather, colors.ink, width);
    ctx.beginPath();
    ctx.ellipse(k.body.x, k.body.y, k.body.radiusX, k.body.radiusY, k.body.angle, 0, TAU);
    if (mode === "wayang_puppet") {
      // Even-odd holes reveal the existing background without erasing it.
      for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) {
        const x = k.body.x - 43 + col * 13, y = k.body.y - 17 + row * 16;
        ctx.moveTo(x + 3.5, y);
        ctx.arc(x, y, 3.5, 0, TAU);
      }
    }
    paint(ctx, wire ? null : colors.feather, colors.ink, width, "evenodd");
    if (!shadow && mode !== "wayang_puppet") {
      ctx.beginPath();
      ctx.moveTo(-96, k.body.y - 12);
      ctx.bezierCurveTo(-61, k.body.y - 31, -27, k.body.y - 15, -13, k.body.y + 7);
      ctx.bezierCurveTo(-48, k.body.y + 37, -76, k.body.y + 23, -96, k.body.y - 12);
      paint(ctx, wire ? null : colors.wing, colors.ink, width * 0.7);
      for (let i = 0; i < 5; i++) {
        line(ctx, [point(-86 + i * 12, k.body.y + 1), point(-71 + i * 10, k.body.y + 17)], colors.ink, width * 0.55);
      }
    }
    if (["impasto_oil", "han_rubbing", "ukiyoe_woodblock", "egypt_profile"].includes(mode)) {
      ctx.save();
      try {
        ctx.beginPath();
        ctx.ellipse(k.body.x, k.body.y, 66, 39, k.body.angle, 0, TAU);
        ctx.clip();
        for (let row = 0; row < 6; row++) for (let col = 0; col < 11; col++) {
          const x = -115 + col * 13 + (row % 2) * 4;
          const y = k.body.y - 32 + row * 13;
          line(ctx, [point(x, y), point(x + 7, y + (mode === "impasto_oil" ? -5 : 4))], (row + col) % 3 ? colors.wing : colors.feather, mode === "impasto_oil" ? 4 : 1.5);
        }
      } finally { ctx.restore(); }
    }
    drawLeg(ctx, k.legs.left, colors, wire ? width : 6, wire);
    ellipse(ctx, k.head.x, k.head.y, k.head.radiusX, k.head.radiusY, wire ? null : colors.feather, colors.ink, width, k.head.angle);
    // Crest tufts make the long-beaked profile legible at small sizes.
    line(ctx, [point(37, k.head.y - 18), point(29, k.head.y - 35), point(44, k.head.y - 26), point(42, k.head.y - 37), point(55, k.head.y - 24)], colors.ink, width);
    ctx.save();
    try {
      ctx.translate(k.beak.x, k.beak.y);
      ctx.rotate(k.beak.angle);
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.quadraticCurveTo(30 + k.pouch.sway, 25 + k.pouch.droop, 75, 24);
      ctx.lineTo(k.beak.length - 2, 8);
      ctx.lineTo(0, 0);
      ctx.closePath();
      paint(ctx, wire ? null : colors.pouch, colors.ink, width * 0.8);
      ctx.beginPath();
      ctx.moveTo(-2, -7);
      ctx.quadraticCurveTo(49, -7, k.beak.length, 5);
      ctx.quadraticCurveTo(124, 14, k.beak.length - 10, 11);
      ctx.lineTo(0, 10);
      ctx.closePath();
      paint(ctx, wire ? null : colors.beak, colors.ink, width);
      line(ctx, [point(9, 6), point(k.beak.length - 9, 7)], colors.ink, width * 0.5);
    } finally { ctx.restore(); }
    if (!shadow) {
      ellipse(ctx, k.head.x + 11, k.head.y - 6, 5.5, 6.5, wire ? null : "#fffdf2", colors.ink, width * 0.6);
      const pupilY = k.head.y - 5 - k.eyeRoll * 5;
      ellipse(ctx, k.head.x + 12, pupilY, 2.1, 2.7, colors.ink, null);
      if (mode === "egypt_profile" || mode === "ink_minimal") line(ctx, [point(k.head.x + 2, k.head.y - 13), point(k.head.x + 23, k.head.y - 14)], colors.ink, width + 0.5);
    }
    if (mode === "wayang_puppet") {
      for (let i = 0; i < 9; i++) ellipse(ctx, -96 + i * 12, k.body.y + 25, 2.5, 2.5, colors.accent, null);
      for (let i = 0; i < 6; i++) ellipse(ctx, k.beak.x + 14 + i * 13, k.beak.y + 7, 2, 2, colors.accent, null);
      line(ctx, [point(k.body.x, k.body.y + 30), point(k.body.x, 87)], colors.ink, 2);
    }
    if (mode === "code_svg") {
      ctx.setLineDash([3, 5]);
      line(ctx, n, colors.metal, 0.75);
      for (const v of [...n, k.legs.left.knee, k.legs.right.knee, k.crank]) {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(v.x - 2.5, v.y - 2.5, 5, 5);
      }
    }
  } finally { ctx.restore(); }
}

/** Closed, single-stroke Fourier source; returns {x,y} samples in [0,1]^2.
 * One uniform scale preserves aspect ratio. The last sample is not duplicated;
 * the wrap back to sample zero is part of the arc-length resampling.
 */
export function getPelicanOutlinePoints(numPoints = 128) {
  const count = clamp(Math.trunc(finite(numPoints, 128)), 3, 16384);
  const contour = [];
  const add = (x, y) => contour.push(point(x, y));
  const arc = (x, y, radius, start, end, steps = 80) => {
    for (let i = 0; i <= steps; i++) {
      const a = start + (end - start) * i / steps;
      add(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
  };
  const curve = (cx1, cy1, cx2, cy2, x, y) => {
    const previous = contour[contour.length - 1];
    for (let i = 1; i <= 24; i++) {
      const u = i / 24, v = 1 - u;
      add(v ** 3 * previous.x + 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u ** 3 * x,
        v ** 3 * previous.y + 3 * v * v * u * cy1 + 3 * v * u * u * cy2 + u ** 3 * y);
    }
  };
  arc(-112, 0, 70, Math.PI / 2, Math.PI / 2 + TAU);
  add(-112, 0); add(-42, -92); add(-5, -4); add(-112, 0);
  add(-5, -4); add(65, -92); add(-42, -92); add(-42, -110);
  // Belly -> upright neck -> loose throat pouch -> long hooked bill.
  curve(-19, -102, 5, -127, 7, -156);
  curve(31, -174, 28, -209, 48, -221);
  curve(72, -184, 106, -174, 152, -211);
  add(202, -222); add(207, -229);
  curve(165, -241, 108, -247, 83, -248);
  curve(75, -270, 56, -274, 46, -267);
  add(29, -278); add(36, -262); add(21, -270); add(29, -251);
  curve(10, -239, 17, -199, -15, -181);
  curve(-47, -201, -81, -195, -104, -173);
  add(-153, -179); add(-133, -157); add(-149, -149); add(-111, -137);
  curve(-94, -112, -68, -107, -42, -110);
  // Return through the bicycle's top tube and fork to trace the front wheel.
  add(-42, -92); add(65, -92); add(105, -112); add(122, -110);
  add(105, -112); add(112, 0); add(112, -70);
  arc(112, 0, 70, -Math.PI / 2, -Math.PI / 2 + TAU);
  add(112, 0); add(-5, -4); add(-112, 0);
  contour.push({ ...contour[0] });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const lengths = [0];
  for (let i = 0; i < contour.length; i++) {
    const v = contour[i];
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    if (i) lengths.push(lengths[i - 1] + Math.hypot(v.x - contour[i - 1].x, v.y - contour[i - 1].y));
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const offsetX = (span - maxX + minX) / 2, offsetY = (span - maxY + minY) / 2;
  const total = lengths[lengths.length - 1];
  const result = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = total * i / count;
    while (segment < lengths.length - 1 && lengths[segment] < distance) segment++;
    const a = contour[segment - 1], b = contour[segment];
    const u = (distance - lengths[segment - 1]) / Math.max(Number.EPSILON, lengths[segment] - lengths[segment - 1]);
    result.push(point((a.x + (b.x - a.x) * u - minX + offsetX) / span,
      (a.y + (b.y - a.y) * u - minY + offsetY) / span));
  }
  return result;
}
