import { describe, expect, it } from "vitest";
import {
  ACT2_ROSTERS,
  isBruteSlot,
  nightSize,
  slotKind,
  theoreticalMinSeconds,
} from "../src/game/acts";
import { STUN_SECONDS, structureBelow } from "../src/game/bombers";
import { PREP_SECONDS } from "../src/game/constants";
import { freshState } from "../src/game/state";
import { advance } from "../src/game/step";
import type { GameState } from "../src/game/types";
import { spawnEnemy } from "../src/game/waves";
import { gameplaySnapshot, NO_INSETS, play, VIEW } from "./harness";

/** Leaderboard Worker floors (leaderboard/src/index.ts MIN_RUN_MS_BY_ACT) */
const SERVER_FLOOR_MS = { 1: 105_000, 2: 120_000 } as const;

function act2Run(): GameState {
  return freshState("playing", 2);
}

/** Leave the opening shop and skip the prep so night 1 starts now. */
function startAct2Night(s: GameState) {
  s.dayPhase = "prep";
  s.waveTimer = 0.0001;
  advance(s, {}, 1 / 60, VIEW, NO_INSETS);
}

/** Put one enemy of `kind` on the field at x (bombers keep their altitude). */
function place(s: GameState, kind: "raider" | "brute" | "bomber", x: number) {
  s.toSpawn = 1;
  s.spawnedThisWave = 0;
  const roster = ACT2_ROSTERS[0]!;
  const index = roster.indexOf(kind === "bomber" ? "b" : kind === "brute" ? "B" : "r");
  s.spawnedThisWave = index;
  s.toSpawn = roster.length;
  spawnEnemy(s);
  const e = s.enemies[s.enemies.length - 1]!;
  e.x = x;
  s.spawnedThisWave = s.toSpawn; // no further spawns
  return e;
}

/** Step until `done` holds (or `max` seconds pass); stops on the step it becomes true. */
function playUntil(s: GameState, done: () => boolean, max = 30) {
  for (let t = 0; t < max && !done(); t += 1 / 60) advance(s, {}, 1 / 60, VIEW, NO_INSETS);
}

/**
 * Play a whole run headlessly: tap Ready whenever the shop is open, and apply
 * `tamper` every frame (e.g. keep cannons loaded). Returns once the run ends.
 */
function playOut(s: GameState, maxSeconds: number, tamper: (s: GameState) => void) {
  const frame = 1 / 30;
  let enterDown = false;
  for (let t = 0; t < maxSeconds && s.status === "playing"; t += frame) {
    tamper(s);
    enterDown = s.dayPhase === "shop" ? !enterDown : false;
    advance(s, enterDown ? { Enter: true } : {}, frame, VIEW, NO_INSETS);
  }
}

describe("Act 2 roster", () => {
  it("has five fixed nights of growing size", () => {
    expect(ACT2_ROSTERS.map((r) => r.length)).toEqual([10, 12, 14, 16, 18]);
    for (const r of ACT2_ROSTERS) expect(r).toMatch(/^[rBb]+$/);
    const counts = ACT2_ROSTERS.map((r) => ({
      bombers: [...r].filter((c) => c === "b").length,
      brutes: [...r].filter((c) => c === "B").length,
    }));
    expect(counts).toEqual([
      { bombers: 1, brutes: 1 },
      { bombers: 2, brutes: 2 },
      { bombers: 2, brutes: 3 },
      { bombers: 3, brutes: 4 },
      { bombers: 4, brutes: 5 },
    ]);
  });

  it("maps letters to kinds and leaves Act 1's slots exactly as before", () => {
    expect(slotKind(2, 1, 3, 10)).toBe("bomber");
    expect(slotKind(2, 1, 6, 10)).toBe("brute");
    expect(slotKind(2, 1, 0, 10)).toBe("raider");
    for (let wave = 1; wave <= 5; wave++) {
      const n = nightSize(1, wave);
      expect(n).toBe(4 + wave * 2);
      for (let i = 0; i < n; i++) {
        expect(slotKind(1, wave, i, n)).toBe(isBruteSlot(wave, i, n) ? "brute" : "raider");
      }
    }
  });

  it("keeps the leaderboard floors below the fastest possible run", () => {
    expect(theoreticalMinSeconds(1, PREP_SECONDS) * 1000).toBeGreaterThan(SERVER_FLOOR_MS[1]);
    expect(theoreticalMinSeconds(2, PREP_SECONDS) * 1000).toBeGreaterThan(SERVER_FLOOR_MS[2]);
  });
});

describe("Act 2 start", () => {
  it("opens the shop with the fixed kit on the ridge layout", () => {
    const s = act2Run();
    expect(s.act).toBe(2);
    expect(s.dayPhase).toBe("shop");
    expect(s.gold).toBe(60);
    expect(s.crew).toEqual(freshState("playing").crew);
    expect(s.upgrades).toEqual(freshState("playing").upgrades);
    expect(s.world.width).toBe(1800);
    expect(s.world.groundY).toBe(620);
    expect(s.world.towers.map((t) => t.id)).toEqual(["west", "mid", "east"]);
    expect(s.world.walls).toHaveLength(3);
  });

  it("leaves Act 1's start untouched", () => {
    const s = freshState("playing");
    expect(s.act).toBe(1);
    expect(s.dayPhase).toBe("prep");
    expect(s.gold).toBe(0);
    expect(s.world.width).toBe(1600);
    expect(s.world.towers.map((t) => t.id)).toEqual(["west", "east"]);
  });

  it("the shop clock is frozen and Ready moves on to prep", () => {
    const s = act2Run();
    play(s, 2);
    expect(s.runTime).toBe(0);
    advance(s, { Enter: false }, 1 / 60, VIEW, NO_INSETS);
    advance(s, { Enter: true }, 1 / 60, VIEW, NO_INSETS);
    expect(s.dayPhase).toBe("prep");
  });
});

describe("bombers", () => {
  it("bomb the structure they fly over", () => {
    const s = act2Run();
    startAct2Night(s);
    s.world.towers.forEach((t) => (t.ammo = 0)); // nothing shoots back
    const mid = s.world.towers.find((t) => t.id === "mid")!;
    const e = place(s, "bomber", mid.base.x + mid.base.w / 2 + 10);
    e.bombTimer = 0;
    const hpBefore = mid.hp;
    play(s, 1.5);
    expect(mid.hp).toBe(hpBefore - 12);
  });

  it("drift off the far side without costing a life or paying gold", () => {
    const s = act2Run();
    startAct2Night(s);
    s.world.towers.forEach((t) => (t.ammo = 0));
    place(s, "bomber", 60);
    const { lives, gold } = s;
    // check on the step it leaves (the next step ends the night and pays the night bonus)
    playUntil(s, () => !s.enemies.some((e) => e.kind === "bomber"));
    expect(s.enemies.filter((e) => e.kind === "bomber")).toHaveLength(0);
    expect(s.lives).toBe(lives);
    expect(s.gold).toBe(gold);
  });

  it("fly within reach of the cannons and can be shot down for gold", () => {
    const s = act2Run();
    startAct2Night(s);
    const east = s.world.towers.find((t) => t.id === "east")!;
    east.ammo = east.maxAmmo;
    const bomber = place(s, "bomber", east.base.x + 300);
    const gold = s.gold;
    playUntil(s, () => !s.enemies.includes(bomber));
    expect(bomber.hp).toBeLessThanOrEqual(0); // shot down, not drifted away
    expect(s.gold).toBe(gold + 4);
  });

  it("knock the player down when a bomb bursts close by", () => {
    const s = act2Run();
    startAct2Night(s);
    s.world.towers.forEach((t) => (t.ammo = 0));
    // player standing in the open between the west tower and the first wall
    s.player.x = 320;
    s.player.carrying = "ammo";
    expect(structureBelow(s, s.player.x + s.player.w / 2)).toBeNull();
    s.bombs.push({ x: s.player.x + s.player.w / 2, y: s.world.groundY - 60, vy: 0 });
    play(s, 0.6);
    expect(s.player.stunTimer).toBeGreaterThan(0);
    expect(s.player.carrying).toBeNull();
    // can't walk while knocked down…
    const x = s.player.x;
    play(s, 0.3, { ArrowRight: true });
    expect(s.player.x).toBe(x);
    // …and recovers afterwards
    play(s, STUN_SECONDS);
    play(s, 0.3, { ArrowRight: true });
    expect(s.player.x).toBeGreaterThan(x);
  });
});

describe("Act 2 runs", () => {
  it("are deterministic", () => {
    const run = () => {
      const s = act2Run();
      startAct2Night(s);
      play(s, 30);
      return gameplaySnapshot(s);
    };
    const a = run();
    const b = run();
    expect(a.enemies.some((e) => e.kind === "bomber")).toBe(true);
    expect(b).toEqual(a);
  });

  it("every night ends: a perfect defense wins (no soft-lock)", () => {
    const s = act2Run();
    // cannons always loaded and stonework always patched, like a flawless crew
    playOut(s, 1200, (st) => {
      st.world.towers.forEach((t) => {
        t.ammo = t.maxAmmo;
        t.hp = t.maxHp;
      });
      st.world.walls.forEach((w) => (w.hp = w.maxHp));
    });
    expect(s.status).toBe("won");
    expect(s.wave).toBe(6);
    expect(s.runTime * 1000).toBeGreaterThan(SERVER_FLOOR_MS[2]);
  });

  it("are lost when nobody defends the keep", () => {
    const s = act2Run();
    playOut(s, 1200, (st) => st.world.towers.forEach((t) => (t.ammo = 0)));
    expect(s.status).toBe("lost");
  });
});
