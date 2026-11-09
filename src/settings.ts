/**
 * Player settings (currently: reduced motion).
 *
 * Reduced motion follows the OS preference (`prefers-reduced-motion: reduce`),
 * including live changes to it, until the player picks a value explicitly; that
 * explicit choice is remembered in localStorage and from then on wins over the OS.
 * Every storage/matchMedia access is guarded so settings never break the game.
 */

const REDUCED_MOTION_KEY = "keep-hands:reduced-motion";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The bits of the browser environment settings depend on (injectable for tests). */
export type SettingsEnv = {
  matchMedia?: (query: string) => MediaQueryListLike;
  storage?: StorageLike | null;
};

export type MediaQueryListLike = {
  matches: boolean;
  addEventListener?: (type: "change", cb: (e: { matches: boolean }) => void) => void;
  /** Safari < 14 */
  addListener?: (cb: (e: { matches: boolean }) => void) => void;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type SettingsStore = {
  getReducedMotion(): boolean;
  setReducedMotion(on: boolean): void;
  onSettingsChange(cb: () => void): () => void;
};

export function createSettingsStore(env: SettingsEnv): SettingsStore {
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch {
        /* a broken listener must not stop the others */
      }
    }
  };

  // explicit player choice: true/false, or null = follow the OS
  let explicit: boolean | null = null;
  try {
    const raw = env.storage?.getItem(REDUCED_MOTION_KEY);
    if (raw === "1") explicit = true;
    else if (raw === "0") explicit = false;
  } catch {
    /* storage blocked (private mode, sandboxed iframe) */
  }

  let osPrefers = false;
  try {
    const mql = env.matchMedia?.(REDUCED_MOTION_QUERY);
    if (mql) {
      osPrefers = Boolean(mql.matches);
      const onChange = (e: { matches: boolean }) => {
        const before = explicit ?? osPrefers;
        osPrefers = Boolean(e.matches);
        if ((explicit ?? osPrefers) !== before) emit();
      };
      if (mql.addEventListener) mql.addEventListener("change", onChange);
      else mql.addListener?.(onChange);
    }
  } catch {
    /* no matchMedia */
  }

  return {
    getReducedMotion: () => explicit ?? osPrefers,
    setReducedMotion(on: boolean) {
      const before = explicit ?? osPrefers;
      explicit = Boolean(on);
      try {
        env.storage?.setItem(REDUCED_MOTION_KEY, explicit ? "1" : "0");
      } catch {
        /* still applies for this session */
      }
      if (explicit !== before) emit();
    },
    onSettingsChange(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

function browserEnv(): SettingsEnv {
  const env: SettingsEnv = {};
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    env.matchMedia = (q) => window.matchMedia(q);
  }
  try {
    if (typeof localStorage !== "undefined") env.storage = localStorage;
  } catch {
    env.storage = null;
  }
  return env;
}

let store: SettingsStore | null = null;
/** Created on first use so importing this module never touches the DOM. */
function defaultStore(): SettingsStore {
  store ??= createSettingsStore(browserEnv());
  return store;
}

export function getReducedMotion(): boolean {
  return defaultStore().getReducedMotion();
}

export function setReducedMotion(on: boolean): void {
  defaultStore().setReducedMotion(on);
}

/** Called whenever an effective setting changes; returns an unsubscribe function. */
export function onSettingsChange(cb: () => void): () => void {
  return defaultStore().onSettingsChange(cb);
}
