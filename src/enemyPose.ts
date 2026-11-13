/**
 * Raider/brute melee swing: an explicit phase machine (windup → strike → recover)
 * plus a pure pose function the renderer reads. Damage lands on the last frame
 * of the strike, when the club meets the wall.
 */

export type AttackPhase = "none" | "windup" | "strike" | "recover";

export type SwingTiming = { windup: number; strike: number; recover: number };

type PoseSource = {
  kind: "raider" | "brute" | "bomber";
  attackPhase: AttackPhase;
  phaseT: number;
  swingScale: number;
  swingFrom: number;
  walkPhase: number;
};

export type EnemyPose = {
  /** Lead (front) arm rotation; 0 = straight down, + swings toward the keep (left) */
  front: number;
  /** Back arm rotation */
  back: number;
  /** Horizontal body offset in px (− leans into the wall, + leans away) */
  leanX: number;
  /** Vertical body offset in px (− rises on the windup) */
  leanY: number;
  /** 0..1 squash on impact */
  squash: number;
  /** 0..1 opacity of the swing smear */
  smear: number;
  /** Angular length of the smear trailing behind the weapon (radians) */
  smearSpan: number;
  /** How far the front foot steps toward the wall, px */
  step: number;
};

// Arm angles (radians). Arms are drawn along +y then rotated, so
// negative = up/behind (right), positive = forward (left, into the keep).
export const ARM_READY = 0.35;
export const ARM_COCKED = -2.35;
export const ARM_FOLLOW = 1.15;
/** Same pose as ARM_FOLLOW, unwrapped so the strike goes over the head (through −π), not under the feet */
const ARM_FOLLOW_OVERHEAD = ARM_FOLLOW - Math.PI * 2;

/** Total ≈ 1s so damage-per-second matches the old timing. */
export function swingTiming(kind: "raider" | "brute" | "bomber", scale = 1): SwingTiming {
  const t =
    kind === "brute"
      ? { windup: 0.62, strike: 0.12, recover: 0.26 }
      : { windup: 0.5, strike: 0.09, recover: 0.41 };
  return {
    windup: t.windup * scale,
    strike: t.strike * scale,
    recover: t.recover * scale,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuad = (t: number) => t * t;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Arm swing while marching (front/back counter-swing). */
export function marchArm(walkPhase: number) {
  return ARM_READY + Math.sin(walkPhase) * 0.32;
}

export function enemyPose(e: PoseSource): EnemyPose {
  const brute = e.kind === "brute";
  const timing = swingTiming(e.kind, e.swingScale);

  if (e.attackPhase === "none") {
    const front = marchArm(e.walkPhase);
    return {
      front,
      back: ARM_READY - Math.sin(e.walkPhase) * 0.32,
      leanX: 0,
      leanY: 0,
      squash: 0,
      smear: 0,
      smearSpan: 0,
      step: 0,
    };
  }

  if (e.attackPhase === "windup") {
    const p = clamp01(e.phaseT / timing.windup);
    // Raise over the first 75%, then hold cocked — the anticipation beat
    const raise = easeOutCubic(clamp01(p / 0.75));
    const hold = clamp01((p - 0.75) / 0.25);
    const front = lerp(e.swingFrom, ARM_COCKED, raise) - hold * 0.12;
    return {
      front,
      // Brutes swing two-handed; raiders pull the off arm back for balance
      back: brute ? front + 0.1 : lerp(ARM_READY, 0.9, raise),
      leanX: raise * 2.2 + hold * 0.6,
      leanY: -raise * 1.5,
      squash: 0,
      smear: 0,
      smearSpan: 0,
      step: 0,
    };
  }

  if (e.attackPhase === "strike") {
    const p = easeInQuad(clamp01(e.phaseT / timing.strike));
    const front = lerp(ARM_COCKED - 0.12, ARM_FOLLOW_OVERHEAD, p);
    return {
      front,
      back: brute ? front + 0.1 : lerp(0.9, -0.5, p),
      leanX: lerp(2.8, -4.5, p),
      leanY: lerp(-1.5, 1, p),
      squash: 0,
      smear: 0.25 + p * 0.55,
      smearSpan: Math.min(1.9, ARM_COCKED - 0.12 - front),
      step: p * 3,
    };
  }

  // recover: brief hit-stop at full extension, then settle back to ready
  const p = clamp01(e.phaseT / timing.recover);
  const stop = 0.16;
  const settle = easeInOutSine(clamp01((p - stop) / (1 - stop)));
  const front = lerp(ARM_FOLLOW, ARM_READY, settle);
  const impact = 1 - clamp01(p / 0.28);
  return {
    front,
    back: brute ? front + 0.1 : lerp(-0.5, ARM_READY, settle),
    leanX: lerp(-4.5, 0, settle),
    leanY: lerp(1, 0, settle),
    squash: impact,
    smear: Math.max(0, 0.8 - p * 6),
    smearSpan: 1.9,
    step: lerp(3, 0, settle),
  };
}
