import { describe, expect, it } from "vitest";
import type { Corpse } from "../src/effects";
import type { Debris, GameState } from "../src/game/types";
import { advance } from "../src/game/step";
import { calmBurst, calmNewEffects, muzzleFlashScale, shakeOffset } from "../src/motion";
import { gameplaySnapshot, newRun, NO_INSETS, startNight, VIEW } from "./harness";

const particle = (kind: Debris["kind"], extra: Partial<Debris> = {}): Debris => ({
  kind,
  x: 0,
  y: 0,
  vx: 100,
  vy: -80,
  life: 1,
  maxLife: 1,
  size: 10,
  spin: 10,
  color: "#fff",
  ...extra,
});

describe("screen shake", () => {
  it("shakes normally, never with reduced motion", () => {
    expect(shakeOffset(6, false, () => 1)).toBe(6);
    expect(shakeOffset(6, false, () => 0)).toBe(-6);
    expect(shakeOffset(6, true, () => 1)).toBe(0);
    expect(shakeOffset(0, false, () => 1)).toBe(0);
  });

  it("dims the muzzle flash with reduced motion", () => {
    expect(muzzleFlashScale(false)).toBe(1);
    expect(muzzleFlashScale(true)).toBeLessThan(1);
  });
});

describe("calmer particles", () => {
  it("drops flashing sparks, halves chips/dust/smoke, and slows the rest", () => {
    const burst = [
      particle("spark"),
      particle("fire"),
      ...Array.from({ length: 16 }, () => particle("chip")),
      ...Array.from({ length: 6 }, () => particle("dust")),
      ...Array.from({ length: 3 }, () => particle("smoke")),
    ];
    const kept = calmBurst(burst);
    const count = (k: Debris["kind"]) => kept.filter((d) => d.kind === k).length;
    expect(count("spark")).toBe(0);
    expect(count("fire")).toBe(1);
    expect(count("chip")).toBe(8);
    expect(count("dust")).toBe(3);
    expect(count("smoke")).toBe(2);
    for (const d of kept) {
      expect(d.size).toBeLessThan(10);
      if (d.kind !== "fire") {
        expect(Math.abs(d.vx)).toBe(50);
        expect(Math.abs(d.vy)).toBe(40);
      }
    }
  });

  it("always keeps at least one of each kind in a burst, so hits stay visible", () => {
    const kept = calmBurst([particle("dust"), particle("chip")]);
    expect(kept.map((d) => d.kind)).toEqual(["dust", "chip"]);
  });

  it("only calms newly spawned effects, and only when on", () => {
    const state = { debris: [] as Debris[], corpses: [] as Corpse[] } as GameState;
    state.debris.push(particle("chip"), particle("chip"));
    calmNewEffects(state, false); // off: untouched, but marked as seen
    expect(state.debris).toHaveLength(2);
    expect(state.debris[0]!.vx).toBe(100);

    state.debris.push(particle("chip"), particle("chip"), particle("spark"));
    state.corpses.push({ kind: "raider", x: 0, y: 0, w: 22, h: 34, vx: 50, dir: 1, t: 0, life: 0.65, dusted: false });
    calmNewEffects(state, true);
    // the two old chips stay as they were; of the 3 new particles one chip survives
    expect(state.debris).toHaveLength(3);
    expect(state.debris.slice(0, 2).every((d) => d.vx === 100)).toBe(true);
    expect(state.debris[2]!.vx).toBe(50);
    expect(state.corpses[0]!.vx).toBe(20);

    calmNewEffects(state, true); // nothing new: no double calming
    expect(state.debris[2]!.vx).toBe(50);
    expect(state.corpses[0]!.vx).toBe(20);
  });

  it("is purely cosmetic: a night plays out identically with reduced motion on", () => {
    const run = (reduced: boolean) => {
      const s = newRun();
      startNight(s);
      for (let i = 0; i < 1800; i++) {
        advance(s, {}, 1 / 60, VIEW, NO_INSETS);
        calmNewEffects(s, reduced);
      }
      return gameplaySnapshot(s);
    };
    const normal = run(false);
    const calm = run(true);
    expect(calm).toEqual(normal);
  });
});
