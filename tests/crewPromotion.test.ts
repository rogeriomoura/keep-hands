import { describe, expect, it } from "vitest";
import { tryHire, tryPromote } from "../src/game/shop";
import { freshState } from "../src/game/state";
import { advance } from "../src/game/step";
import type { GameState } from "../src/game/types";
import { promoteHelper, spawnHelper } from "../src/helpers";
import { hireCost, PROMOTE_DEFS } from "../src/hires";
import { NO_INSETS, VIEW } from "./harness";

/** Act 2 in a long prep: crew can work, no raiders arrive. */
function act2Prep(gold = 0): GameState {
  const s = freshState("playing", 2);
  s.dayPhase = "prep";
  s.waveTimer = 999;
  s.gold = gold;
  return s;
}

/** Seconds of play until `done` holds (fails the test if it never does). */
function timeUntil(s: GameState, done: () => boolean, max = 60): number {
  const step = 1 / 60;
  for (let t = 0; t < max; t += step) {
    if (done()) return t;
    advance(s, {}, step, VIEW, NO_INSETS);
  }
  throw new Error("condition never reached");
}

/** One empty tower (the runner's only job); the rest stay full. */
function emptyOneTower(s: GameState) {
  for (const t of s.world.towers) t.ammo = t.maxAmmo;
  const target = s.world.towers[1]!;
  target.ammo = 0;
  return target;
}

function addCrew(s: GameState, role: "runner" | "mason", veteran: boolean) {
  const h = spawnHelper(s, role);
  if (veteran) promoteHelper(h);
  s.helpers.push(h);
  return h;
}

describe("crew promotions (Act 2)", () => {
  it("a hired helper's card promotes them once, for the listed cost", () => {
    const s = act2Prep(200);
    tryHire(s, "runner");
    expect(s.gold).toBe(200 - hireCost("runner"));
    tryHire(s, "runner"); // same key again → promotion
    const afterPromote = 200 - hireCost("runner") - PROMOTE_DEFS.runner.cost;
    expect(s.gold).toBe(afterPromote);
    expect(s.veterans.runner).toBe(true);
    expect(s.helpers[0]!.veteran).toBe(true);
    expect(s.helpers[0]!.label).toBe("Runner ★");
    tryHire(s, "runner"); // already promoted: nothing more to buy
    expect(s.gold).toBe(afterPromote);
  });

  it("needs the helper hired first, and enough gold", () => {
    const s = act2Prep(200);
    tryPromote(s, "mason");
    expect(s.veterans.mason).toBe(false);
    expect(s.gold).toBe(200);

    const poor = act2Prep(hireCost("mason"));
    tryHire(poor, "mason");
    tryHire(poor, "mason");
    expect(poor.veterans.mason).toBe(false);
  });

  it("doesn't exist in Act 1", () => {
    const s = freshState("playing");
    s.gold = 200;
    tryHire(s, "runner");
    tryHire(s, "runner");
    tryPromote(s, "runner");
    expect(s.gold).toBe(200 - hireCost("runner"));
    expect(s.veterans.runner).toBe(false);
    expect(s.helpers[0]!.veteran).toBe(false);
  });
});

describe("veteran runner", () => {
  it("loads 5 shot per trip instead of 3", () => {
    for (const [veteran, expected] of [[false, 3], [true, 5]] as const) {
      const s = act2Prep();
      const tower = emptyOneTower(s);
      addCrew(s, "runner", veteran);
      timeUntil(s, () => tower.ammo > 0);
      expect(tower.ammo).toBe(expected);
    }
  });

  it("gets the first load up noticeably faster", () => {
    const time = (veteran: boolean) => {
      const s = act2Prep();
      const tower = emptyOneTower(s);
      addCrew(s, "runner", veteran);
      return timeUntil(s, () => tower.ammo > 0);
    };
    expect(time(true)).toBeLessThan(time(false) * 0.85);
  });
});

describe("master mason", () => {
  it("repairs +30 on a wall instead of +18", () => {
    for (const [veteran, gain] of [[false, 18], [true, 30]] as const) {
      const s = act2Prep();
      const wall = s.world.walls[0]!;
      wall.hp = 30;
      addCrew(s, "mason", veteran);
      timeUntil(s, () => wall.hp > 30);
      expect(wall.hp).toBe(30 + gain);
    }
  });

  it("repairs +24 on a tower instead of +14", () => {
    for (const [veteran, gain] of [[false, 14], [true, 24]] as const) {
      const s = act2Prep();
      const tower = s.world.towers[0]!;
      tower.hp = 20;
      addCrew(s, "mason", veteran);
      timeUntil(s, () => tower.hp > 20);
      expect(tower.hp).toBe(20 + gain);
    }
  });

  it("reaches the stonework faster", () => {
    const time = (veteran: boolean) => {
      const s = act2Prep();
      const wall = s.world.walls[2]!; // far wall: a long walk with the stone
      wall.hp = 30;
      addCrew(s, "mason", veteran);
      return timeUntil(s, () => wall.hp > 30);
    };
    expect(time(true)).toBeLessThan(time(false) * 0.85);
  });
});
