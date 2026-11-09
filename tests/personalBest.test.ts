import { describe, expect, it } from "vitest";
import {
  EMPTY_BEST,
  PERSONAL_BEST_KEY,
  loadBest,
  lossMessage,
  recordLoss,
  recordWin,
  saveBest,
  titleLine,
  winMessage,
  type KeyValueStore,
} from "../src/personalBest";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("personal best: wins", () => {
  it("records the first win as a new best", () => {
    const { next, outcome } = recordWin(EMPTY_BEST, 233_068, 1000);
    expect(outcome).toEqual({ kind: "first", timeMs: 233_068 });
    expect(next).toEqual({ bestMs: 233_068, bestAt: 1000, furthestNight: 5 });
    expect(winMessage(outcome)).toEqual({ text: "New personal best! Your first full run.", isNew: true });
  });

  it("replaces the best when a run is faster and reports the margin", () => {
    const prev = { bestMs: 233_068, bestAt: 1000, furthestNight: 5 };
    const { next, outcome } = recordWin(prev, 220_000, 2000);
    expect(outcome).toEqual({ kind: "new-best", timeMs: 220_000, previousMs: 233_068, improvedByMs: 13_068 });
    expect(next.bestMs).toBe(220_000);
    expect(next.bestAt).toBe(2000);
    expect(winMessage(outcome).text).toBe("New personal best! 0:13.0 faster than 3:53.0.");
    expect(winMessage(outcome).isNew).toBe(true);
  });

  it("keeps the best when a run is slower and reports how far off it was", () => {
    const prev = { bestMs: 233_068, bestAt: 1000, furthestNight: 5 };
    const { next, outcome } = recordWin(prev, 251_109, 3000);
    expect(outcome).toEqual({ kind: "not-best", timeMs: 251_109, bestMs: 233_068, behindByMs: 18_041 });
    expect(next).toEqual(prev);
    expect(winMessage(outcome)).toEqual({ text: "Your best: 3:53.0 (this run was 0:18.0 slower).", isNew: false });
  });

  it("treats an exact tie as matching, keeping the original date", () => {
    const prev = { bestMs: 200_000, bestAt: 1000, furthestNight: 5 };
    const { next, outcome } = recordWin(prev, 200_000, 9000);
    expect(outcome.kind).toBe("tied");
    expect(next.bestAt).toBe(1000);
    expect(winMessage(outcome)).toEqual({ text: "You matched your best: 3:20.0.", isNew: false });
  });
});

describe("personal best: losses", () => {
  it("tracks the furthest night before the first win", () => {
    let best = { ...EMPTY_BEST };
    let r = recordLoss(best, 1);
    expect(r.outcome).toEqual({ kind: "furthest", night: 1, improved: true });
    expect(lossMessage(r.outcome).text).toBe("Best so far: reached night 1");
    best = r.next;

    r = recordLoss(best, 3);
    expect(r.outcome).toEqual({ kind: "furthest", night: 3, improved: true });
    expect(lossMessage(r.outcome)).toEqual({ text: "New furthest: you reached night 3!", isNew: true });
    best = r.next;

    r = recordLoss(best, 2);
    expect(r.outcome).toEqual({ kind: "furthest", night: 3, improved: false });
    expect(r.next.furthestNight).toBe(3);
    expect(lossMessage(r.outcome)).toEqual({ text: "Best so far: reached night 3", isNew: false });
  });

  it("shows the best time on a loss once the player has won", () => {
    const won = recordWin(recordLoss(EMPTY_BEST, 3).next, 233_068, 1000).next;
    const r = recordLoss(won, 2);
    expect(r.outcome).toEqual({ kind: "has-won", bestMs: 233_068 });
    expect(lossMessage(r.outcome)).toEqual({ text: "Your best: 3:53.0", isNew: false });
    expect(r.next.bestMs).toBe(233_068);
  });

  it("clamps the night to 1–5", () => {
    expect(recordLoss(EMPTY_BEST, 9).next.furthestNight).toBe(5);
    expect(recordLoss(EMPTY_BEST, 0).next.furthestNight).toBe(1);
  });
});

describe("personal best: title line", () => {
  it("is empty for a brand-new player, then shows progress, then the best time", () => {
    expect(titleLine(EMPTY_BEST)).toBeNull();
    expect(titleLine({ bestMs: null, bestAt: null, furthestNight: 3 })).toBe("Best: reached night 3");
    expect(titleLine({ bestMs: 233_068, bestAt: 1, furthestNight: 5 })).toBe("Your best: 3:53.0");
  });
});

describe("personal best: storage", () => {
  it("round-trips through the store", () => {
    const store = memoryStore();
    const best = { bestMs: 233_068, bestAt: 1794179067688, furthestNight: 5 };
    expect(saveBest(store, best)).toBe(true);
    expect(loadBest(store)).toEqual(best);
  });

  it("treats a missing value or missing store as no best", () => {
    expect(loadBest(memoryStore())).toEqual(EMPTY_BEST);
    expect(loadBest(null)).toEqual(EMPTY_BEST);
    expect(saveBest(null, EMPTY_BEST)).toBe(false);
  });

  it("survives corrupt or tampered data", () => {
    expect(loadBest(memoryStore({ [PERSONAL_BEST_KEY]: "{not json" }))).toEqual(EMPTY_BEST);
    expect(loadBest(memoryStore({ [PERSONAL_BEST_KEY]: "null" }))).toEqual(EMPTY_BEST);
    expect(
      loadBest(memoryStore({ [PERSONAL_BEST_KEY]: JSON.stringify({ bestMs: "fast", bestAt: -4, furthestNight: 99 }) })),
    ).toEqual({ bestMs: null, bestAt: null, furthestNight: 5 });
    expect(
      loadBest(memoryStore({ [PERSONAL_BEST_KEY]: JSON.stringify({ bestMs: -10, furthestNight: 2.7 }) })),
    ).toEqual({ bestMs: null, bestAt: null, furthestNight: 2 });
  });

  it("never throws when storage access is blocked (private mode)", () => {
    expect(loadBest(throwingStore)).toEqual(EMPTY_BEST);
    expect(saveBest(throwingStore, EMPTY_BEST)).toBe(false);
  });
});
