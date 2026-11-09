import { describe, expect, it } from "vitest";
import {
  anyPaused,
  canUserPause,
  shouldSimulate,
  stepFrame,
  type PauseReasons,
} from "../src/game/pause";
import type { GameState } from "../src/game/types";
import { NO_INSETS, VIEW, gameplaySnapshot, newRun, play, startNight } from "./harness";

const RUNNING: PauseReasons = { user: false, orientation: false, ui: false };
const USER: PauseReasons = { ...RUNNING, user: true };

/** Feed `seconds` of 60fps frames through stepFrame with the given pause reasons. */
function frames(s: GameState, seconds: number, reasons: PauseReasons) {
  const n = Math.round(seconds * 60);
  const results = new Set<string>();
  for (let i = 0; i < n; i++) results.add(stepFrame(s, {}, 1 / 60, VIEW, NO_INSETS, reasons));
  return results;
}

describe("pause decisions", () => {
  it("simulates only a playing run with no pause reason", () => {
    expect(shouldSimulate("playing", RUNNING)).toBe(true);
    for (const key of ["user", "orientation", "ui"] as const) {
      expect(shouldSimulate("playing", { ...RUNNING, [key]: true })).toBe(false);
      expect(anyPaused({ ...RUNNING, [key]: true })).toBe(true);
    }
    expect(anyPaused(RUNNING)).toBe(false);
    for (const status of ["menu", "won", "lost"] as const) {
      expect(shouldSimulate(status, RUNNING)).toBe(false);
    }
  });

  it("lets the player pause only during a run", () => {
    expect(canUserPause("playing")).toBe(true);
    expect(canUserPause("menu")).toBe(false);
    expect(canUserPause("won")).toBe(false);
    expect(canUserPause("lost")).toBe(false);
  });
});

describe("stepFrame while paused", () => {
  it("freezes a night completely: run clock, raiders, cannons, everything", () => {
    const s = newRun();
    startNight(s);
    play(s, 4); // raiders on the field, cannons firing
    expect(s.enemies.length).toBeGreaterThan(0);

    const before = gameplaySnapshot(s);
    const elapsedBefore = s.elapsed;
    const results = frames(s, 30, USER); // half a minute "away"

    expect(results).toEqual(new Set(["frozen"]));
    expect(gameplaySnapshot(s)).toEqual(before);
    expect(s.elapsed).toBe(elapsedBefore);
  });

  it("resumes exactly where it left off, and only running time counts", () => {
    // runs are played one after the other: enemy ids come from a shared counter
    // that each fresh run resets
    const paused = newRun();
    startNight(paused);
    play(paused, 3);
    frames(paused, 20, USER); // 20s paused mid-night
    play(paused, 3);
    const pausedSnap = gameplaySnapshot(paused);

    const straight = newRun();
    startNight(straight);
    play(straight, 6); // the same 6s of play, no pause

    expect(pausedSnap).toEqual(gameplaySnapshot(straight));
    expect(paused.runTime).toBeCloseTo(straight.runTime, 9);
  });

  it("is harmless in the shop (already frozen there) and resumes cleanly", () => {
    const s = newRun();
    s.dayPhase = "shop";
    const clock = s.runTime;
    frames(s, 5, USER);
    expect(s.runTime).toBe(clock);
    expect(s.dayPhase).toBe("shop");
    frames(s, 1, RUNNING); // shop still doesn't count toward the run clock
    expect(s.runTime).toBe(clock);
  });

  it("rotate-gate and dialog pauses also stop the clock, but let banners fade", () => {
    for (const reasons of [
      { ...RUNNING, orientation: true },
      { ...RUNNING, ui: true },
    ]) {
      const s = newRun();
      play(s, 1);
      const clock = s.runTime;
      const banner = s.bannerLife;
      expect(frames(s, 1, reasons)).toEqual(new Set(["cosmetic"]));
      expect(s.runTime).toBe(clock);
      expect(s.bannerLife).toBeLessThan(banner);
    }
  });

  it("does nothing special once a run is over", () => {
    const s = newRun();
    s.status = "won";
    const clock = s.runTime;
    expect(frames(s, 1, USER)).toEqual(new Set(["cosmetic"]));
    expect(s.runTime).toBe(clock);
  });
});
