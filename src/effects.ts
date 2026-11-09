/**
 * Cosmetic-only effects: death falls, cannon smoke, explosions, collapses, dusk/dawn.
 * Nothing here is ever read by gameplay code — it only writes to state.debris /
 * state.corpses / state.nightBlend / state.shake (shake is already cosmetic).
 *
 * Each "moment" is one function so a sound can be added with a single call:
 *   cannonFired · ballImpact · enemyKilled · structureCollapsed (+ game.ts beginNight)
 */
import type { Debris, Enemy, GameState } from "./game";
import { sfx } from "./sfx";

/** A felled raider/brute: drawn falling + fading, then dropped. Not an enemy any more. */
export type Corpse = {
  kind: Enemy["kind"];
  x: number;
  y: number;
  w: number;
  h: number;
  /** horizontal slide from the hit, px/s (decays) */
  vx: number;
  /** +1 falls back toward the east (away from the keep), −1 toward the west */
  dir: 1 | -1;
  t: number;
  life: number;
  dusted: boolean;
};

const MAX_DEBRIS = 260;
const MAX_CORPSES = 24;
const CORPSE_LIFE = 0.65;
/** Seconds for the sky to cross between day and night */
const SKY_FADE_SECONDS = 1.75;

type DebrisInit = Omit<Debris, "maxLife" | "spin" | "vx" | "vy"> &
  Partial<Pick<Debris, "vx" | "vy" | "spin" | "maxLife">>;

function push(state: GameState, d: DebrisInit) {
  state.debris.push({ vx: 0, vy: 0, spin: 0, maxLife: d.life, ...d });
}

/** Keep particle counts bounded on phones: drop the oldest first. */
export function capDebris(state: GameState) {
  if (state.debris.length > MAX_DEBRIS) {
    state.debris.splice(0, state.debris.length - MAX_DEBRIS);
  }
}

/** Cannon just fired from (x, y) along `ang`: puff of smoke drifting off the muzzle. */
export function cannonFired(state: GameState, x: number, y: number, ang: number) {
  sfx.cannonFired(state, x);
  for (let i = 0; i < 3; i++) {
    const spread = (Math.random() - 0.5) * 0.5;
    const spd = 30 + Math.random() * 40 + i * 12;
    push(state, {
      kind: "smoke",
      x: x + Math.cos(ang) * (4 + i * 3),
      y: y + Math.sin(ang) * (4 + i * 3),
      vx: Math.cos(ang + spread) * spd,
      vy: Math.sin(ang + spread) * spd - 12,
      life: 0.8 + Math.random() * 0.4,
      size: 5 + i * 2,
      color: "196, 188, 176",
    });
  }
}

/** A cannonball hit a raider or the ground at (x, y). */
export function ballImpact(state: GameState, x: number, y: number, onGround: boolean) {
  sfx.ballImpact(state, x);
  push(state, { kind: "fire", x, y, life: 0.22, size: onGround ? 13 : 11, color: "255, 190, 90" });
  push(state, { kind: "spark", x, y, life: 0.12, size: 12, spin: Math.random() * Math.PI, color: "#ffe2a0" });
  for (let i = 0; i < 3; i++) {
    push(state, {
      kind: "smoke",
      x: x + (Math.random() - 0.5) * 8,
      y: y - Math.random() * 4,
      vx: (Math.random() - 0.5) * 30,
      vy: -18 - Math.random() * 18,
      life: 0.6 + Math.random() * 0.35,
      size: 5 + Math.random() * 3,
      color: "120, 112, 104",
    });
  }
  // a ground hit kicks up dirt clods
  if (onGround) {
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const spd = 70 + Math.random() * 90;
      push(state, {
        kind: "chip",
        x,
        y: y - 2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.45 + Math.random() * 0.25,
        size: 1.5 + Math.random() * 2,
        spin: (Math.random() - 0.5) * 18,
        color: Math.random() < 0.5 ? "#4a3a28" : "#3d5a45",
      });
    }
  }
}

/** A raider/brute was killed by a cannonball travelling with velocity vx. */
export function enemyKilled(state: GameState, e: Enemy, hitVx: number) {
  sfx.enemyKilled(state, e.x + e.w / 2);
  const dir: 1 | -1 = hitVx >= 0 ? 1 : -1;
  state.corpses.push({
    kind: e.kind,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    vx: dir * (e.kind === "brute" ? 40 : 70),
    dir,
    t: 0,
    life: CORPSE_LIFE,
    dusted: false,
  });
  if (state.corpses.length > MAX_CORPSES) state.corpses.shift();
}

export function updateCorpses(state: GameState, dt: number) {
  for (const c of state.corpses) {
    c.t += dt;
    c.x += c.vx * dt;
    c.vx *= 1 - Math.min(1, dt * 6);
    // a little dust when the body hits the ground
    if (!c.dusted && c.t >= c.life * 0.45) {
      c.dusted = true;
      const fx = c.x + c.w / 2 + c.dir * c.h * 0.5;
      for (const side of [-1, 1]) {
        push(state, {
          kind: "dust",
          x: fx + side * 6,
          y: c.y + c.h - 4,
          vx: side * (16 + Math.random() * 12),
          vy: -6 - Math.random() * 6,
          life: 0.45,
          size: c.kind === "brute" ? 7 : 5,
          color: "200, 186, 164",
        });
      }
    }
  }
  state.corpses = state.corpses.filter((c) => c.t < c.life);
}

/** A wall went down or a tower was ruined: rubble flies, dust rolls out, the ground shakes. */
export function structureCollapsed(
  state: GameState,
  body: { x: number; y: number; w: number; h: number },
  stone: string[],
) {
  sfx.structureCollapsed(state, body);
  state.shake = Math.max(state.shake, 7);
  const ground = body.y + body.h;
  for (let i = 0; i < 16; i++) {
    const x = body.x + Math.random() * body.w;
    const y = body.y + Math.random() * body.h * 0.6;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const spd = 60 + Math.random() * 120;
    push(state, {
      kind: "chip",
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.7 + Math.random() * 0.5,
      size: 3 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 12,
      color: stone[i % stone.length]!,
    });
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    push(state, {
      kind: "dust",
      x: body.x + body.w * t,
      y: ground - 10 - Math.random() * body.h * 0.3,
      vx: (t - 0.5) * 60,
      vy: -10 - Math.random() * 12,
      life: 0.9 + Math.random() * 0.4,
      size: 12 + Math.random() * 8,
      color: "190, 176, 156",
    });
  }
}

/** Ease the sky toward night while raiders are out, back to day between waves. */
export function updateSky(state: GameState, dt: number) {
  const target = state.betweenWaves ? 0 : 1;
  const step = dt / SKY_FADE_SECONDS;
  state.nightBlend =
    state.nightBlend < target
      ? Math.min(target, state.nightBlend + step)
      : Math.max(target, state.nightBlend - step);
}
