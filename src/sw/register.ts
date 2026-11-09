/**
 * Registers the offline service worker (production builds only) and shows a
 * small "update ready" prompt when a newer deploy has been downloaded. The new
 * version only takes over when the player taps Reload — never mid-run on its
 * own — otherwise it activates on the next launch.
 */

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  let acceptedUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // the first install also fires this (clients.claim) — only reload on consent
    if (!acceptedUpdate) return;
    acceptedUpdate = false;
    window.location.reload();
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      const offer = (worker: ServiceWorker) =>
        showUpdatePrompt(() => {
          acceptedUpdate = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        });

      // an update downloaded on a previous visit is still waiting
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          // "installed" with an existing controller = an update, not the first install
          if (incoming.state === "installed" && navigator.serviceWorker.controller) offer(incoming);
        });
      });

      // Home Screen apps can stay open for days: look for a new deploy on resume
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    } catch {
      /* offline support is best-effort; the game works without it */
    }
  };

  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}

let promptEl: HTMLDivElement | null = null;

function showUpdatePrompt(onReload: () => void): void {
  if (promptEl) return;
  injectStyles();
  promptEl = document.createElement("div");
  promptEl.className = "sw-update";
  promptEl.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "New version ready";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "sw-update-reload";
  reload.textContent = "Reload";
  reload.title = "Reload to update (restarts a run in progress)";
  const later = document.createElement("button");
  later.type = "button";
  later.className = "sw-update-later";
  later.textContent = "Later";
  later.setAttribute("aria-label", "Update later (applies next launch)");
  reload.addEventListener("click", () => {
    reload.disabled = true;
    onReload();
  });
  later.addEventListener("click", () => {
    promptEl?.remove();
    promptEl = null;
  });
  promptEl.append(text, reload, later);
  document.body.append(promptEl);
}

function injectStyles(): void {
  if (document.getElementById("sw-update-styles")) return;
  const style = document.createElement("style");
  style.id = "sw-update-styles";
  style.textContent = `
.sw-update {
  position: fixed;
  left: 50%;
  bottom: max(1rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.55rem 0.45rem 0.9rem;
  font: 600 0.85rem "IBM Plex Sans", system-ui, sans-serif;
  color: #f0e6d4;
  background: rgba(24, 19, 14, 0.94);
  border: 1px solid #8a6a40;
  border-radius: 0.6rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}
.sw-update button {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
.sw-update .sw-update-later {
  background: transparent;
  border-color: transparent;
  color: #cbb89a;
}`;
  document.head.append(style);
}
