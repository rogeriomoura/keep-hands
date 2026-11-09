import { describe, expect, it, vi } from "vitest";
import {
  createSettingsStore,
  type MediaQueryListLike,
  type StorageLike,
} from "../src/settings";

const KEY = "keep-hands:reduced-motion";

/** matchMedia stand-in whose "OS preference" can be flipped by the test. */
function fakeMedia(initial: boolean) {
  let cb: ((e: { matches: boolean }) => void) | null = null;
  const mql: MediaQueryListLike = {
    matches: initial,
    addEventListener: (_type, fn) => {
      cb = fn;
    },
  };
  return {
    matchMedia: vi.fn(() => mql),
    setOs(matches: boolean) {
      mql.matches = matches;
      cb?.({ matches });
    },
  };
}

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe("reduced motion setting", () => {
  it("defaults to the OS preference and follows it until the player chooses", () => {
    const media = fakeMedia(true);
    const s = createSettingsStore({ matchMedia: media.matchMedia, storage: memoryStorage() });
    expect(media.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(s.getReducedMotion()).toBe(true);
    media.setOs(false);
    expect(s.getReducedMotion()).toBe(false);
  });

  it("defaults to off with no matchMedia (e.g. Node)", () => {
    expect(createSettingsStore({}).getReducedMotion()).toBe(false);
  });

  it("an explicit choice persists and wins over the OS", () => {
    const media = fakeMedia(false);
    const storage = memoryStorage();
    const s = createSettingsStore({ matchMedia: media.matchMedia, storage });
    s.setReducedMotion(true);
    expect(storage.data[KEY]).toBe("1");
    expect(s.getReducedMotion()).toBe(true);

    // a later page load reads the saved choice, even though the OS says otherwise
    const reloaded = createSettingsStore({ matchMedia: fakeMedia(false).matchMedia, storage });
    expect(reloaded.getReducedMotion()).toBe(true);

    reloaded.setReducedMotion(false);
    expect(storage.data[KEY]).toBe("0");
    const again = createSettingsStore({ matchMedia: fakeMedia(true).matchMedia, storage });
    expect(again.getReducedMotion()).toBe(false);
  });

  it("ignores OS changes after an explicit choice", () => {
    const media = fakeMedia(false);
    const s = createSettingsStore({ matchMedia: media.matchMedia, storage: memoryStorage() });
    s.setReducedMotion(false);
    const cb = vi.fn();
    s.onSettingsChange(cb);
    media.setOs(true);
    expect(s.getReducedMotion()).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it("notifies listeners only on effective changes, and unsubscribes", () => {
    const media = fakeMedia(false);
    const s = createSettingsStore({ matchMedia: media.matchMedia, storage: memoryStorage() });
    const cb = vi.fn();
    const off = s.onSettingsChange(cb);

    media.setOs(true); // following the OS: effective value changed
    expect(cb).toHaveBeenCalledTimes(1);
    s.setReducedMotion(true); // explicit, but same effective value
    expect(cb).toHaveBeenCalledTimes(1);
    s.setReducedMotion(false);
    expect(cb).toHaveBeenCalledTimes(2);

    off();
    s.setReducedMotion(true);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("a throwing listener doesn't stop the others", () => {
    const s = createSettingsStore({ storage: memoryStorage() });
    const good = vi.fn();
    s.onSettingsChange(() => {
      throw new Error("boom");
    });
    s.onSettingsChange(good);
    s.setReducedMotion(true);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("survives storage that throws (private mode) and still applies for the session", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const s = createSettingsStore({ matchMedia: fakeMedia(false).matchMedia, storage: broken });
    expect(s.getReducedMotion()).toBe(false);
    expect(() => s.setReducedMotion(true)).not.toThrow();
    expect(s.getReducedMotion()).toBe(true);
  });

  it("ignores garbage stored values", () => {
    const s = createSettingsStore({
      matchMedia: fakeMedia(true).matchMedia,
      storage: memoryStorage({ [KEY]: "maybe" }),
    });
    expect(s.getReducedMotion()).toBe(true);
  });

  it("works with the legacy addListener API (older Safari)", () => {
    let cb: ((e: { matches: boolean }) => void) | null = null;
    const mql: MediaQueryListLike = { matches: false, addListener: (fn) => (cb = fn) };
    const s = createSettingsStore({ matchMedia: () => mql, storage: memoryStorage() });
    cb!({ matches: true });
    expect(s.getReducedMotion()).toBe(true);
  });
});
