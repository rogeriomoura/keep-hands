/**
 * Keep Hands service worker — offline play.
 *
 * Built separately into <outDir>/sw.js by build/serviceWorker.ts, which injects
 * the per-build precache list and a content-hash version. A new deploy changes
 * the version (so the worker's bytes change), the browser installs it alongside
 * the old one, and the page offers "Update ready" — the new version only takes
 * over when the player accepts (or on the next launch), never mid-run.
 */
import { FONT_CACHE, SHELL_CACHE_PREFIX, routeRequest, shellCacheName } from "./precache";

declare const __PRECACHE__: string[];
declare const __SW_VERSION__: string;

// Minimal service-worker typings (the project compiles against the DOM lib, not WebWorker)
interface ExtendableEvt extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvt extends ExtendableEvt {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface SwGlobal {
  readonly registration: { readonly scope: string };
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", cb: (e: ExtendableEvt) => void): void;
  addEventListener(type: "fetch", cb: (e: FetchEvt) => void): void;
  addEventListener(type: "message", cb: (e: MessageEvent) => void): void;
}

const sw = self as unknown as SwGlobal;
const SHELL = shellCacheName(__SW_VERSION__);
const scopeUrl = (path: string) => new URL(path, sw.registration.scope).href;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // bypass the HTTP cache so a fresh deploy never precaches stale files
      cache.addAll(__PRECACHE__.map((path) => new Request(scopeUrl(path), { cache: "reload" }))),
    ),
  );
  // no skipWaiting here: an update waits until the page asks (see "message")
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL)
          .map((name) => caches.delete(name)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") {
    void sw.skipWaiting();
  }
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  const route = routeRequest({
    url: req.url,
    method: req.method,
    mode: req.mode,
    scope: sw.registration.scope,
  });
  if (route === "network") return; // leaderboard API etc. go straight to the network

  if (route === "shell") {
    event.respondWith(fromShellCache(scopeUrl("./"), req));
  } else if (route === "precache") {
    event.respondWith(fromShellCache(req.url, req));
  } else {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

/** Cache first (this build's files), falling back to the network. */
async function fromShellCache(key: string, req: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(key, { ignoreSearch: true });
  return hit ?? fetch(req);
}

/** Serve cached fonts instantly and refresh them in the background. */
async function staleWhileRevalidate(event: FetchEvt, req: Request): Promise<Response> {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      // opaque (no-cors CSS) responses report status 0 but are still cacheable
      if (res.ok || res.type === "opaque") void cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  if (hit) {
    event.waitUntil(refresh.then(() => undefined));
    return hit;
  }
  return refresh;
}
