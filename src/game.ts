import { setAudioPaused } from "./audio";
import { MAX_FRAME_SECONDS } from "./game/constants";
import { tryBuyUpgrade, tryHire } from "./game/shop";
import { freshState } from "./game/state";
import { canUserPause, stepFrame } from "./game/pause";
import type { ViewInsets } from "./game/types";
import { confirmShopReady } from "./game/waves";
import { createInput } from "./input";
import { calmNewEffects } from "./motion";
import { render } from "./render";
import { setSfxViewport, sfx } from "./sfx";
import { getShopLayout, hitTestShop } from "./shopLayout";

export function createGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const input = createInput();
  let state = freshState();
  let last = performance.now();
  let raf = 0;
  let pausedForOrientation = false;
  let pausedForUi = false;
  /** Player pause (button, Esc/P) or auto-pause when the page is hidden */
  let pausedByUser = false;
  const syncAudioPause = () => setAudioPaused(pausedByUser || pausedForUi || pausedForOrientation);
  /** Screen px covered by on-screen controls; the camera may scroll past the world edge by this much */
  const insets = { left: 0, right: 0 };

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    const cssW = rect?.width ?? window.innerWidth;
    const cssH = rect?.height ?? window.innerHeight - 72;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setSfxViewport(cssW, cssH);
  };

  resize();
  window.addEventListener("resize", resize);
  // Layout can change without a window resize (header reflow, fullscreen transitions
  // measured mid-animation) — track the stage itself so the buffer never stretches
  if (canvas.parentElement && "ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas.parentElement);
  }

  const canvasPoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * (canvas.clientWidth || rect.width),
      y: ((e.clientY - rect.top) / rect.height) * (canvas.clientHeight || rect.height),
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (state.status !== "playing" || state.dayPhase !== "shop") return;
    if (pausedForOrientation) return;
    const { x, y } = canvasPoint(e);
    const viewW = canvas.clientWidth || canvas.width;
    const viewH = canvas.clientHeight || canvas.height;
    const hit = hitTestShop(getShopLayout(viewW, viewH), x, y);
    if (!hit) return;
    e.preventDefault();
    sfx.uiClick();
    if (hit.kind === "upgrade") tryBuyUpgrade(state, hit.id);
    else if (hit.kind === "hire") tryHire(state, hit.id);
    else confirmShopReady(state);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (state.status !== "playing" || state.dayPhase !== "shop") {
      canvas.style.cursor = "default";
      return;
    }
    const { x, y } = canvasPoint(e);
    const viewW = canvas.clientWidth || canvas.width;
    const viewH = canvas.clientHeight || canvas.height;
    const hit = hitTestShop(getShopLayout(viewW, viewH), x, y);
    canvas.style.cursor = hit ? "pointer" : "default";
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);

  const frame = (now: number) => {
    // Frames over 100ms (tab switch, hitch) are capped; advance() sub-steps the rest.
    const elapsedSec = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    const view = { width: canvas.clientWidth || canvas.width, height: canvas.clientHeight || canvas.height };
    stepFrame(state, input.keys, elapsedSec, view, insets, {
      user: pausedByUser,
      orientation: pausedForOrientation,
      ui: pausedForUi,
    });
    // reduced motion: calm the particles this frame spawned (cosmetic only)
    calmNewEffects(state);
    render(ctx, state);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);

  return {
    getState: () => state,
    start() {
      state = freshState("playing");
      pausedForOrientation = false;
      pausedByUser = false;
      input.clearKeys();
      syncAudioPause();
      sfx.runStarted();
    },
    restart() {
      state = freshState("playing");
      pausedForOrientation = false;
      pausedByUser = false;
      input.clearKeys();
      syncAudioPause();
      sfx.runStarted();
    },
    /**
     * Player pause: freezes the world and the run clock, silences audio.
     * Only possible during a run; returns whether the pause state is now `paused`.
     */
    setPaused(paused: boolean): boolean {
      if (paused && !canUserPause(state.status)) return false;
      pausedByUser = paused;
      input.clearKeys(); // nothing held across a pause (e.g. a key released while hidden)
      syncAudioPause();
      return true;
    },
    isPaused: () => pausedByUser,
    /** CSS px of the stage covered by touch controls (0 when hidden) */
    setViewInsets(next: ViewInsets) {
      insets.left = Math.max(0, next.left);
      insets.right = Math.max(0, next.right);
    },
    /** Freeze the world while a DOM dialog (e.g. fullscreen help) is open */
    setUiPaused(paused: boolean) {
      pausedForUi = paused;
      input.clearKeys();
      syncAudioPause();
    },
    setOrientationPaused(paused: boolean) {
      pausedForOrientation = paused;
      syncAudioPause();
    },
    setKey(code: string, down: boolean) {
      input.setKey(code, down);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      input.dispose();
    },
  };
}

// Public API (main.ts, effects.ts, helpers.ts import from "./game")
export { formatRunTime } from "./game/format";
export { isBruteSlot } from "./game/waves";
export type {
  CarryKind,
  ViewSize,
  Debris,
  Enemy,
  Floater,
  GameState,
  Player,
  Projectile,
  ViewInsets,
} from "./game/types";
