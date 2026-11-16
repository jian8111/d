// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG, SCENES_META } from '../data/scenes-meta.js';
import { createSeededRng } from './prng.js';

const C = MV_TIMELINE_CONFIG;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const finite = n => Number.isFinite(n) ? n : 0;

function preceding(values, value) {
  let lo = 0, hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function createTimeWarpEngine(knots) {
  if (!Array.isArray(knots) || knots.length < 2) throw new RangeError('At least two knots required');
  const points = knots.map(k => ({ real: k.real, canonical: k.canonical }));
  const xs = points.map(k => k.real), ys = points.map(k => k.canonical);
  const slopes = [], tangents = [];
  for (let i = 0; i < points.length; i++) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) throw new RangeError('Non-finite knot');
    if (i) {
      if (xs[i] <= xs[i - 1] || ys[i] <= ys[i - 1]) throw new RangeError('Knots must strictly increase on both axes');
      slopes.push((ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]));
    }
  }
  // Fritsch-Carlson initialization and monotonicity circle constraint.
  tangents[0] = slopes[0];
  for (let i = 1; i < xs.length - 1; i++) tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
  tangents[xs.length - 1] = slopes[slopes.length - 1];
  for (let i = 0; i < slopes.length; i++) {
    const alpha = tangents[i] / slopes[i], beta = tangents[i + 1] / slopes[i];
    const norm = alpha * alpha + beta * beta;
    if (norm >= 9) {
      const scale = (3 - 1e-12) / Math.sqrt(norm);
      tangents[i] *= scale;
      tangents[i + 1] *= scale;
    }
  }
  function segment(i, u, derivative = false) {
    const h = xs[i + 1] - xs[i], d = slopes[i];
    // y = y0 + h * (m0*u + a*u² + b*u³).
    const a = 3 * d - 2 * tangents[i] - tangents[i + 1];
    const b = tangents[i] + tangents[i + 1] - 2 * d;
    return derivative ? tangents[i] + u * (2 * a + 3 * b * u) :
      ys[i] + h * u * (tangents[i] + u * (a + b * u));
  }
  const locate = (values, t) => clamp(preceding(values, t), 0, values.length - 2);
  return Object.freeze({
    knots: Object.freeze(points.map((p, i) => Object.freeze({ ...p, tangent: tangents[i] }))),
    realToCanonical(realT) {
      const t = clamp(finite(realT), xs[0], xs.at(-1)), i = locate(xs, t);
      return segment(i, (t - xs[i]) / (xs[i + 1] - xs[i]));
    },
    canonicalToReal(canonicalT) {
      const t = clamp(finite(canonicalT), ys[0], ys.at(-1)), i = locate(ys, t);
      let lo = 0, hi = 1, u = (t - ys[i]) / (ys[i + 1] - ys[i]);
      const h = xs[i + 1] - xs[i];
      for (let j = 0; j < 48; j++) {
        const err = segment(i, u) - t;
        if (Math.abs(err) < 1e-12) break;
        if (err > 0) hi = u; else lo = u;
        const candidate = u - err / (h * segment(i, u, true));
        u = Number.isFinite(candidate) && candidate > lo && candidate < hi ? candidate : (lo + hi) / 2;
      }
      return xs[i] + u * h;
    },
    getRate(realT) {
      if (realT < xs[0] || realT > xs.at(-1)) return 0;
      const t = clamp(finite(realT), xs[0], xs.at(-1)), i = locate(xs, t);
      return segment(i, (t - xs[i]) / (xs[i + 1] - xs[i]), true);
    },
  });
}

function musicalKnots() {
  const knots = [
    { real: 0, canonical: 0 }, { real: 3.55, canonical: 2.8 },
    { real: 4.35, canonical: 3.5 }, { real: 10.02, canonical: 7.8 },
    { real: 11.45, canonical: 9 },
  ];
  const dilation = { 5: 0.95, 13: 0.94, 18: 0.92, 19: 0.95 };
  const weights = SCENES_META.map(s => (s.endT - s.startT) * (dilation[s.id] || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let canonical = 9;
  SCENES_META.forEach((s, i) => {
    const span = 108 * weights[i] / total;
    const accents = s.id === 5 ? [[0.5, 0.47]] : s.id === 13 ? [[0.48, 0.54], [0.78, 0.74]] :
      s.id === 18 ? [[0.4, 0.44], [0.78, 0.76]] : s.id === 19 ? [[0.56, 0.61], [0.7, 0.66]] : [];
    for (const [r, c] of accents) knots.push({ real: s.startT + r * (s.endT - s.startT), canonical: canonical + c * span });
    canonical += span;
    knots.push({ real: s.endT, canonical: i === SCENES_META.length - 1 ? 117 : canonical });
  });
  return [...knots, { real: 168.88, canonical: 132.5 }, { real: 174.64, canonical: 137 }];
}

export const TIME_WARP_ENGINE = createTimeWarpEngine(musicalKnots());

const beatRng = createSeededRng('pelican-6000:beats');
export const BEAT_TIMES = Object.freeze(Array.from({ length: 243 }, (_, i) => {
  if (i === 0) return 0.32;
  if (i === 242) return 172.80;
  const u = i / 242;
  return 0.32 + 172.48 * u + 0.12 * Math.sin(8 * Math.PI * u) + beatRng.range(-0.018, 0.018);
}));

function makeIronTimes() {
  const intro = [...C.INTRO_IRON_TIMES];
  const candidates = [];
  for (let i = 0; i < BEAT_TIMES.length; i++) {
    const t = BEAT_TIMES[i], next = BEAT_TIMES[i + 1];
    if (t > intro.at(-1)) candidates.push(t);
    if (next && (t + next) / 2 > intro.at(-1)) candidates.push((t + next) / 2);
  }
  const count = 375 - intro.length;
  return Object.freeze(intro.concat(Array.from({ length: count }, (_, i) =>
    candidates[Math.round(i * (candidates.length - 1) / (count - 1))])));
}
export const IRON_TIMES = makeIronTimes();

export function getBeatState(realT) {
  const beatIndex = preceding(BEAT_TIMES, realT);
  if (beatIndex < 0) return { beatIndex: -1, beatTime: null, beatPulse: 0, beatPhase: 0 };
  const beatTime = BEAT_TIMES[beatIndex];
  const period = (BEAT_TIMES[beatIndex + 1] ?? beatTime + 0.713) - beatTime;
  return { beatIndex, beatTime, beatPulse: Math.exp(-(realT - beatTime) / 0.11), beatPhase: clamp((realT - beatTime) / period) };
}

export function getIronState(realT) {
  const ironIndex = preceding(IRON_TIMES, realT);
  const ironTime = ironIndex < 0 ? null : IRON_TIMES[ironIndex];
  return { ironIndex, ironTime, ironPulse: ironTime === null ? 0 : Math.exp(-(realT - ironTime) / 0.075),
    introStrikeIndex: preceding(C.INTRO_IRON_TIMES, realT) };
}

// Supported telemetry: sample(t)/getSample(t), or { times, vocal, guitar, iron,
// room }, or { sampleRate|hopSize+sampleRate, tracks: { name: samples } }.
function audioSample(telemetry, t, fallback) {
  if (!telemetry) return fallback;
  let sample;
  if (typeof telemetry.sample === 'function') sample = telemetry.sample(t);
  else if (typeof telemetry.getSample === 'function') sample = telemetry.getSample(t);
  else {
    const series = telemetry.tracks || telemetry;
    let index, frac;
    if (telemetry.times?.length) {
      index = clamp(preceding(telemetry.times, t), 0, telemetry.times.length - 1);
      frac = clamp((t - telemetry.times[index]) / ((telemetry.times[index + 1] ?? Infinity) - telemetry.times[index]));
    } else {
      const position = Math.max(0, t * (telemetry.sampleRate || 1) / (telemetry.hopSize || 1));
      index = Math.floor(position); frac = position - index;
    }
    sample = {};
    for (const name of Object.keys(fallback)) {
      const values = series[name];
      if (typeof values === 'number') sample[name] = values;
      else if (values?.length) {
        const a = values[Math.min(index, values.length - 1)];
        sample[name] = a + ((values[Math.min(index + 1, values.length - 1)] ?? a) - a) * frac;
      }
    }
  }
  return Object.fromEntries(Object.keys(fallback).map(name =>
    [name, Number.isFinite(sample?.[name]) ? clamp(sample[name]) : fallback[name]]));
}

export function getTimelineState(realT, telemetry = null) {
  const t = clamp(finite(realT), 0, C.TOTAL_DURATION);
  const beat = getBeatState(t), iron = getIronState(t);
  const sceneIndex = t < C.ACT2_END || t >= C.ACT3_END ? -1 : SCENES_META.findIndex(s => t >= s.startT && t < s.endT);
  const sceneMeta = sceneIndex < 0 ? null : SCENES_META[sceneIndex];
  const act = t < C.ACT1_END ? 'act1' : t < C.SHUTTER_END ? 'shutter' :
    t < C.ACT2_END ? 'act2' : t < C.ACT3_END ? 'act3' : 'act4';
  const fade = clamp(t / 0.32) * clamp((C.TOTAL_DURATION - t) / 1.8);
  const vocalGate = clamp((t - C.FIRST_LYRIC_T) / 0.5) * clamp((C.LAST_LYRIC_T + 0.8 - t) / 0.8);
  const audio = audioSample(telemetry, t, {
    vocal: fade * vocalGate * (0.26 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.31)) + 0.18 * beat.beatPulse),
    guitar: fade * (0.18 + 0.28 * beat.beatPulse + 0.08 * Math.sin(t * 0.7) ** 2),
    iron: fade * iron.ironPulse * 0.85,
    room: fade * (0.12 + 0.06 * Math.sin(t * 0.23) ** 2),
  });
  return {
    realT: t, canonicalT: TIME_WARP_ENGINE.realToCanonical(t), timeWarpRate: TIME_WARP_ENGINE.getRate(t),
    progress: t / C.TOTAL_DURATION, downloadProgress: clamp(t / C.DOWNLOAD_COMPLETE_T),
    isDownloadDone: t >= C.DOWNLOAD_COMPLETE_T, isRevealCard: t >= C.REVEAL_CARD_T,
    act, actName: { act1: '序章', shutter: '快门', act2: '手风琴画廊', act3: '六千年骑行', act4: '下载与揭幕' }[act],
    sceneMeta, sceneIndex, sceneProgress: sceneMeta ? (t - sceneMeta.startT) / (sceneMeta.endT - sceneMeta.startT) : 0,
    sceneLocalT: sceneMeta ? t - sceneMeta.startT : 0,
    beatIndex: beat.beatIndex, beatPulse: beat.beatPulse, beatPhase: beat.beatPhase,
    ironIndex: iron.ironIndex, ironPulse: iron.ironPulse, roadY: C.ROAD_EDGE_Y, audio,
  };
}
