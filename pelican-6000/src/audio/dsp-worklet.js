// 署名: PRO2H(hadcockulloa@gmail.com)

// This class has no browser globals or imports; its exact source also runs in
// the AudioWorklet, ScriptProcessor fallback, and Node numerical checks.
export class Mdp3AudioRenderer {
  constructor(targetSampleRate = 48000) {
    if (!(targetSampleRate > 0) || !Number.isFinite(targetSampleRate)) throw new RangeError('Invalid output sample rate');
    this.targetSampleRate = targetSampleRate;
    this.position = 0;
    this.playing = false;
    this.muted = false;
    this.duration = 0;
    this.loaded = false;
    this._env = { vocal: 0, guitar: 0, iron: 0, room: 0 };
  }

  loadMdp3(decoded) {
    const { header: h, tracks } = decoded;
    const N = h.fftSize;
    if (N !== 512 || h.hopSize !== 256 || h.sampleRate !== 24000 || tracks.length !== 4) throw new Error('Unsupported renderer format');
    this.header = { ...h };
    this.N = N;
    this.hop = h.hopSize;
    this.sourceSampleRate = h.sampleRate;
    this.duration = h.durationMs > 0 ? h.durationMs / 1000 : (h.numFrames ? (h.numFrames - 1) * this.hop + N : 0) / h.sampleRate;
    this.sourceLength = Math.round(this.duration * h.sampleRate);
    this.window = Float64Array.from({ length: N }, (_, n) => Math.sin(Math.PI * (n + 0.5) / N));
    this.reverse = new Uint16Array(N);
    for (let n = 0; n < N; n++) {
      let v = n, r = 0;
      for (let j = 0; j < Math.log2(N); j++) { r = (r << 1) | (v & 1); v >>>= 1; }
      this.reverse[n] = r;
    }
    this.cos = Float64Array.from({ length: N / 2 }, (_, i) => Math.cos(2 * Math.PI * i / N));
    this.sin = Float64Array.from({ length: N / 2 }, (_, i) => Math.sin(2 * Math.PI * i / N));
    this.tracks = tracks.map((t, index) => {
      if (t.counts.length !== h.numFrames || t.logScales.length !== h.numFrames) throw new Error('Invalid frame counts');
      const offsets = new Uint32Array(h.numFrames + 1);
      for (let f = 0; f < h.numFrames; f++) offsets[f + 1] = offsets[f] + t.counts[f];
      if ([t.binIndices, t.magQ, t.phaseQ].some(a => a.length !== offsets[h.numFrames])) throw new Error('Invalid sparse track lengths');
      return { ...t, name: ['vocal', 'guitar', 'iron', 'room'][index], offsets, frames: new Map(), blocks: new Map() };
    });
    this._makeSinc16();
    this.loaded = true;
    this.seek(0);
    return this;
  }

  _makeSinc16() {
    this.kernelPhases = 1024;
    this.sinc16 = new Float64Array((this.kernelPhases + 1) * 16);
    const cutoff = Math.min(1, this.targetSampleRate / this.sourceSampleRate);
    for (let phase = 0; phase <= this.kernelPhases; phase++) {
      let sum = 0;
      for (let tap = 0; tap < 16; tap++) {
        const d = tap - 7 - phase / this.kernelPhases;
        const x = Math.PI * d * cutoff;
        const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x;
        const win = Math.abs(d) >= 8 ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * d / 8) + 0.08 * Math.cos(2 * Math.PI * d / 8);
        const weight = cutoff * sinc * win;
        this.sinc16[phase * 16 + tap] = weight;
        sum += weight;
      }
      for (let tap = 0; tap < 16; tap++) this.sinc16[phase * 16 + tap] /= sum;
    }
  }

  // Unscaled inverse FFT: input spectra already contain Python's /N factor.
  _inverse(re, im) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const j = this.reverse[i];
      if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let size = 2; size <= N; size *= 2) {
      const half = size / 2, step = N / size;
      for (let start = 0; start < N; start += size) {
        for (let j = 0; j < half; j++) {
          const a = start + j, b = a + half, k = j * step;
          const r = re[b] * this.cos[k] - im[b] * this.sin[k];
          const v = re[b] * this.sin[k] + im[b] * this.cos[k];
          re[b] = re[a] - r; im[b] = im[a] - v;
          re[a] += r; im[a] += v;
        }
      }
    }
  }

  _frame(track, f) {
    if (f < 0 || f >= this.header.numFrames) return null;
    if (track.frames.has(f)) return track.frames.get(f);
    const re = new Float64Array(this.N), im = new Float64Array(this.N);
    if (track.counts[f] > 0 && track.logScales[f] > 0) {
      const peakDb = this.header.floorDb + track.logScales[f] / 255 * this.header.spanDb;
      const peakAmp = 10 ** (peakDb / 20);
      for (let i = track.offsets[f]; i < track.offsets[f + 1]; i++) {
        const k = track.binIndices[i];
        if (k < 1 || k >= this.N / 2) throw new Error('Invalid spectral bin');
        const mag = peakAmp * track.magQ[i] / 255, ph = track.phaseQ[i] / 256 * 2 * Math.PI;
        re[k] = mag * Math.cos(ph); im[k] = mag * Math.sin(ph);
        re[this.N - k] = re[k]; im[this.N - k] = -im[k];
      }
      this._inverse(re, im);
      for (let n = 0; n < this.N; n++) re[n] *= this.window[n];
    }
    track.frames.set(f, re);
    if (track.frames.size > 12) track.frames.delete(track.frames.keys().next().value);
    return re;
  }

  _sourceSample(track, n) {
    if (n < 0 || n >= this.sourceLength) return 0;
    const f = Math.floor(n / this.hop);
    let block = track.blocks.get(f);
    if (!block) {
      block = new Float64Array(this.hop);
      const current = this._frame(track, f), previous = this._frame(track, f - 1);
      for (let i = 0; i < this.hop; i++) block[i] = (current?.[i] || 0) + (previous?.[i + this.hop] || 0);
      track.blocks.set(f, block);
      if (track.blocks.size > 12) track.blocks.delete(track.blocks.keys().next().value);
    }
    return block[n - f * this.hop];
  }

  _sampleTrack(track, position) {
    const center = Math.floor(position), fraction = position - center;
    const phasePosition = fraction * this.kernelPhases;
    const phase = Math.floor(phasePosition), blend = phasePosition - phase;
    let value = 0;
    for (let j = 0; j < 16; j++) {
      const a = this.sinc16[phase * 16 + j], b = this.sinc16[(phase + 1) * 16 + j];
      value += this._sourceSample(track, center + j - 7) * (a + (b - a) * blend);
    }
    return value;
  }

  seek(sec) {
    this.position = Math.max(0, Math.min(this.duration, Number.isFinite(sec) ? sec : 0)) * (this.sourceSampleRate || 24000);
    for (const t of this.tracks || []) { t.frames.clear(); t.blocks.clear(); }
    this._env = { vocal: 0, guitar: 0, iron: 0, room: 0 };
  }
  setPlaying(bool) { this.playing = Boolean(bool); }
  setMuted(bool) { this.muted = Boolean(bool); }

  renderBlock(outLeft, outRight, numSamples = outLeft.length) {
    const count = Math.min(numSamples, outLeft.length, outRight.length);
    outLeft.fill(0); outRight.fill(0);
    const energy = [0, 0, 0, 0];
    let rendered = 0;
    if (this.loaded && this.playing) {
      const step = this.sourceSampleRate / this.targetSampleRate;
      for (let i = 0; i < count && this.position < this.sourceLength; i++) {
        const t = this.position / this.sourceSampleRate;
        // Envelope keeps tape flutter continuous at both scene boundaries.
        const tape = t >= 122 && t <= 130.5 ? Math.sin(Math.PI * (t - 122) / 8.5) ** 2 : 0;
        const flutter = tape * this.sourceSampleRate * (0.00065 * Math.sin(t * 2 * Math.PI * 0.63) + 0.00009 * Math.sin(t * 2 * Math.PI * 7.3));
        const p = this.position + flutter;
        const vocal = this._sampleTrack(this.tracks[0], p);
        const guitar = this._sampleTrack(this.tracks[1], p);
        const iron = this._sampleTrack(this.tracks[2], p);
        const room = this._sampleTrack(this.tracks[3], p);
        const guitarHaas = this._sampleTrack(this.tracks[1], p - this.sourceSampleRate * 0.0065);
        const roomSide = this._sampleTrack(this.tracks[3], p - this.sourceSampleRate * 0.013);
        const mid = 0.7071067811865476 * vocal + 0.66 * guitar + 0.7 * room;
        const side = 0.12 * (guitar - guitarHaas) + 0.28 * (room - roomSide);
        const left = mid + side + 0.60 * iron;
        const right = mid - side + 0.80 * iron;
        if (!this.muted) { outLeft[i] = Math.tanh(left * 0.92); outRight[i] = Math.tanh(right * 0.92); }
        energy[0] += vocal * vocal; energy[1] += guitar * guitar;
        energy[2] += iron * iron; energy[3] += room * room;
        this.position = Math.min(this.sourceLength, this.position + step);
        rendered++;
      }
    }
    const ended = this.loaded && this.position >= this.sourceLength;
    if (ended) this.playing = false;
    for (let i = 0; i < 4; i++) this._env[['vocal', 'guitar', 'iron', 'room'][i]] = rendered ? Math.sqrt(energy[i] / rendered) : 0;
    return { currentTime: this.position / (this.sourceSampleRate || 24000), ended, env: { ...this._env } };
  }
}

export function createAudioWorkletSource() {
  return '// 署名: PRO2H(hadcockulloa@gmail.com)\n' + Mdp3AudioRenderer.toString() + `
class Mdp3Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.renderer = new Mdp3AudioRenderer(sampleRate);
    this.tick = 0;
    this.failed = false;
    this.port.onmessage = event => {
      const message = event.data || {};
      try {
        if (message.type === 'load') { this.renderer.loadMdp3(message.decoded); this.port.postMessage({ type: 'ready' }); }
        if (message.type === 'seek') this.renderer.seek(message.time);
        if (message.type === 'playing') this.renderer.setPlaying(message.value);
        if (message.type === 'muted') this.renderer.setMuted(message.value);
      } catch (error) { this.failed = true; this.port.postMessage({ type: 'error', error: String(error.message || error) }); }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2 || this.failed) return true;
    try {
      const state = this.renderer.renderBlock(output[0], output[1], output[0].length);
      if (++this.tick % 8 === 0 || state.ended && !this.wasEnded) this.port.postMessage({ type: 'state', ...state });
      this.wasEnded = state.ended;
    } catch (error) { this.failed = true; output.forEach(c => c.fill(0)); this.port.postMessage({ type: 'error', error: String(error.message || error) }); }
    return true;
  }
}
registerProcessor('mdp3-audio', Mdp3Processor);
`;
}
