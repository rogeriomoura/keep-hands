/**
 * Reduced-motion helpers. Purely cosmetic: they only touch screen shake, particles
 * (state.debris), felled bodies (state.corpses) and flash brightness — none of
 * which gameplay ever reads — so runs play out identically either way.
 *
 * When reduced motion is on:
 * - no screen shake at all
 * - impact "spark" stars are dropped (they flash) and fireballs are smaller
 * - chips, dust and smoke: half as many, half the speed, smaller, slower spin
 * - felled bodies slide less (they still fall and fade so kills stay readable)
 * - cannon muzzle flashes are half as bright/large
 */
import type { Corpse } from "./effects";
import type { Debris, GameState } from "./game/types";
import { getReducedMotion } from "./settings";

/** Random shake offset (px) for one axis; always 0 with reduced motion. */
export function shakeOffset(amount: number, reduced: boolean, rand: () => number = Math.random): number {
  if (reduced || amount <= 0) return 0;
  return (rand() - 0.5) * amount * 2;
}

/** Multiplier for the cannon muzzle-flash size/brightness. */
export function muzzleFlashScale(reduced: boolean): number {
  return reduced ? 0.5 : 1;
}

// particles/bodies already looked at, so each is calmed exactly once
const seenDebris = new WeakSet<Debris>();
const seenCorpses = new WeakSet<Corpse>();

/**
 * Calm a burst of freshly spawned particles in place. Returns the particles to keep.
 * Within one burst, every other chip/dust/smoke of each kind is kept (the first
 * always is), so every hit, death and collapse still shows something.
 */
export function calmBurst(fresh: Debris[]): Debris[] {
  const perKind: Partial<Record<Debris["kind"], number>> = {};
  const kept: Debris[] = [];
  for (const d of fresh) {
    if (d.kind === "spark") continue; // the flashing star
    if (d.kind === "fire") {
      d.size *= 0.6;
      kept.push(d);
      continue;
    }
    const i = perKind[d.kind] ?? 0;
    perKind[d.kind] = i + 1;
    if (i % 2 === 1) continue;
    d.vx *= 0.5;
    d.vy *= 0.5;
    d.spin *= 0.3;
    d.size *= d.kind === "chip" ? 0.85 : 0.75;
    kept.push(d);
  }
  return kept;
}

/**
 * Apply reduced motion to effects spawned since the last call (once per frame).
 * Particles spawned while it was off are only marked, never changed later.
 */
export function calmNewEffects(state: GameState, reduced: boolean = getReducedMotion()) {
  const fresh: Debris[] = [];
  for (const d of state.debris) {
    if (seenDebris.has(d)) continue;
    seenDebris.add(d);
    fresh.push(d);
  }
  if (reduced && fresh.length > 0) {
    const keep = new Set(calmBurst(fresh));
    const freshSet = new Set(fresh);
    state.debris = state.debris.filter((d) => !freshSet.has(d) || keep.has(d));
  }

  for (const c of state.corpses) {
    if (seenCorpses.has(c)) continue;
    seenCorpses.add(c);
    if (reduced) c.vx *= 0.4;
  }
}
