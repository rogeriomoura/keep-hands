/**
 * Act 2 bombers: balloons that cross the keep at altitude, dropping a bomb on
 * whatever structure they're over every BOMB_COOLDOWN seconds. They never land or
 * breach: a bomber that crosses the whole field simply drifts away (no life lost,
 * no gold). Fully deterministic — no randomness feeds this logic.
 */
import { bombBurst } from "../effects";
import { BOMB_COOLDOWN } from "./acts";
import { damageStructure } from "./enemies";
import { addFloater } from "./particles";
import type { Enemy, GameState } from "./types";

const BOMB_GRAVITY = 520;
/** Blast reach for knocking the player down (px from the burst) */
const STUN_RADIUS_X = 38;
const STUN_RADIUS_Y = 60;
export const STUN_SECONDS = 1.2;

/** A standing structure whose footprint spans x, with the height a bomb lands at. */
export function structureBelow(
  state: GameState,
  x: number,
): { id: string; top: number } | null {
  for (const t of state.world.towers) {
    if (t.hp > 0 && x >= t.base.x && x <= t.base.x + t.base.w) return { id: t.id, top: t.platform.y };
  }
  for (const w of state.world.walls) {
    if (w.hp > 0 && x >= w.body.x && x <= w.body.x + w.body.w) return { id: w.id, top: w.body.y };
  }
  return null;
}

/** Fly left; drop a bomb whenever over a standing structure and the timer allows. */
export function updateBomber(state: GameState, e: Enemy, dt: number) {
  e.x -= e.speed * dt;
  e.walkPhase += dt * 2; // cosmetic bob
  e.bombTimer = Math.max(0, e.bombTimer - dt);

  const cx = e.x + e.w / 2;
  if (e.bombTimer <= 0 && structureBelow(state, cx)) {
    state.bombs.push({ x: cx, y: e.y + e.h, vy: 40 });
    e.bombTimer = BOMB_COOLDOWN;
  }

  // drifted off the far side: gone for good, no breach
  if (e.x + e.w < -20) e.hp = 0;
}

/** Bombs fall straight down and burst on the first standing structure or the ground. */
export function updateBombs(state: GameState, dt: number) {
  if (state.bombs.length === 0) return;
  const groundY = state.world.groundY;
  const damage = 12;

  state.bombs = state.bombs.filter((b) => {
    b.vy += BOMB_GRAVITY * dt;
    b.y += b.vy * dt;

    const below = structureBelow(state, b.x);
    if (below && b.y >= below.top) {
      bombBurst(state, b.x, below.top);
      damageStructure(state, below.id, damage);
      knockDown(state, b.x, below.top);
      return false;
    }
    if (b.y >= groundY) {
      bombBurst(state, b.x, groundY);
      knockDown(state, b.x, groundY);
      return false;
    }
    return true;
  });
}

/** A blast close to the player knocks them down briefly and spills what they carry. */
function knockDown(state: GameState, x: number, y: number) {
  const p = state.player;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  if (Math.abs(px - x) > STUN_RADIUS_X || Math.abs(py - y) > STUN_RADIUS_Y) return;
  p.stunTimer = STUN_SECONDS;
  p.carrying = null;
  addFloater(state, px, p.y - 6, "KNOCKED DOWN", "#e8a050");
}
