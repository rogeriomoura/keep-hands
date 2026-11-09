/** Shared helpers for driving the game headlessly in tests. */
import type { KeyState } from "../src/input";
import { freshState } from "../src/game/state";
import { advance } from "../src/game/step";
import type { GameState, ViewInsets, ViewSize } from "../src/game/types";

/** A 1:1 desktop stage (worldZoom = 1) */
export const VIEW: ViewSize = { width: 1100, height: 575 };
export const NO_INSETS: ViewInsets = { left: 0, right: 0 };

export function newRun(): GameState {
  return freshState("playing");
}

/** Run `seconds` of game time as a sequence of rendered frames of `frame` seconds. */
export function play(state: GameState, seconds: number, keys: KeyState = {}, frame = 1 / 60) {
  const frames = Math.round(seconds / frame);
  for (let i = 0; i < frames; i++) advance(state, keys, frame, VIEW, NO_INSETS);
}

/** Skip the 15s first-night prep so raiders start coming on the next step. */
export function startNight(state: GameState) {
  state.waveTimer = 0.0001;
  advance(state, {}, 1 / 60, VIEW, NO_INSETS);
}

/** Gameplay-relevant snapshot (excludes purely cosmetic fields like debris, corpses, poses). */
export function gameplaySnapshot(s: GameState) {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    status: s.status,
    wave: s.wave,
    lives: s.lives,
    gold: s.gold,
    runTime: r(s.runTime),
    spawned: s.spawnedThisWave,
    player: { x: r(s.player.x), y: r(s.player.y), carrying: s.player.carrying },
    enemies: s.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: r(e.x),
      hp: r(e.hp),
      phase: e.attackPhase,
      phaseT: r(e.phaseT),
      swingScale: r(e.swingScale),
      swings: e.swingCount,
    })),
    projectiles: s.projectiles.map((p) => ({ x: r(p.x), y: r(p.y), damage: p.damage })),
    walls: s.world.walls.map((w) => r(w.hp)),
    towers: s.world.towers.map((t) => ({ hp: r(t.hp), ammo: t.ammo, aim: r(t.aimAngle) })),
  };
}
