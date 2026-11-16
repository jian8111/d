// 署名: PRO2H(hadcockulloa@gmail.com)
import { decodeMdp3FromBase64, createLzmaWorkerSource } from './lzma-worker.js';
import { Mdp3AudioRenderer, createAudioWorkletSource } from './dsp-worklet.js';

// Supply audioBase64 directly (or a lazy function) when bundling a single HTML.
// The default asset module exports AUDIO_MDP3_B64 from ../data/audio-mdp3.js.
export function createAudioEngine({ onStateChange = () => {}, audioBase64 = null } = {}) {
  let ctx = null, master = null, node = null, renderer = null;
  let decoded = null, decodePromise = null, setupPromise = null;
  let mode = 'silent', playing = false, muted = false, disposed = false;
  let position = 0, anchor = 0, pauseTimer = null, intent = 0;
  let env = { vocal: 0, guitar: 0, iron: 0, room: 0 }, lastError = null;
  const duration = () => decoded ? decoded.header.durationMs / 1000 ||
    (decoded.header.numFrames ? (decoded.header.numFrames - 1) * decoded.header.hopSize + decoded.header.fftSize : 0) / decoded.header.sampleRate : 174.64;
  const getCurrentTime = () => Math.max(0, Math.min(duration(), position +
    (playing && ctx ? Math.max(0, ctx.currentTime - anchor) : 0)));
  function notify() {
    try { onStateChange({ currentTime: getCurrentTime(), playing, muted, ready: Boolean(decoded), mode, env: { ...env }, error: lastError }); }
    catch { /* A consumer's callback must not break audio or produce a rejected task. */ }
  }
  function ramp(value, seconds = 0.025) {
    if (!master || !ctx) return;
    const gain = master.gain, now = ctx.currentTime;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    gain.linearRampToValueAtTime(value, now + seconds);
  }
  function command(type, value) {
    if (mode === 'worklet' && node) node.port.postMessage(type === 'seek' ? { type, time: value } : { type, value });
    else if (renderer) {
      if (type === 'seek') renderer.seek(value);
      if (type === 'playing') renderer.setPlaying(value);
      if (type === 'muted') renderer.setMuted(value);
    }
  }
  function cancelPause() { if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; } }
  function updateFromRenderer(state) {
    env = state.env;
    if (state.ended && playing) {
      position = duration(); playing = false; ramp(0); notify();
    }
  }
  async function payload() {
    let b64 = typeof audioBase64 === 'function' ? await audioBase64() : audioBase64;
    if (!b64) b64 = globalThis.AUDIO_MDP3_B64;
    if (!b64) b64 = (await import('../data/audio-mdp3.js')).AUDIO_MDP3_B64;
    if (typeof b64 !== 'string' || !b64.length) throw new Error('AUDIO_MDP3_B64 is unavailable');
    return b64;
  }
  async function workerDecode(b64) {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return decodeMdp3FromBase64(b64);
    let worker, url;
    try {
      url = URL.createObjectURL(new Blob([createLzmaWorkerSource()], { type: 'text/javascript' }));
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Audio decoder worker timed out')), 15000);
        try {
          worker = new Worker(url);
          worker.onmessage = event => {
            clearTimeout(timer);
            if (event.data?.error) reject(new Error(event.data.error));
            else if (event.data?.decoded) resolve(event.data.decoded);
            else reject(new Error('Invalid decoder worker response'));
          };
          worker.onerror = event => { event.preventDefault?.(); clearTimeout(timer); reject(new Error('Audio decoder worker unavailable')); };
          worker.onmessageerror = () => { clearTimeout(timer); reject(new Error('Audio decoder worker transfer failed')); };
          worker.postMessage({ id: 1, b64 });
        } catch (error) { clearTimeout(timer); reject(error); }
      });
    } catch {
      worker?.terminate(); worker = null;
      return decodeMdp3FromBase64(b64);
    }
    finally { worker?.terminate(); if (url) URL.revokeObjectURL(url); }
  }
  async function prewarm() {
    if (disposed) return false;
    if (!decodePromise) decodePromise = (async () => {
      try {
        const data = await workerDecode(await payload());
        if (disposed) return false;
        decoded = data; lastError = null; notify(); return true;
      } catch (error) {
        lastError = String(error.message || error); decodePromise = null; notify(); return false;
      }
    })();
    return decodePromise;
  }
  function ensureContext() {
    if (ctx) return ctx;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    try { ctx = new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' }); }
    catch { ctx = new AudioContextClass(); }
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    return ctx;
  }
  function scriptFallback() {
    if (disposed) return false;
    const time = getCurrentTime();
    if (node) { node.disconnect(); if (node.port) node.port.onmessage = null; }
    renderer = new Mdp3AudioRenderer(ctx.sampleRate);
    renderer.loadMdp3(decoded); renderer.seek(time); renderer.setPlaying(playing);
    const script = ctx.createScriptProcessor(4096, 0, 2);
    let blockCounter = 0;
    script.onaudioprocess = event => {
      const left = event.outputBuffer.getChannelData(0), right = event.outputBuffer.getChannelData(1);
      try {
        updateFromRenderer(renderer.renderBlock(left, right, left.length));
        if (++blockCounter % 4 === 0) notify();
      } catch (error) {
        left.fill(0); right.fill(0); lastError = String(error.message || error);
        position = getCurrentTime(); playing = false; ramp(0); notify();
      }
    };
    node = script; mode = 'script'; node.connect(master); notify(); return true;
  }
  async function setupBackend() {
    if (!ctx || !decoded || disposed) return false;
    if (node) return true;
    let moduleUrl, worklet;
    try {
      if (!ctx.audioWorklet || typeof globalThis.AudioWorkletNode !== 'function') throw new Error('Worklet unavailable');
      moduleUrl = URL.createObjectURL(new Blob([createAudioWorkletSource()], { type: 'text/javascript' }));
      let moduleTimer;
      try {
        await Promise.race([
          ctx.audioWorklet.addModule(moduleUrl),
          new Promise((_, reject) => { moduleTimer = setTimeout(() => reject(new Error('AudioWorklet module timed out')), 5000); }),
        ]);
      } finally { clearTimeout(moduleTimer); }
      if (disposed) return false;
      worklet = new globalThis.AudioWorkletNode(ctx, 'mdp3-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('AudioWorklet initialization timed out')), 5000);
        worklet.port.onmessage = event => {
          if (event.data.type === 'ready') { clearTimeout(timer); resolve(); }
          if (event.data.type === 'error') { clearTimeout(timer); reject(new Error(event.data.error)); }
        };
        worklet.onprocessorerror = event => { event.preventDefault?.(); clearTimeout(timer); reject(new Error('AudioWorklet failed')); };
        try {
          // Keep the original payload intact so fallback never sees detached buffers.
          const copy = { header: { ...decoded.header }, tracks: decoded.tracks.map(t => ({ ...t,
            counts: t.counts.slice(), logScales: t.logScales.slice(), binIndices: t.binIndices.slice(), magQ: t.magQ.slice(), phaseQ: t.phaseQ.slice() })) };
          const transfer = copy.tracks.flatMap(t => [t.counts.buffer, t.logScales.buffer, t.binIndices.buffer, t.magQ.buffer, t.phaseQ.buffer]);
          worklet.port.postMessage({ type: 'load', decoded: copy }, transfer);
        } catch (error) { clearTimeout(timer); reject(error); }
      });
      if (disposed) { worklet.disconnect(); return false; }
      node = worklet; mode = 'worklet';
      worklet.port.onmessage = event => {
        if (event.data.type === 'state') { updateFromRenderer(event.data); notify(); }
        else if (event.data.type === 'error') recoverWorklet(event.data.error);
      };
      worklet.onprocessorerror = event => { event.preventDefault?.(); recoverWorklet('AudioWorklet processor failed'); };
      node.connect(master); command('seek', position); notify(); return true;
    } catch {
      if (worklet) { worklet.port.onmessage = null; worklet.onprocessorerror = null; worklet.disconnect(); }
      return scriptFallback();
    } finally { if (moduleUrl) URL.revokeObjectURL(moduleUrl); }
  }
  function recoverWorklet(error) {
    try { scriptFallback(); }
    catch { lastError = String(error); position = getCurrentTime(); playing = false; mode = 'silent'; ramp(0); notify(); }
  }
  async function prepare() {
    if (!await prewarm() || disposed) return false;
    if (!setupPromise) setupPromise = setupBackend().catch(error => {
      lastError = String(error.message || error); mode = 'silent'; notify(); return false;
    }).then(ok => { if (!ok) setupPromise = null; return ok; });
    return setupPromise;
  }
  async function unlockAndPlay() {
    const request = ++intent;
    if (disposed) return false;
    try {
      // Construct/resume synchronously within the user gesture, before decoding.
      const context = ensureContext();
      const resume = context.resume();
      // Attach rejection handling immediately, even during a long decode.
      const resumed = Promise.resolve(resume).then(() => true, error => {
        lastError = String(error.message || error); return false;
      });
      const [ready, awake] = await Promise.all([prepare(), resumed]);
      if (!ready || !awake || request !== intent || disposed) return false;
      cancelPause();
      if (playing) return true;
      if (position >= duration()) position = 0;
      command('seek', position); anchor = ctx.currentTime; playing = true;
      command('playing', true); ramp(muted ? 0 : 1, 0.045); lastError = null; notify(); return true;
    } catch (error) { lastError = String(error.message || error); notify(); return false; }
  }
  function pause() {
    intent++; cancelPause(); position = getCurrentTime(); playing = false; ramp(0);
    pauseTimer = setTimeout(() => { command('playing', false); command('seek', position); pauseTimer = null; }, 30);
    notify();
  }
  function seek(sec) {
    cancelPause();
    position = Math.max(0, Math.min(duration(), Number.isFinite(sec) ? sec : 0));
    if (ctx) anchor = ctx.currentTime;
    ramp(0, 0.012);
    // Let the old waveform fade out before discontinuously moving the renderer.
    pauseTimer = setTimeout(() => {
      command('seek', getCurrentTime()); command('playing', playing);
      ramp(playing && !muted ? 1 : 0, 0.035); pauseTimer = null;
    }, 16);
    notify();
  }
  function setMuted(value) { muted = Boolean(value); ramp(playing && !muted ? 1 : 0); notify(); return muted; }
  function dispose() {
    intent++; disposed = true; playing = false; cancelPause();
    if (node) { node.disconnect(); if (node.port) node.port.close(); else node.onaudioprocess = null; }
    master?.disconnect();
    if (ctx) Promise.resolve(ctx.close()).catch(() => {});
    node = null; mode = 'silent';
  }
  return { prewarm, unlockAndPlay, play: unlockAndPlay, pause, seek, setMuted,
    toggleMute: () => setMuted(!muted), getCurrentTime, isPlaying: () => playing,
    isMuted: () => muted, isReady: () => Boolean(decoded), getMode: () => mode, dispose };
}
