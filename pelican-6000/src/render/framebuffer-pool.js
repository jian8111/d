// 署名: PRO2H(hadcockulloa@gmail.com)
import * as brush from "../../vendor/p5.brush.esm.js";

const SIZE = 1000;
const HALF = SIZE / 2;

/** Call from the main WEBGL instance's setup, after brush.instance(p).
 * Slots are owned by this pool: callers must not remove their textures.
 * bake2D and bakeBrush are synchronous static-background callbacks.
 */
export function createFramebufferPool(p, maxSlots = 4) {
  if (!p || typeof p.createGraphics !== "function") {
    throw new TypeError("createFramebufferPool requires the main p5 instance");
  }
  const count = Number.isFinite(maxSlots) ? Math.max(1, Math.min(4, Math.trunc(maxSlots))) : 4;
  const slots = [];
  const identities = new WeakMap();
  let nextIdentity = 1;
  let clock = 0;
  let generation = 0;
  let disposed = false;
  let baking = false;

  const identity = (value) => {
    if (!identities.has(value)) identities.set(value, nextIdentity++);
    return identities.get(value);
  };

  function release(slot) {
    try { slot.fb?.remove?.(); }
    finally { slot.layer2d?.remove?.(); }
  }

  try {
    for (let slotIndex = 0; slotIndex < count; slotIndex++) {
      const slot = {
        slotIndex, sceneIndex: -1, lastUsedTick: -1, fb: null, layer2d: null,
        bakedHash: null, lastError: null,
      };
      slots.push(slot);
      slot.layer2d = p.createGraphics(SIZE, SIZE);
      if (!slot.layer2d?.drawingContext || !slot.layer2d?.elt) {
        throw new Error("p5.createGraphics did not return a Canvas 2D layer");
      }
      slot.layer2d.pixelDensity?.(1);
      try {
        // Never allocate from p5.Graphics: all four share the main GL context.
        slot.fb = p.createFramebuffer({ width: SIZE, height: SIZE, density: 1, antialias: true });
      } catch (error) {
        // Canvas compositing remains usable on devices without framebuffer support.
        slot.lastError = error;
      }
    }
  } catch (error) {
    for (const slot of slots) {
      try { release(slot); } catch { /* Release the remaining slots too. */ }
    }
    throw error;
  }

  function assertLive() {
    if (disposed) throw new Error("Framebuffer pool has been disposed");
  }

  function hashScene(sceneDef) {
    const visited = new WeakSet();
    // Track callback identity as well as data, so hot-reloaded scene definitions
    // and palette/version changes invalidate the corresponding static bake.
    return `${generation}:${JSON.stringify(sceneDef, (_key, value) => {
      if (typeof value === "function") return `function:${identity(value)}`;
      if (typeof value === "bigint") return `${value}n`;
      if (value && typeof value === "object") {
        if (visited.has(value)) return `reference:${identity(value)}`;
        visited.add(value);
        if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
          return `object:${identity(value)}`;
        }
      }
      return value;
    })}`;
  }

  function bake(slot, sceneDef) {
    const layer = slot.layer2d;
    const ctx = layer.drawingContext;
    // Reset transforms before clearing; never depend on callback state from a
    // previous tenant of this LRU slot. Canvas save/restore isolates each bake.
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, SIZE, SIZE);
      if (typeof sceneDef.bake2D === "function") sceneDef.bake2D(ctx, sceneDef);
    } finally { ctx.restore(); }
    if (!slot.fb) return;

    let begun = false;
    let pushed = false;
    try {
      slot.fb.begin();
      begun = true;
      p.push();
      pushed = true;
      p.clear();
      p.resetMatrix?.();
      p.ortho?.(-HALF, HALF, -HALF, HALF, -2000, 2000);
      if (typeof p.imageMode === "function") p.imageMode(p.CORNER);
      p.noTint?.();
      p.image(layer, -HALF, -HALF, SIZE, SIZE);
      if (typeof sceneDef.bakeBrush === "function") {
        let brushPushed = false;
        try {
          brush.load(slot.fb);
          p.push();
          brushPushed = true;
          p.translate(-HALF, -HALF);
          sceneDef.bakeBrush(p, brush, sceneDef);
        } finally {
          try { if (brushPushed) p.pop(); }
          finally { brush.load(); }
        }
      }
    } finally {
      try { if (pushed) p.pop(); }
      finally { if (begun) slot.fb.end(); }
    }
  }

  function acquireBakedSlot(sceneIndex, sceneDef = {}, tick) {
    assertLive();
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= 20) {
      throw new RangeError("sceneIndex must be a zero-based scene index in 0..19");
    }
    if (!sceneDef || typeof sceneDef !== "object") throw new TypeError("sceneDef must be an object");
    if (baking) throw new Error("Scene bake callbacks cannot acquire another pool slot");
    // A monotonic logical clock keeps LRU correct after seeking the MV backward
    // and when several scenes are acquired on the same animation tick.
    clock = Math.max(clock + 1, Number.isFinite(tick) ? tick : 0);
    let slot = slots.find((candidate) => candidate.sceneIndex === sceneIndex);
    if (!slot) slot = slots.find((candidate) => candidate.sceneIndex === -1);
    if (!slot) slot = slots.reduce((oldest, candidate) => candidate.lastUsedTick < oldest.lastUsedTick ? candidate : oldest);
    const hash = hashScene(sceneDef);
    if (slot.sceneIndex === sceneIndex && slot.bakedHash === hash) {
      slot.lastUsedTick = clock;
      return slot;
    }
    slot.sceneIndex = -1;
    slot.bakedHash = null;
    baking = true;
    try {
      bake(slot, sceneDef);
      slot.sceneIndex = sceneIndex;
      slot.bakedHash = hash;
      slot.lastUsedTick = clock;
      slot.lastError = slot.fb ? null : slot.lastError;
      return slot;
    } catch (error) {
      slot.lastError = error;
      // Leave failed bakes invalid: the next acquisition retries the callback.
      throw error;
    } finally { baking = false; }
  }

  function getSlotTexture(sceneIndex) {
    assertLive();
    const slot = slots.find((candidate) => candidate.sceneIndex === sceneIndex && candidate.bakedHash !== null);
    return slot ? slot.fb ?? slot.layer2d : null;
  }

  function getSlot2dCanvas(sceneIndex) {
    assertLive();
    const slot = slots.find((candidate) => candidate.sceneIndex === sceneIndex && candidate.bakedHash !== null);
    // Deliberately keep this crisp, unmodified Canvas background; do not read
    // pixels back from the GPU every frame (which would stall the compositor).
    return slot?.layer2d.elt ?? null;
  }

  function invalidateAll() {
    assertLive();
    if (baking) throw new Error("Cannot invalidate the pool during a scene bake");
    generation++;
    for (const slot of slots) {
      slot.sceneIndex = -1;
      slot.bakedHash = null;
      slot.lastUsedTick = -1;
    }
  }

  function dispose() {
    if (disposed) return;
    if (baking) throw new Error("Cannot dispose the pool during a scene bake");
    disposed = true;
    let firstError;
    for (const slot of slots) {
      try { release(slot); } catch (error) { firstError ??= error; }
      slot.fb = null;
      slot.layer2d = null;
      slot.sceneIndex = -1;
      slot.bakedHash = null;
    }
    if (firstError) throw firstError;
  }

  return { slots, acquireBakedSlot, getSlotTexture, getSlot2dCanvas, invalidateAll, dispose };
}
