// 署名: PRO2H(hadcockulloa@gmail.com)
import { MV_TIMELINE_CONFIG, SCENES_META } from "./data/scenes-meta.js";
import { AUDIO_MDP3_B64 } from "./data/audio-mdp3.js";
import { AUDIO_TELEMETRY } from "./data/audio-telemetry.js";
import { createSeededRng } from "./core/prng.js";
import { getTimelineState } from "./core/timeline.js";
import { createAudioEngine } from "./audio/audio-engine.js";
import { createAct1SvgLayer, renderAct1Overlay, renderAct2Accordion } from "./render/act1-intro.js";
import { SCENES_BATCH_1 } from "./render/scenes-batch-1.js";
import { SCENES_BATCH_2 } from "./render/scenes-batch-2.js";
import { SCENES_BATCH_3 } from "./render/scenes-batch-3.js";
import {
  renderGalleryWallBackdrop,
  renderGalleryFrameAndLighting,
  renderCuratorPlaque,
  renderSpatialLyrics,
  renderDownloadCapsuleAndReveal,
  renderAct4GalleryWall,
} from "./render/overlay-4k.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const params = new URLSearchParams(window.location.search);
const renderScale = clamp(parseInt(params.get("scale") || "2", 10) || 2, 1, 3);
const TOTAL_DURATION = MV_TIMELINE_CONFIG.TOTAL_DURATION;
const SCENE_RECT = Object.freeze({ x: 182, y: 52, w: 596, h: 596 });
const ALL_SCENES = [...SCENES_BATCH_1, ...SCENES_BATCH_2, ...SCENES_BATCH_3];
const root = document.getElementById("mv-root");
const stage = document.getElementById("mv-stage");
const canvas = document.getElementById("vector-stage");
const svgHost = document.getElementById("act1-svg-host");
const webglHost = document.getElementById("p5-webgl-host");
canvas.width = 960 * renderScale;
canvas.height = 720 * renderScale;
const ctx = canvas.getContext("2d");
const act1SvgLayer = createAct1SvgLayer(svgHost);

const vfs = window.__MV_VFS__ || {};
const bundleBytes = Number(vfs.exactBytes ?? document.querySelector('meta[name="bundle-bytes"]')?.content);
const bundleInfo = Object.freeze({
  filename: vfs.filename || document.querySelector('meta[name="bundle-filename"]')?.content || "pelican-6000-mv.html",
  exactBytes: Number.isFinite(bundleBytes) && bundleBytes > 0 ? bundleBytes : 2048000,
});

const bakedCache = new Map();
let miniatures = null;
let p5Instance = null;
let fbPool = null;
let bakeTick = 0;
let gpuFailed = false;
let disposed = false;
let frameRequest = 0;
let clickSnapshot = null;
let started = false;
let paused = true;
let playIntent = 0;
const requestedTime = parseFloat(params.get("t") || "0");
let position = clamp(Number.isFinite(requestedTime) ? requestedTime : 0, 0, TOTAL_DURATION);
let clockAnchor = performance.now();
const promptEpoch = clockAnchor;
let lastState = null;
let audioState = { playing: false, muted: false, ready: false, mode: "silent" };

const audioEngine = createAudioEngine({
  audioBase64: () => AUDIO_MDP3_B64,
  onStateChange(state) {
    audioState = state;
    requestPaint();
  },
});

function makeCanvas(width, height = width) {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  return offscreen;
}

function disableWebgl(error) {
  if (gpuFailed) return;
  gpuFailed = true;
  try { fbPool?.dispose(); } catch { /* A lost context may already own no resources. */ }
  fbPool = null;
  bakedCache.clear();
  queueMicrotask(() => {
    try { p5Instance?.remove(); } catch { /* Cleanup must not interrupt the 2D player. */ }
    p5Instance = null;
    webglHost.replaceChildren();
  });
  console.info("Using Canvas 2D scene rendering.", error?.message || "WebGL unavailable");
  if (!disposed) requestPaint();
}

async function initializeWebgl() {
  // Keep optional GPU imports inside the boundary: import/setup failures must
  // leave the vector player and its deterministic Canvas 2D bakes available.
  try {
    try { localStorage.setItem(`${navigator.language}-2.4.0`, "{}"); } catch { /* Storage may be disabled. */ }
    if (!window.__MV_P5_TRANSLATIONS_LOCAL__) {
      const origFetch = window.fetch.bind(window);
      const documentURL = new URL(document.baseURI);
      const basePath = new URL(".", documentURL).pathname;
      window.fetch = function(input, init) {
        try {
          const requestURL = new URL(typeof input === "string" || input instanceof URL ? input : input.url, documentURL);
          const method = (init?.method || input?.method || "GET").toUpperCase();
          const sameOrigin = requestURL.protocol === documentURL.protocol && requestURL.host === documentURL.host;
          const localPath = sameOrigin && requestURL.pathname.startsWith(basePath)
            ? decodeURIComponent(requestURL.pathname.slice(basePath.length)) : "";
          const files = window.__MV_VFS__?.files;
          const inVfs = sameOrigin && files && [localPath, decodeURIComponent(requestURL.pathname).replace(/^\/+/, "")]
            .some((path) => Object.hasOwn(files, path));
          const localTranslation = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*\.json$/i.test(localPath);
          const cdnTranslation = requestURL.hostname === "cdn.jsdelivr.net"
            && /^\/npm\/p5(?:@[^/]+)?\/(?:[^/]+\/)*translations\/.+\/extracted\.json$/.test(requestURL.pathname);
          if (["GET", "HEAD"].includes(method) && !inVfs && (localTranslation || cdnTranslation)) {
            return Promise.resolve(new Response(method === "HEAD" ? null : "{}", {
              status: 200, headers: { "Content-Type": "application/json" },
            }));
          }
        } catch { /* Preserve native handling of other requests. */ }
        return origFetch(input, init);
      };
      window.__MV_P5_TRANSLATIONS_LOCAL__ = true;
    }
    const { default: p5 } = await import("../vendor/p5.esm.min.js");
    const [brush, { createFramebufferPool }] = await Promise.all([
      import("../vendor/p5.brush.esm.js"),
      import("./render/framebuffer-pool.js"),
    ]);
    if (disposed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        disableWebgl(new Error("WebGL setup timed out"));
        resolve();
      }, 5000);
      const finish = () => { clearTimeout(timer); resolve(); };
      try {
        p5Instance = new p5((p) => {
          p.setup = () => {
            try {
              if (gpuFailed || disposed) return;
              p.pixelDensity(1);
              p.setAttributes({ alpha: true, antialias: true, preserveDrawingBuffer: true });
              p.createCanvas(1000, 1000, p.WEBGL);
              p.noLoop();
              fbPool = createFramebufferPool(p, 4);
              p.canvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                disableWebgl(new Error("WebGL context lost"));
              }, { once: true });
              bakedCache.clear();
              requestPaint();
            } catch (error) {
              disableWebgl(error);
            } finally {
              finish();
            }
          };
          p.draw = () => {};
          brush.instance(p);
        }, webglHost);
      } catch (error) {
        disableWebgl(error);
        finish();
      }
    });
  } catch (error) {
    disableWebgl(error);
  }
}

function getBakedCanvas(sceneIndex, scene) {
  if (bakedCache.has(sceneIndex)) return bakedCache.get(sceneIndex);
  const bakedCanvas = makeCanvas(1000);
  const bakeCtx = bakedCanvas.getContext("2d");
  if (fbPool && p5Instance && !gpuFailed) {
    try {
      const slot = fbPool.acquireBakedSlot(sceneIndex, scene, ++bakeTick);
      const layer = slot.layer2d?.canvas || slot.layer2d?.elt || fbPool.getSlot2dCanvas(sceneIndex);
      if (layer) bakeCtx.drawImage(layer, 0, 0, 1000, 1000);
      if (slot.fb) {
        const p = p5Instance;
        p.push();
        try {
          p.clear();
          p.resetMatrix();
          p.ortho(-500, 500, -500, 500, -2000, 2000);
          p.imageMode(p.CORNER);
          p.noTint();
          p.image(slot.fb, -500, -500, 1000, 1000);
        } finally {
          p.pop();
        }
        // A tiny readback checks the GPU result once per bake, not every frame.
        const probe = makeCanvas(16);
        const probeCtx = probe.getContext("2d", { willReadFrequently: true });
        probeCtx.drawImage(p.canvas, 0, 0, 16, 16);
        const pixels = probeCtx.getImageData(0, 0, 16, 16).data;
        let hasPaint = false;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] && (pixels[i] || pixels[i + 1] || pixels[i + 2])) {
            hasPaint = true;
            break;
          }
        }
        if (hasPaint) bakeCtx.drawImage(p.canvas, 0, 0, 1000, 1000);
        else if (!layer) throw new Error("Empty framebuffer bake");
      } else if (!layer) {
        throw new Error("Scene framebuffer has no Canvas 2D fallback");
      }
      bakedCache.set(sceneIndex, bakedCanvas);
      return bakedCanvas;
    } catch (error) {
      disableWebgl(error);
      bakeCtx.clearRect(0, 0, 1000, 1000);
    }
  }
  bakeCtx.save();
  try { scene.bake2D(bakeCtx, scene); }
  finally { bakeCtx.restore(); }
  bakedCache.set(sceneIndex, bakedCanvas);
  return bakedCanvas;
}

function makeSceneContext(state, scene, bakedCanvas) {
  return {
    ...state,
    state,
    scene,
    sceneDef: scene,
    meta: scene.meta || state.sceneMeta,
    t: state.realT,
    time: state.realT,
    localT: state.sceneLocalT,
    progress: state.sceneProgress,
    width: 1000,
    height: 1000,
    bakedCanvas,
    rng: createSeededRng(1000 + state.sceneIndex * 97 + Math.floor(state.realT * 60)),
  };
}

function buildMiniatures() {
  return ALL_SCENES.map((scene, sceneIndex) => {
    const meta = scene.meta || SCENES_META[sceneIndex];
    const midpoint = (meta.startT + meta.endT) / 2;
    const state = getTimelineState(midpoint, AUDIO_TELEMETRY);
    const baked = makeCanvas(200);
    const bakeCtx = baked.getContext("2d");
    bakeCtx.save();
    bakeCtx.scale(0.2, 0.2);
    try { scene.bake2D(bakeCtx, scene); }
    finally { bakeCtx.restore(); }
    const thumbnail = makeCanvas(200);
    const thumbCtx = thumbnail.getContext("2d");
    thumbCtx.save();
    thumbCtx.scale(0.2, 0.2);
    try { scene.drawDynamic(thumbCtx, makeSceneContext(state, scene, baked)); }
    finally { thumbCtx.restore(); }
    return thumbnail;
  });
}

function promptOpacity() {
  if (started || !paused || params.has("t")) return 0;
  return 0.78 * clamp((6500 - (performance.now() - promptEpoch)) / 1800, 0, 1);
}

function drawPrompt() {
  const opacity = promptOpacity();
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(9,9,11,0.72)";
  ctx.fillRect(74, 678, 812, 30);
  ctx.fillStyle = "#e7dfce";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '13px system-ui, "Noto Sans CJK SC", sans-serif';
  ctx.fillText("点击画布或按 Space 播放 · 双击/F 全屏 · M 静音 · R 重播 · ←/→ 快进退 5s", 480, 693, 792);
  ctx.restore();
}

function renderFrameAt(t, showPrompt = false) {
  const numericTime = Number(t);
  const state = getTimelineState(clamp(Number.isFinite(numericTime) ? numericTime : 0, 0, TOTAL_DURATION), AUDIO_TELEMETRY);
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, 960, 720);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, 960, 720);
  svgHost.hidden = state.realT > 4.40;
  if (!svgHost.hidden) act1SvgLayer.renderAt(state.realT);
  ctx.save();
  try {
    switch (state.act) {
      case "act1":
        renderAct1Overlay(ctx, { ...state, act1SvgLayer });
        renderDownloadCapsuleAndReveal(ctx, state, bundleInfo);
        break;
      case "shutter":
        renderAct2Accordion(ctx, state);
        renderAct1Overlay(ctx, { ...state, act1SvgLayer });
        renderDownloadCapsuleAndReveal(ctx, state, bundleInfo);
        break;
      case "act2":
        renderAct2Accordion(ctx, state);
        renderCuratorPlaque(ctx, state);
        renderDownloadCapsuleAndReveal(ctx, state, bundleInfo);
        break;
      case "act3": {
        const scene = ALL_SCENES[state.sceneIndex];
        const bakedCanvas = getBakedCanvas(state.sceneIndex, scene);
        const sceneCtx = makeSceneContext(state, scene, bakedCanvas);
        renderGalleryWallBackdrop(ctx, state, SCENE_RECT);
        ctx.save();
        try {
          ctx.beginPath();
          ctx.rect(SCENE_RECT.x, SCENE_RECT.y, SCENE_RECT.w, SCENE_RECT.h);
          ctx.clip();
          ctx.translate(SCENE_RECT.x, SCENE_RECT.y);
          ctx.scale(SCENE_RECT.w / 1000, SCENE_RECT.h / 1000);
          scene.drawDynamic(ctx, sceneCtx);
        } finally { ctx.restore(); }
        renderGalleryFrameAndLighting(ctx, state, SCENE_RECT, sceneCtx);
        renderSpatialLyrics(ctx, state, SCENE_RECT);
        renderCuratorPlaque(ctx, state);
        renderDownloadCapsuleAndReveal(ctx, state, bundleInfo);
        break;
      }
      case "act4":
        if (!miniatures) miniatures = buildMiniatures();
        renderGalleryWallBackdrop(ctx, state, SCENE_RECT);
        renderAct4GalleryWall(ctx, state, SCENE_RECT, miniatures);
        renderSpatialLyrics(ctx, state, SCENE_RECT);
        renderCuratorPlaque(ctx, state);
        renderDownloadCapsuleAndReveal(ctx, state, bundleInfo);
        break;
    }
  } finally { ctx.restore(); }
  if (showPrompt) drawPrompt();
  lastState = state;
  return state;
}

function currentTime() {
  if (paused) return position;
  if (audioEngine.isPlaying()) return clamp(audioEngine.getCurrentTime(), 0, TOTAL_DURATION);
  return clamp(position + (performance.now() - clockAnchor) / 1000, 0, TOTAL_DURATION);
}

function requestPaint() {
  if (!disposed && !frameRequest) frameRequest = requestAnimationFrame(tick);
}

function tick() {
  frameRequest = 0;
  if (disposed) return;
  const t = currentTime();
  renderFrameAt(t, true);
  if (!paused && t >= TOTAL_DURATION) {
    position = TOTAL_DURATION;
    paused = true;
    playIntent++;
    audioEngine.pause();
  }
  if (!paused || promptOpacity() > 0) requestPaint();
}

async function play() {
  if (disposed) return false;
  if (!paused) return true;
  if (position >= TOTAL_DURATION) position = 0;
  const intent = ++playIntent;
  started = true;
  paused = false;
  clockAnchor = performance.now();
  audioEngine.seek(position);
  // Invoke before yielding so AudioContext resumes inside the user gesture.
  const audioStart = audioEngine.unlockAndPlay();
  requestPaint();
  try {
    const ready = await audioStart;
    if (disposed || paused || intent !== playIntent) return false;
    if (ready) {
      // Catch up after decoding instead of jumping the film back to the click.
      const catchUp = clamp(position + (performance.now() - clockAnchor) / 1000, 0, TOTAL_DURATION);
      audioEngine.seek(catchUp);
    }
  } catch {
    // The performance clock continues the film when audio is unavailable.
  }
  return !paused;
}

function pause() {
  position = currentTime();
  paused = true;
  playIntent++;
  audioEngine.pause();
  requestPaint();
  return getState();
}

function togglePlay() {
  return paused ? play() : pause();
}

function seek(t) {
  const target = Number(t);
  position = clamp(Number.isFinite(target) ? target : currentTime(), 0, TOTAL_DURATION);
  clockAnchor = performance.now();
  audioEngine.seek(position);
  renderFrameAt(position, true);
  requestPaint();
  return getState();
}

function toggleMute() {
  const muted = audioEngine.toggleMute();
  requestPaint();
  return muted;
}

function getState() {
  return {
    ...getTimelineState(currentTime(), AUDIO_TELEMETRY),
    started,
    paused,
    playing: !paused,
    muted: audioEngine.isMuted(),
    audioReady: audioEngine.isReady(),
    audioMode: audioEngine.getMode(),
    audioError: audioState.error || null,
    renderedTime: lastState?.realT ?? position,
  };
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
    else if (root.requestFullscreen) await root.requestFullscreen();
    else root.webkitRequestFullscreen?.();
  } catch { /* Fullscreen may be unavailable in an embedded browser. */ }
}

stage.addEventListener("click", (event) => {
  if (event.detail > 1) return;
  clickSnapshot = { paused, started, time: currentTime(), at: performance.now() };
  // Resume AudioContext synchronously in the gesture, including on mobile.
  void togglePlay();
});
stage.addEventListener("dblclick", (event) => {
  event.preventDefault();
  // Undo the first click's playback change while preserving elapsed film time.
  if (clickSnapshot) {
    const snapshot = clickSnapshot;
    clickSnapshot = null;
    if (snapshot.paused) {
      pause();
      started = snapshot.started;
      seek(snapshot.time);
    } else {
      seek(snapshot.time + (performance.now() - snapshot.at) / 1000);
      void play();
    }
  }
  void toggleFullscreen();
});
window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target?.isContentEditable) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "")) return;
  const key = event.key.toLowerCase();
  if (![" ", "spacebar", "f", "m", "r", "arrowleft", "arrowright"].includes(key)) return;
  event.preventDefault();
  if (event.repeat && key !== "arrowleft" && key !== "arrowright") return;
  clickSnapshot = null;
  if (key === " " || key === "spacebar") void togglePlay();
  else if (key === "f") void toggleFullscreen();
  else if (key === "m") toggleMute();
  else if (key === "r") { seek(0); void play(); }
  else seek(currentTime() + (key === "arrowleft" ? -5 : 5));
});

window.renderAt = renderFrameAt;
window.mvPlayer = { play, pause, togglePlay, seek, toggleMute, getState, getRenderScale: () => renderScale };
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  disposed = true;
  playIntent++;
  cancelAnimationFrame(frameRequest);
  clickSnapshot = null;
  audioEngine.dispose();
  try { fbPool?.dispose(); } catch { /* A lost GPU context is already released. */ }
  try { p5Instance?.remove(); } catch { /* Finish releasing the other resources. */ }
  act1SvgLayer.destroy?.();
  bakedCache.clear();
  miniatures = null;
});

audioEngine.seek(position);
renderFrameAt(position, true);
requestPaint();
void initializeWebgl();
Promise.resolve().then(() => audioEngine.prewarm()).catch(() => {});
