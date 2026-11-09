/**
 * Pausing: why the world may be frozen, and what one rendered frame does in
 * each case. Kept headless (no DOM) so tests can prove the run clock never
 * advances while paused.
 */
import type { KeyState } from "../input";
import { updateFloaters } from "./particles";
import { advance } from "./step";
import type { GameState, ViewInsets, ViewSize } from "./types";

/** Any true reason freezes the simulation (and with it the run clock). */
export type PauseReasons = {
  /** The player paused (button, Esc/P) or the page was hidden (auto-pause) */
  user: boolean;
  /** Phone held in portrait — the rotate gate is up */
  orientation: boolean;
  /** A DOM dialog is open over the game (e.g. fullscreen help) */
  ui: boolean;
};

export function anyPaused(reasons: PauseReasons): boolean {
  return reasons.user || reasons.orientation || reasons.ui;
}

/** The player can pause only during a run (prep, night, or the shop). */
export function canUserPause(status: GameState["status"]): boolean {
  return status === "playing";
}

export function shouldSimulate(status: GameState["status"], reasons: PauseReasons): boolean {
  return status === "playing" && !anyPaused(reasons);
}

export type FrameResult = "simulated" | "frozen" | "cosmetic";

/**
 * One rendered frame:
 * - running: advance the simulation by elapsedSec (sub-stepped)
 * - player-paused run: nothing moves at all (a true freeze-frame)
 * - otherwise (menu, end screen, rotate gate, dialog): only banners, floaters
 *   and shake keep easing out, as before
 */
export function stepFrame(
  state: GameState,
  keys: KeyState,
  elapsedSec: number,
  view: ViewSize,
  insets: ViewInsets,
  reasons: PauseReasons,
): FrameResult {
  if (state.status === "playing" && reasons.user) return "frozen";
  if (shouldSimulate(state.status, reasons)) {
    advance(state, keys, elapsedSec, view, insets);
    return "simulated";
  }
  state.bannerLife = Math.max(0, state.bannerLife - elapsedSec);
  updateFloaters(state, elapsedSec);
  state.shake = Math.max(0, state.shake - elapsedSec * 8);
  return "cosmetic";
}
