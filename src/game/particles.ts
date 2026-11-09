/** Debris particles and floating text. */
import type { GameState } from "./types";

export function updateDebris(state: GameState, dt: number) {
  const ground = state.world.groundY;
  for (const d of state.debris) {
    d.life -= dt;
    if (d.kind === "chip") {
      d.vy += 620 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > ground - d.size) {
        // bounce once, then skid to a stop
        d.y = ground - d.size;
        d.vy *= -0.3;
        d.vx *= 0.55;
      }
    } else if (d.kind === "dust") {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - Math.min(1, dt * 3);
      d.size += dt * 16;
    } else if (d.kind === "smoke") {
      // drifts off, slows, rises and spreads
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - Math.min(1, dt * 2.5);
      d.vy -= 14 * dt;
      d.size += dt * 11;
    } else if (d.kind === "fire") {
      d.size += dt * 34;
    }
  }
  state.debris = state.debris.filter((d) => d.life > 0);
}

export function updateFloaters(state: GameState, dt: number) {
  for (const f of state.floaters) {
    f.life -= dt;
    f.y += f.vy * dt;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);
}

export function addFloater(
  state: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  state.floaters.push({
    x,
    y,
    text,
    life: 0.9,
    maxLife: 0.9,
    color,
    vy: -28,
  });
}
