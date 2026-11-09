import { afterEach, describe, expect, it, vi } from "vitest";
import { advance, update } from "../src/game/step";
import { updateEnemies } from "../src/game/enemies";
import { spawnEnemy } from "../src/game/waves";
import { tryBuyUpgrade, tryHire, updateShop } from "../src/game/shop";
import { spawnHelper } from "../src/helpers";
import { swingTiming } from "../src/enemyPose";
import { hireCost } from "../src/hires";
import { upgradeCost } from "../src/upgrades";
import type { GameState } from "../src/game/types";
import { NO_INSETS, VIEW, gameplaySnapshot, newRun, play, startNight } from "./harness";

afterEach(() => {
  vi.restoreAllMocks();
});

/** One raider standing at the east wall's face, nothing else in the world. */
function raiderAtWall(): { s: GameState; wall: GameState["world"]["walls"][number] } {
  const s = newRun();
  s.enemies = [];
  spawnEnemy(s); // wave 1, slot 0 → raider with id 1
  const wall = s.world.walls.find((w) => w.id === "curtain-2")!;
  s.enemies[0]!.x = wall.body.x + wall.body.w; // touching the face → attacking
  return { s, wall };
}

/** Times (s) at which the wall took damage over `seconds`, plus the phase right after each hit. */
function hitTimes(seconds: number, dt = 1 / 240) {
  const { s, wall } = raiderAtWall();
  const hits: { t: number; phase: string; dmg: number }[] = [];
  let hp = wall.hp;
  for (let t = dt; t <= seconds; t += dt) {
    updateEnemies(s, dt);
    if (wall.hp < hp) {
      hits.push({ t, phase: s.enemies[0]!.attackPhase, dmg: hp - wall.hp });
      hp = wall.hp;
    }
  }
  return hits;
}

describe("raider swing state machine", () => {
  it("lands the hit at the end of the strike, then recovers", () => {
    const hits = hitTimes(1.2);
    expect(hits.length).toBeGreaterThan(0);
    const first = hits[0]!;
    // first swing scale for enemy id 1, swing 0: 0.9 + ((7 + 0) % 21) / 20 * 0.2 = 0.97
    const t = swingTiming("raider", 0.97);
    expect(first.t).toBeCloseTo(t.windup + t.strike, 2);
    expect(first.phase).toBe("recover");
    expect(first.dmg).toBe(8);
  });

  it("repeats roughly once a second (tempo jitter stays within ±10%)", () => {
    const hits = hitTimes(6);
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < hits.length; i++) {
      const gap = hits[i]!.t - hits[i - 1]!.t;
      expect(gap).toBeGreaterThan(0.89);
      expect(gap).toBeLessThan(1.11);
    }
  });

  it("swing tempo is deterministic: identical hit times in two fresh runs", () => {
    expect(hitTimes(5)).toEqual(hitTimes(5));
  });
});

describe("run clock", () => {
  it("advances during prep and nights", () => {
    const s = newRun();
    play(s, 2);
    expect(s.runTime).toBeCloseTo(2, 6);
    startNight(s);
    const before = s.runTime;
    play(s, 1);
    expect(s.runTime - before).toBeCloseTo(1, 6);
  });

  it("is frozen while the shop is open", () => {
    const s = newRun();
    play(s, 1);
    s.betweenWaves = true;
    s.dayPhase = "shop";
    const before = s.runTime;
    play(s, 3);
    expect(s.runTime).toBe(before);
  });

  it("stops once the run is over", () => {
    const s = newRun();
    play(s, 1);
    s.status = "won";
    const before = s.runTime;
    play(s, 2);
    expect(s.runTime).toBe(before);
  });
});

describe("frame sub-stepping", () => {
  it("never loses time on slow frames (100ms frame = five 20ms steps)", () => {
    const s = newRun();
    // the old loop clamped each frame to 33ms, so a 10fps device ran the game at 1/3 speed
    advance(s, {}, 0.1, VIEW, NO_INSETS);
    expect(s.runTime).toBeCloseTo(0.1, 9);
  });

  it("splits long frames into steps no longer than 20ms", () => {
    const a = newRun();
    const b = newRun();
    advance(a, {}, 0.1, VIEW, NO_INSETS); // 5 × 0.02
    for (let i = 0; i < 5; i++) update(b, {}, 0.02, VIEW, NO_INSETS);
    expect(gameplaySnapshot(a)).toEqual(gameplaySnapshot(b));
  });

  it("same total time and step sizes → same outcome, whatever the frame size", () => {
    // Runs are created and played one after another, like real runs: enemy ids come
    // from a module-level counter that freshState() resets at the start of each run.
    // A: 40ms frames (2 steps each); B: 20ms frames (1 step each)
    const a = newRun();
    startNight(a);
    for (let i = 0; i < 500; i++) advance(a, {}, 0.04, VIEW, NO_INSETS);
    const b = newRun();
    startNight(b);
    for (let i = 0; i < 1000; i++) advance(b, {}, 0.02, VIEW, NO_INSETS);
    expect(a.enemies.length + a.spawnedThisWave).toBeGreaterThan(0);
    expect(gameplaySnapshot(a)).toEqual(gameplaySnapshot(b));
  });
});

describe("determinism (fair leaderboard)", () => {
  function lcg(seed: number) {
    let x = seed >>> 0;
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 2 ** 32;
    };
  }

  function runNight(seed: number) {
    vi.spyOn(Math, "random").mockImplementation(lcg(seed));
    const s = newRun();
    play(s, 15.5); // the whole first prep, into night 1
    play(s, 30);
    vi.restoreAllMocks();
    return gameplaySnapshot(s);
  }

  it("plays out identically regardless of cosmetic randomness", () => {
    const a = runNight(1);
    const b = runNight(987654321);
    // the night actually happened: raiders spawned and something took damage
    expect(a.spawned).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe("player physics", () => {
  it("a jump arcs up and lands back on the ground", () => {
    const s = newRun();
    const groundY = s.player.y;
    let minY = groundY;
    play(s, 1 / 60, { Space: true });
    for (let i = 0; i < 120 && !(s.player.onGround && i > 2); i++) {
      play(s, 1 / 60);
      minY = Math.min(minY, s.player.y);
    }
    expect(s.player.onGround).toBe(true);
    expect(s.player.y).toBeCloseTo(groundY, 6);
    // v²/2g = 390² / 2200 ≈ 69px peak
    expect(groundY - minY).toBeGreaterThan(55);
    expect(groundY - minY).toBeLessThan(75);
  });

  it("holding up on a ladder climbs onto the tower platform", () => {
    const s = newRun();
    const tower = s.world.towers.find((t) => t.id === "west")!;
    s.player.x = tower.ladder.x + tower.ladder.w / 2 - s.player.w / 2;
    play(s, 2, { ArrowUp: true });
    play(s, 0.2);
    expect(s.player.onGround).toBe(true);
    expect(s.player.y).toBeCloseTo(tower.platform.y - s.player.h, 6);
  });
});

describe("crew AI", () => {
  it("the runner carries ammo up to an empty tower", () => {
    const s = newRun();
    s.waveTimer = 999; // stay in prep
    for (const t of s.world.towers) t.ammo = 0;
    s.helpers.push(spawnHelper(s, "runner"));
    play(s, 20);
    const total = s.world.towers.reduce((n, t) => n + t.ammo, 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it("the mason repairs a damaged wall", () => {
    const s = newRun();
    s.waveTimer = 999;
    const wall = s.world.walls[0]!;
    wall.hp = 30;
    s.helpers.push(spawnHelper(s, "mason"));
    play(s, 15);
    expect(wall.hp).toBeGreaterThan(30);
  });
});

describe("shop", () => {
  it("refuses purchases you can't afford", () => {
    const s = newRun();
    s.gold = 0;
    tryBuyUpgrade(s, "power");
    tryHire(s, "runner");
    expect(s.gold).toBe(0);
    expect(s.upgrades.power).toBe(0);
    expect(s.crew.runner).toBe(false);
    expect(s.helpers).toHaveLength(0);
  });

  it("charges the listed cost and applies the upgrade", () => {
    const s = newRun();
    s.gold = 100;
    const damage = s.world.towers.map((t) => t.damage);
    tryBuyUpgrade(s, "power");
    expect(s.gold).toBe(100 - upgradeCost("power", 0));
    expect(s.upgrades.power).toBe(1);
    expect(s.world.towers.map((t) => t.damage)).toEqual(damage.map((d) => d + 5));
  });

  it("hires crew once", () => {
    const s = newRun();
    s.gold = 200;
    tryHire(s, "runner");
    expect(s.gold).toBe(200 - hireCost("runner"));
    expect(s.crew.runner).toBe(true);
    expect(s.helpers).toHaveLength(1);
    tryHire(s, "runner");
    expect(s.gold).toBe(200 - hireCost("runner"));
    expect(s.helpers).toHaveLength(1);
  });

  it("number keys buy once per press, not every frame while held", () => {
    const s = newRun();
    s.betweenWaves = true;
    s.dayPhase = "shop";
    s.gold = 500;
    for (let i = 0; i < 30; i++) updateShop(s, { Digit2: true });
    expect(s.upgrades.magazine).toBe(1);
    expect(s.gold).toBe(500 - upgradeCost("magazine", 0));
  });
});
