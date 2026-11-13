/**
 * Personal best, kept in the player's own browser (no server needed).
 *
 * Tracks the fastest full run (all 5 nights) and, for players who haven't won
 * yet, the furthest night reached. Storage is injected so the logic is pure and
 * unit-testable; a missing, blocked or corrupt store simply means "no best yet".
 */
import { formatRunTime } from "./game/format";

export type PersonalBest = {
  /** Fastest winning run in ms, or null if the player has never won */
  bestMs: number | null;
  /** When that best was set (unix ms) */
  bestAt: number | null;
  /** Furthest night reached on any run (1–5); shown until the first win */
  furthestNight: number;
};

/** The subset of Web Storage we use; localStorage satisfies it. */
export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const PERSONAL_BEST_KEY = "keep-hands:personal-best";
/** Act 2 keeps its own best; Act 1 stays on the original key so existing bests carry over. */
export const ACT2_BEST_KEY = "keep-hands:personal-best:act2";
/** Set once Act 1 is won on this device (winning Act 1 before this flag existed also counts). */
export const ACT2_UNLOCK_KEY = "keep-hands:act2-unlocked";

export type Act = 1 | 2;

const bestKey = (act: Act) => (act === 2 ? ACT2_BEST_KEY : PERSONAL_BEST_KEY);
/** "night 3" for Act 1, "Act 2, night 3" for Act 2 */
const nightLabel = (night: number, act: Act) => (act === 2 ? `Act 2, night ${night}` : `night ${night}`);

export const EMPTY_BEST: PersonalBest = { bestMs: null, bestAt: null, furthestNight: 0 };

export type WinOutcome =
  | { kind: "first"; timeMs: number }
  | { kind: "new-best"; timeMs: number; previousMs: number; improvedByMs: number }
  | { kind: "tied"; timeMs: number }
  | { kind: "not-best"; timeMs: number; bestMs: number; behindByMs: number };

export type LossOutcome =
  /** Never won: report the furthest night, and whether this run set it */
  | { kind: "furthest"; night: number; improved: boolean }
  /** Has won before: remind them of their best time */
  | { kind: "has-won"; bestMs: number };

const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Read the stored best; anything missing or malformed falls back to "no best yet". */
export function loadBest(store: KeyValueStore | null, act: Act = 1): PersonalBest {
  if (!store) return { ...EMPTY_BEST };
  let raw: string | null = null;
  try {
    raw = store.getItem(bestKey(act));
  } catch {
    return { ...EMPTY_BEST };
  }
  if (!raw) return { ...EMPTY_BEST };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const bestMs = isPositiveInt(data.bestMs) ? Math.round(data.bestMs) : null;
    const bestAt = bestMs !== null && isPositiveInt(data.bestAt) ? data.bestAt : null;
    const furthestNight = isPositiveInt(data.furthestNight)
      ? Math.min(5, Math.floor(data.furthestNight))
      : 0;
    return { bestMs, bestAt, furthestNight };
  } catch {
    return { ...EMPTY_BEST };
  }
}

/** Persist the best; returns false if storage is unavailable (private mode, quota). */
export function saveBest(store: KeyValueStore | null, best: PersonalBest, act: Act = 1): boolean {
  if (!store) return false;
  try {
    store.setItem(bestKey(act), JSON.stringify(best));
    return true;
  } catch {
    return false;
  }
}

/** Fold a won run into the best. A tie keeps the original date. */
export function recordWin(
  best: PersonalBest,
  timeMs: number,
  now: number,
): { next: PersonalBest; outcome: WinOutcome } {
  const t = Math.max(0, Math.round(timeMs));
  const next: PersonalBest = { ...best, furthestNight: 5 };

  if (best.bestMs === null) {
    return { next: { ...next, bestMs: t, bestAt: now }, outcome: { kind: "first", timeMs: t } };
  }
  if (t < best.bestMs) {
    return {
      next: { ...next, bestMs: t, bestAt: now },
      outcome: { kind: "new-best", timeMs: t, previousMs: best.bestMs, improvedByMs: best.bestMs - t },
    };
  }
  if (t === best.bestMs) return { next, outcome: { kind: "tied", timeMs: t } };
  return {
    next,
    outcome: { kind: "not-best", timeMs: t, bestMs: best.bestMs, behindByMs: t - best.bestMs },
  };
}

/** Fold a lost run (the night it fell on) into the best. */
export function recordLoss(
  best: PersonalBest,
  nightReached: number,
): { next: PersonalBest; outcome: LossOutcome } {
  const night = Math.max(1, Math.min(5, Math.floor(nightReached)));
  const improved = night > best.furthestNight;
  const next: PersonalBest = improved ? { ...best, furthestNight: night } : best;
  if (best.bestMs !== null) return { next, outcome: { kind: "has-won", bestMs: best.bestMs } };
  return { next, outcome: { kind: "furthest", night: next.furthestNight, improved } };
}

const fmt = (ms: number) => formatRunTime(ms / 1000);

/** One-line summary for the win screen. */
export function winMessage(outcome: WinOutcome): { text: string; isNew: boolean } {
  switch (outcome.kind) {
    case "first":
      return { text: "New personal best! Your first full run.", isNew: true };
    case "new-best":
      return {
        text: `New personal best! ${fmt(outcome.improvedByMs)} faster than ${fmt(outcome.previousMs)}.`,
        isNew: true,
      };
    case "tied":
      return { text: `You matched your best: ${fmt(outcome.timeMs)}.`, isNew: false };
    case "not-best":
      return {
        text: `Your best: ${fmt(outcome.bestMs)} (this run was ${fmt(outcome.behindByMs)} slower).`,
        isNew: false,
      };
  }
}

/** One-line summary for the loss screen. */
export function lossMessage(outcome: LossOutcome, act: Act = 1): { text: string; isNew: boolean } {
  if (outcome.kind === "has-won") return { text: `Your best: ${fmt(outcome.bestMs)}`, isNew: false };
  return outcome.improved && outcome.night > 1
    ? { text: `New furthest: you reached ${nightLabel(outcome.night, act)}!`, isNew: true }
    : { text: `Best so far: reached ${nightLabel(outcome.night, act)}`, isNew: false };
}

/** Title-screen line, or null for a brand-new player. Act 2 is appended once played. */
export function titleLine(best: PersonalBest, act2?: PersonalBest): string | null {
  const parts: string[] = [];
  if (best.bestMs !== null) parts.push(`Your best: ${fmt(best.bestMs)}`);
  else if (best.furthestNight > 0) parts.push(`Best: reached night ${best.furthestNight}`);
  if (act2?.bestMs != null) parts.push(`Act 2: ${fmt(act2.bestMs)}`);
  else if (act2 && act2.furthestNight > 0) parts.push(`Act 2: reached night ${act2.furthestNight}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Has this device unlocked Act 2 (by winning Act 1, now or before the flag existed)? */
export function isAct2Unlocked(store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    if (store.getItem(ACT2_UNLOCK_KEY) === "1") return true;
  } catch {
    return false;
  }
  return loadBest(store, 1).bestMs !== null;
}

export function unlockAct2(store: KeyValueStore | null): void {
  try {
    store?.setItem(ACT2_UNLOCK_KEY, "1");
  } catch {
    /* private mode: Act 2 is still reachable via "Continue" right after the win */
  }
}

/** localStorage if usable; null when blocked (some private modes throw on access). */
export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}
