/**
 * Pure helpers shared by the service worker (src/sw/sw.ts), its build step
 * (build/serviceWorker.ts) and the tests. No DOM or service-worker globals here.
 */

/** Prefix for the per-build app-shell cache; old versions are deleted on activate. */
export const SHELL_CACHE_PREFIX = "keep-hands-shell-";
/** Google Fonts live in their own long-lived runtime cache (survives app updates). */
export const FONT_CACHE = "keep-hands-fonts";

const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

export function shellCacheName(version: string): string {
  return `${SHELL_CACHE_PREFIX}${version}`;
}

/**
 * Which built files the service worker downloads at install so the game runs
 * offline. Input: paths relative to the build output dir (any separator).
 * index.html is cached under the scope root ("./") because that is the URL the
 * page is opened at; source maps, docs, dotfiles and the worker itself are skipped.
 */
export function selectPrecacheFiles(files: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of files) {
    const file = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!file || file.split("/").some((part) => part.startsWith("."))) continue;
    if (file === "sw.js" || file.endsWith(".map") || file.endsWith(".md")) continue;
    out.add(file === "index.html" ? "./" : file);
  }
  return [...out].sort();
}

export type Route = "shell" | "precache" | "font" | "network";

/**
 * How the worker answers a request:
 * - shell: page navigations inside the app → the cached index.html (works offline)
 * - precache: other same-origin files inside the app → cache first, then network
 * - font: Google Fonts CSS/files → stale-while-revalidate runtime cache
 * - network: everything else (leaderboard API, other sites, non-GET) → untouched
 */
export function routeRequest(req: {
  url: string;
  method: string;
  mode: string;
  scope: string;
}): Route {
  if (req.method !== "GET") return "network";
  let url: URL;
  let scope: URL;
  try {
    url = new URL(req.url);
    scope = new URL(req.scope);
  } catch {
    return "network";
  }
  if (FONT_HOSTS.has(url.hostname)) return "font";
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return "network";
  return req.mode === "navigate" ? "shell" : "precache";
}
