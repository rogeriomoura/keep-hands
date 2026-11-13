/**
 * Per-act rules: layout, starting kit, fixed night rosters and enemy stats.
 *
 * Every act's nights are fixed (same spawns, same order, same timing every run)
 * so leaderboard times are comparable. Act 1 keeps its original formulas exactly.
 */
import type { ActId, Enemy } from "./types";

export type EnemyKind = Enemy["kind"];

/** Share of each Act 1 night's raiders that are brutes (from night 3 on). */
export const BRUTE_SHARE = 0.28;

/**
 * Act 1 roster: brutes spread evenly through the night — same count and order every run:
 * night 3: 3 of 10, night 4: 3 of 12, night 5: 4 of 14 (≈ the old 28% average).
 */
export function isBruteSlot(wave: number, index: number, total: number): boolean {
  if (wave < 3 || total <= 0) return false;
  const brutes = Math.round(total * BRUTE_SHARE);
  return Math.floor(((index + 1) * brutes) / total) > Math.floor((index * brutes) / total);
}

/**
 * Act 2 rosters, one letter per spawn in order: r = raider, B = brute, b = bomber.
 * Bombers fly over the walls and drop bombs; brutes thicken the later nights.
 */
export const ACT2_ROSTERS: readonly string[] = [
  "rrrbrrBrrr", // night 1 (10): meet the bomber
  "rrBrbrrBrrbr", // night 2 (12)
  "rrBrbrrBrbrrBr", // night 3 (14)
  "rBrrbrBrrbrBrrbB", // night 4 (16)
  "rBrbrrBrbrBrrbrBbB", // night 5 (18)
];

const KIND_BY_LETTER: Record<string, EnemyKind> = { r: "raider", B: "brute", b: "bomber" };

/** How many enemies night `wave` (1–5) of `act` sends. */
export function nightSize(act: ActId, wave: number): number {
  if (act === 2) return ACT2_ROSTERS[wave - 1]?.length ?? 0;
  return 4 + wave * 2;
}

/** Seconds between spawns on night `wave` (the first spawn comes 0.35s after night falls). */
export function spawnInterval(act: ActId, wave: number): number {
  if (act === 2) return Math.max(0.55, 1.0 - wave * 0.06);
  return Math.max(0.45, 1.05 - wave * 0.08);
}

/** Which enemy fills spawn slot `index` of night `wave`. */
export function slotKind(act: ActId, wave: number, index: number, total: number): EnemyKind {
  if (act === 2) return KIND_BY_LETTER[ACT2_ROSTERS[wave - 1]?.[index] ?? "r"] ?? "raider";
  return isBruteSlot(wave, index, total) ? "brute" : "raider";
}

export type EnemyStats = {
  w: number;
  h: number;
  hp: number;
  speed: number;
  damage: number;
};

/** Size and strength of a freshly spawned enemy. Act 1 numbers are unchanged. */
export function enemyStats(act: ActId, wave: number, kind: EnemyKind): EnemyStats {
  if (act === 1) {
    if (kind === "brute") return { w: 28, h: 46, hp: 78, speed: 40, damage: 14 };
    return { w: 22, h: 34, hp: 28 + wave * 2, speed: 68 + wave * 5, damage: 8 };
  }
  switch (kind) {
    case "brute":
      return { w: 28, h: 46, hp: 90, speed: 42, damage: 14 };
    case "bomber":
      // damage = what each bomb does to the structure it lands on
      return { w: 30, h: 42, hp: 34, speed: 48, damage: 12 };
    default:
      return { w: 22, h: 34, hp: 36 + wave * 2, speed: 88 + wave * 3, damage: 8 };
  }
}

/** Bombers cruise at this height above the ground (top of the balloon). */
export const BOMBER_ALTITUDE = 340;
/** Seconds between a bomber's drops while it's over a structure. */
export const BOMB_COOLDOWN = 2.4;
/** Delay before a bomber's first drop, so it reaches the keep first. */
export const BOMB_FIRST_DELAY = 0.6;

export type ActInfo = {
  /** Starting gold; Act 2 opens with the shop so the fixed kit can be spent */
  startGold: number;
  startsInShop: boolean;
  /** Night-start banner text */
  nightBanner: (wave: number) => string;
  /** Banner shown when the run begins */
  openingBanner: string;
};

export const ACTS: Record<ActId, ActInfo> = {
  1: {
    startGold: 0,
    startsInShop: false,
    nightBanner: (wave) => `Night ${wave} — hold the walls`,
    openingBanner: "First night — repair & reload before sundown",
  },
  2: {
    startGold: 60,
    startsInShop: true,
    nightBanner: (wave) => `Act 2, night ${wave} — watch the skies`,
    openingBanner: "Act 2: the ridge keep — spend your purse, then prep",
  },
};

/**
 * Fastest conceivable run in seconds: 5 timed preps plus the time each night needs
 * just to spawn its roster. The leaderboard Worker rejects anything under a floor
 * set safely below this (see leaderboard/src/index.ts MIN_RUN_MS_BY_ACT).
 */
export function theoreticalMinSeconds(act: ActId, prepSeconds: number): number {
  let total = 0;
  for (let wave = 1; wave <= 5; wave++) {
    total += prepSeconds + 0.35 + (nightSize(act, wave) - 1) * spawnInterval(act, wave);
  }
  return total;
}
