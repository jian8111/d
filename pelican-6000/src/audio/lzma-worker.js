// 署名: PRO2H(hadcockulloa@gmail.com)

export function decodeLzmaAlone(compressedBytes) {
  const input = compressedBytes instanceof Uint8Array ? compressedBytes : new Uint8Array(compressedBytes);
  if (input.length < 18) throw new Error('Truncated LZMA-alone header');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let props = input[0];
  if (props >= 225) throw new Error('Invalid LZMA properties');
  const lc = props % 9;
  props = Math.floor(props / 9);
  const lp = props % 5, pb = Math.floor(props / 5);
  const dictionarySize = Math.max(4096, view.getUint32(1, true));
  const sizeLo = view.getUint32(5, true), sizeHi = view.getUint32(9, true);
  const unknown = sizeLo === 0xffffffff && sizeHi === 0xffffffff;
  const expected = unknown ? Infinity : sizeHi * 4294967296 + sizeLo;
  if (!unknown && (!Number.isSafeInteger(expected) || expected > 0x7fffffff)) throw new Error('LZMA output too large');
  let cursor = 13, range = 0xffffffff, code = 0;
  function byte() {
    if (cursor >= input.length) throw new Error('Truncated LZMA range stream');
    return input[cursor++];
  }
  if (byte() !== 0) throw new Error('Invalid LZMA range prefix');
  for (let i = 0; i < 4; i++) code = (code * 256 + byte()) >>> 0;
  const model = n => new Uint16Array(n).fill(1024);
  function normalize() {
    if (range < 0x1000000) { range = (range * 256) >>> 0; code = (code * 256 + byte()) >>> 0; }
  }
  function bit(probs, index) {
    const p = probs[index], bound = (range >>> 11) * p;
    let result;
    if (code < bound) { range = bound; probs[index] = p + ((2048 - p) >>> 5); result = 0; }
    else { range = (range - bound) >>> 0; code = (code - bound) >>> 0; probs[index] = p - (p >>> 5); result = 1; }
    normalize();
    return result;
  }
  function tree(probs, start, bits, reverse = false) {
    let node = 1, result = 0;
    for (let i = 0; i < bits; i++) {
      const b = bit(probs, start + node);
      node = node * 2 + b;
      if (reverse) result += b * 2 ** i;
    }
    return reverse ? result : node - 2 ** bits;
  }
  function direct(bits) {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      range >>>= 1;
      const b = code >= range ? 1 : 0;
      if (b) code = (code - range) >>> 0;
      result = result * 2 + b;
      normalize();
    }
    return result;
  }
  function lengthModel() { return { choice: model(2), low: model(16 * 8), mid: model(16 * 8), high: model(256) }; }
  function length(m, posState) {
    if (!bit(m.choice, 0)) return tree(m.low, posState * 8, 3);
    if (!bit(m.choice, 1)) return 8 + tree(m.mid, posState * 8, 3);
    return 16 + tree(m.high, 0, 8);
  }
  const isMatch = model(12 * 16), isRep = model(12), isRepG0 = model(12);
  const isRepG1 = model(12), isRepG2 = model(12), isRep0Long = model(12 * 16);
  const literal = model(0x300 * 2 ** (lc + lp));
  const posSlot = model(4 * 64), posDecoders = model(114), align = model(16);
  const lenModel = lengthModel(), repLenModel = lengthModel();
  const posMask = (1 << pb) - 1, literalPosMask = (1 << lp) - 1;
  // The dictionary grows on demand, then becomes a circular history window.
  let dictionary = new Uint8Array(Math.min(dictionarySize, 4096));
  let dictPos = 0, total = 0, chunk = new Uint8Array(65536), used = 0;
  const chunks = [];
  function emit(value) {
    if (total >= 0x7fffffff) throw new Error('LZMA output too large');
    if (dictPos === dictionary.length) {
      if (dictionary.length < dictionarySize) {
        const larger = new Uint8Array(Math.min(dictionarySize, dictionary.length * 2));
        larger.set(dictionary); dictionary = larger;
      } else dictPos = 0;
    }
    dictionary[dictPos++] = value;
    chunk[used++] = value;
    total++;
    if (used === chunk.length) { chunks.push(chunk); chunk = new Uint8Array(65536); used = 0; }
  }
  function history(distance) {
    if (distance > total || distance > dictionarySize) throw new Error('Invalid LZMA match distance');
    return dictionary[(dictPos - distance + dictionary.length) % dictionary.length];
  }
  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, previous = 0;
  while (total < expected) {
    const ps = total & posMask;
    if (!bit(isMatch, state * 16 + ps)) {
      const context = ((total & literalPosMask) << lc) + (previous >>> (8 - lc));
      const base = context * 0x300;
      let symbol = 1;
      if (state >= 7) {
        let match = history(rep0 + 1);
        do {
          const matchBit = (match >>> 7) & 1;
          match = (match << 1) & 255;
          const b = bit(literal, base + ((1 + matchBit) << 8) + symbol);
          symbol = symbol * 2 + b;
          if (matchBit !== b) {
            while (symbol < 256) symbol = symbol * 2 + bit(literal, base + symbol);
            break;
          }
        } while (symbol < 256);
      } else while (symbol < 256) symbol = symbol * 2 + bit(literal, base + symbol);
      previous = symbol - 256;
      emit(previous);
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    let count;
    if (bit(isRep, state)) {
      if (!bit(isRepG0, state)) {
        if (!bit(isRep0Long, state * 16 + ps)) {
          state = state < 7 ? 9 : 11;
          previous = history(rep0 + 1); emit(previous); continue;
        }
      } else {
        let distance;
        if (!bit(isRepG1, state)) distance = rep1;
        else {
          if (!bit(isRepG2, state)) distance = rep2;
          else { distance = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0; rep0 = distance;
      }
      count = length(repLenModel, ps) + 2;
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      count = length(lenModel, ps) + 2;
      state = state < 7 ? 7 : 10;
      const slot = tree(posSlot, Math.min(count - 2, 3) * 64, 6);
      if (slot < 4) rep0 = slot;
      else {
        const bits = (slot >>> 1) - 1;
        rep0 = (2 + (slot & 1)) * 2 ** bits;
        if (slot < 14) rep0 += tree(posDecoders, rep0 - slot - 1, bits, true);
        else rep0 += direct(bits - 4) * 16 + tree(align, 0, 4, true);
      }
      if (rep0 === 0xffffffff) {
        if (!unknown && total !== expected) throw new Error('Premature LZMA end marker');
        break;
      }
    }
    if (total + count > expected) throw new Error('LZMA match exceeds declared size');
    for (let i = 0; i < count; i++) { previous = history(rep0 + 1); emit(previous); }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) { output.set(part, offset); offset += part.length; }
  output.set(chunk.subarray(0, used), offset);
  return output;
}

export function base64ToBytes(b64) {
  const text = String(b64).replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1) throw new Error('Invalid base64');
  if (typeof atob === 'function') return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  throw new Error('No base64 decoder available');
}

export function parseMdp3(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 32 || String.fromCharCode(...data.subarray(0, 4)) !== 'MDP3') throw new Error('Invalid MDP3 header');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = {
    magic: 'MDP3', sampleRate: v.getUint32(4, true), fftSize: v.getUint16(8, true),
    hopSize: v.getUint16(10, true), numFrames: v.getUint32(12, true), numTracks: v.getUint8(16),
    flags: v.getUint8(17), reserved: v.getUint16(18, true), durationMs: v.getUint32(20, true),
    floorDb: v.getFloat32(24, true), spanDb: v.getFloat32(28, true),
  };
  if (header.sampleRate !== 24000 || header.fftSize !== 512 || header.hopSize !== 256 || header.numTracks !== 4 ||
      header.floorDb !== -96 || header.spanDb !== 96) throw new Error('Unsupported MDP3 format');
  let cursor = 32;
  function take(n) {
    if (n > data.length - cursor) throw new Error('Truncated MDP3 track');
    const result = data.slice(cursor, cursor + n); // Independent buffers for worker transfer.
    cursor += n;
    return result;
  }
  const tracks = ['vocal', 'guitar', 'iron', 'room'].map(name => {
    const counts = take(header.numFrames), logScales = take(header.numFrames);
    const totalBins = counts.reduce((a, b) => a + b, 0);
    const binIndices = take(totalBins), magQ = take(totalBins), phaseQ = take(totalBins);
    if (binIndices.some(k => k === 0 || k >= header.fftSize / 2)) throw new Error('Invalid MDP3 bin index');
    return { name, counts, logScales, totalBins, binIndices, magQ, phaseQ };
  });
  if (cursor !== data.length) throw new Error('Unexpected trailing MDP3 bytes');
  return { header, tracks };
}

export function decodeMdp3FromBase64(b64) {
  return parseMdp3(decodeLzmaAlone(base64ToBytes(b64)));
}

function attachMdp3Worker(scope) {
  scope.onmessage = event => {
    const { id, b64 } = event.data || {};
    try {
      const decoded = decodeMdp3FromBase64(b64);
      const buffers = decoded.tracks.flatMap(t => [t.counts.buffer, t.logScales.buffer, t.binIndices.buffer, t.magQ.buffer, t.phaseQ.buffer]);
      scope.postMessage({ id, decoded }, buffers);
    } catch (error) { scope.postMessage({ id, error: String(error.message || error) }); }
  };
}

export function createLzmaWorkerSource() {
  return '// 署名: PRO2H(hadcockulloa@gmail.com)\n' +
    [decodeLzmaAlone, base64ToBytes, parseMdp3, decodeMdp3FromBase64, attachMdp3Worker].map(fn => fn.toString()).join('\n') +
    '\nattachMdp3Worker(self);\n';
}

// ESM import on Window/Node must never install or replace a message handler.
if (typeof self !== 'undefined' && typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope) {
  attachMdp3Worker(self);
}
