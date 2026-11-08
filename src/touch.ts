export function isTouchPlayDevice(): boolean {
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
  // iPadOS desktop-class browsing can report a fine pointer; still need pads
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return touchPoints > 1 && shortSide <= 1180;
}

export function bindTouchControls(
  root: HTMLElement,
  setKey: (code: string, down: boolean) => void,
) {
  root.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
    const code = el.dataset.key;
    if (!code) return;

    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setKey(code, true);
      el.classList.add("is-down");
      try {
        el.setPointerCapture((e as PointerEvent).pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (e: Event) => {
      e.preventDefault();
      setKey(code, false);
      el.classList.remove("is-down");
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  });
}

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** True when the page can request element fullscreen (false on iPhone Safari). */
export function canFullscreen(): boolean {
  const doc = document as FullscreenDoc & { webkitFullscreenEnabled?: boolean };
  return Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

/** Launched from the Home Screen as a web app — already chrome-free. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export async function exitFullscreen() {
  const doc = document as FullscreenDoc;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (doc.webkitFullscreenElement) await Promise.resolve(doc.webkitExitFullscreen?.());
  } catch {
    /* already out */
  }
}

export function isFullscreenActive(): boolean {
  const doc = document as FullscreenDoc;
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

/** Best-effort immersive mode. iOS Safari may refuse true fullscreen; CSS fallback still expands. */
export async function enterImmersive(target: HTMLElement = document.documentElement) {
  document.body.classList.add("immersive");

  if (isFullscreenActive()) {
    document.body.classList.add("is-fullscreen");
    window.scrollTo(0, 1);
    return;
  }

  const candidates: FullscreenEl[] = [
    target as FullscreenEl,
    document.documentElement as FullscreenEl,
    document.body as FullscreenEl,
  ];

  for (const el of candidates) {
    const req =
      el.requestFullscreen?.bind(el) ||
      el.webkitRequestFullscreen?.bind(el) ||
      el.webkitRequestFullScreen?.bind(el);
    if (!req) continue;
    try {
      await Promise.resolve(
        // navigationUI helps hide browser chrome where supported
        el.requestFullscreen
          ? el.requestFullscreen({ navigationUI: "hide" })
          : req(),
      );
      if (isFullscreenActive()) break;
    } catch {
      /* try next candidate / iOS permission */
    }
  }

  document.body.classList.toggle("is-fullscreen", isFullscreenActive());

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: OrientationLockType) => Promise<void>;
    };
    if (typeof orientation?.lock === "function") {
      await orientation.lock("landscape");
    }
  } catch {
    /* optional */
  }

  // Nudge mobile browser chrome to collapse where possible
  window.scrollTo(0, 1);
  requestAnimationFrame(() => window.scrollTo(0, 1));
}
