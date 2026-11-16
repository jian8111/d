// 署名: PRO2H(hadcockulloa@gmail.com)

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over UTF-8 bytes, including supplementary Unicode code points.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (const char of String(str)) {
    const cp = char.codePointAt(0);
    const bytes = cp < 0x80 ? [cp] : cp < 0x800 ?
      [0xc0 | (cp >>> 6), 0x80 | (cp & 63)] : cp < 0x10000 ?
        [0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 63), 0x80 | (cp & 63)] :
        [0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 63), 0x80 | ((cp >>> 6) & 63), 0x80 | (cp & 63)];
    for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hash2D(x, y, seed = 0) {
  // String coordinates retain fractional positions and avoid 32-bit grid aliases.
  let h = hashString(`${seed}:${x}:${y}`);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createSeededRng(seed) {
  const root = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const next = mulberry32(root);
  let spare = null;
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int(min, maxInclusive) {
      min = Math.ceil(min);
      maxInclusive = Math.floor(maxInclusive);
      if (maxInclusive < min) throw new RangeError('Empty integer range');
      return min + Math.floor(next() * (maxInclusive - min + 1));
    },
    pick(arr) { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
    chance: p => next() < p,
    gaussian(mean = 0, std = 1) {
      if (spare !== null) {
        const n = spare;
        spare = null;
        return mean + std * n;
      }
      const r = Math.sqrt(-2 * Math.log(1 - next()));
      const theta = 2 * Math.PI * next();
      spare = r * Math.sin(theta);
      return mean + std * r * Math.cos(theta);
    },
    // Forks depend on root + label, never on the parent's draw order.
    fork: label => createSeededRng(hashString(`${root}:${label}`)),
  };
}
