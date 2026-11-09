import { describe, expect, it } from "vitest";
import {
  FONT_CACHE,
  SHELL_CACHE_PREFIX,
  routeRequest,
  selectPrecacheFiles,
  shellCacheName,
} from "../src/sw/precache";

describe("selectPrecacheFiles", () => {
  it("caches index.html under the scope root and keeps bundles, sounds and icons", () => {
    expect(
      selectPrecacheFiles([
        "index.html",
        "assets/index-abc123.js",
        "assets/index-def456.css",
        "sfx/coins.m4a",
        "manifest.webmanifest",
        "apple-touch-icon.png",
      ]),
    ).toEqual([
      "./",
      "apple-touch-icon.png",
      "assets/index-abc123.js",
      "assets/index-def456.css",
      "manifest.webmanifest",
      "sfx/coins.m4a",
    ]);
  });

  it("skips the worker itself, source maps, docs and dotfiles", () => {
    expect(
      selectPrecacheFiles([
        "sw.js",
        "assets/index-abc.js.map",
        "sfx/CREDITS.md",
        ".DS_Store",
        "sfx/.hidden/x.m4a",
        "favicon.svg",
      ]),
    ).toEqual(["favicon.svg"]);
  });

  it("normalizes Windows separators and leading ./, and de-duplicates", () => {
    expect(selectPrecacheFiles(["assets\\a.js", "./assets/a.js", "/assets/a.js"])).toEqual([
      "assets/a.js",
    ]);
  });
});

describe("routeRequest", () => {
  const scope = "https://rogeriomoura.github.io/keep-hands/";
  const req = (url: string, mode = "cors", method = "GET") => routeRequest({ url, mode, method, scope });

  it("serves page navigations inside the app from the cached shell", () => {
    expect(req(scope, "navigate")).toBe("shell");
    expect(req(`${scope}?v=123`, "navigate")).toBe("shell");
    expect(req(`${scope}index.html`, "navigate")).toBe("shell");
  });

  it("serves the app's own files cache-first", () => {
    expect(req(`${scope}assets/index-abc.js`)).toBe("precache");
    expect(req(`${scope}sfx/coins.m4a`, "no-cors")).toBe("precache");
  });

  it("never intercepts the leaderboard API", () => {
    expect(req("https://leaderboard.keep-hands.workers.dev/scores?limit=10")).toBe("network");
    expect(req("https://keep-hands-leaderboard.keep-hands-leaderboard.workers.dev/runs", "cors", "POST")).toBe(
      "network",
    );
  });

  it("leaves other sites, other paths on the same origin, and non-GET alone", () => {
    expect(req("https://example.com/x.js")).toBe("network");
    expect(req("https://rogeriomoura.github.io/other-project/", "navigate")).toBe("network");
    expect(req(`${scope}assets/a.js`, "cors", "POST")).toBe("network");
    expect(routeRequest({ url: "not a url", mode: "cors", method: "GET", scope })).toBe("network");
  });

  it("caches Google Fonts at runtime", () => {
    expect(req("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans", "no-cors")).toBe("font");
    expect(req("https://fonts.gstatic.com/s/ibmplexsans/v19/abc.woff2")).toBe("font");
  });

  it("works when served from the domain root too", () => {
    expect(routeRequest({ url: "http://localhost:5177/assets/a.js", mode: "cors", method: "GET", scope: "http://localhost:5177/" })).toBe(
      "precache",
    );
  });
});

describe("cache names", () => {
  it("versions the shell cache per build and keeps fonts separate", () => {
    expect(shellCacheName("abc123")).toBe(`${SHELL_CACHE_PREFIX}abc123`);
    expect(FONT_CACHE.startsWith(SHELL_CACHE_PREFIX)).toBe(false);
  });
});
