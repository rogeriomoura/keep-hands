/**
 * Keep Hands leaderboard — fastest full runs (all 5 nights).
 *
 *   POST /runs    { act? }  → { token }              call when a run starts (act 1 or 2)
 *   POST /scores  { token, initials, timeMs }        call when a run is won
 *                 → { rank, act, entry, top }        (the act comes from the token)
 *   GET  /scores?act=1&limit=10 → { top }
 *
 * The game runs on the player's device, so a time can never be fully trusted.
 * The run token makes casual cheating impractical: it is HMAC-signed with a
 * server secret, single-use, and records when the run started, so a claimed
 * time can't exceed the real time that passed (the in-game clock never runs
 * faster than wall time; it pauses during the shop).
 */

export interface Env {
  DB: D1Database;
  RUN_SECRET: string;
  ALLOWED_ORIGINS: string;
}

/**
 * Fastest plausible win per act: 5 preps × 15s + the time each night needs just to
 * spawn its roster (Act 1 ≈ 111s, Act 2 ≈ 127s; see src/game/acts.ts
 * theoreticalMinSeconds — a game test keeps these floors below it).
 */
const MIN_RUN_MS_BY_ACT: Record<Act, number> = { 1: 105_000, 2: 120_000 };
type Act = 1 | 2;
const MAX_RUN_MS = 3 * 60 * 60 * 1000;
/** A run (including unlimited shop time) must finish within this long of starting */
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Network + timer rounding between the client clock and the token timestamp */
const CLOCK_SLACK_MS = 3_000;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const INITIALS = /^[A-Z]{3}$/;

type ScoreRow = { initials: string; time_ms: number; created_at: number };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = isAllowedOrigin(origin, env);
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }
    // Browsers on other sites may not write scores (non-browser clients send no Origin)
    if (origin && !allowed) {
      return json({ error: "origin_not_allowed" }, 403, cors);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/runs" && request.method === "POST") {
        const act = await requestedAct(request);
        if (!act) return json({ error: "bad_act" }, 400, cors);
        return json({ token: await mintToken(env, act) }, 200, cors);
      }
      if (url.pathname === "/scores" && request.method === "GET") {
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
        const act = parseAct(url.searchParams.get("act") ?? "1");
        if (!act) return json({ error: "bad_act" }, 400, cors);
        return json({ top: await topScores(env, limit, act) }, 200, cors);
      }
      if (url.pathname === "/scores" && request.method === "POST") {
        return await submitScore(request, env, cors);
      }
      if (url.pathname === "/" && request.method === "GET") {
        return json({ ok: true }, 200, cors);
      }
      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      console.error("leaderboard error", err);
      return json({ error: "server_error" }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;

async function submitScore(request: Request, env: Env, cors: HeadersInit) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400, cors);
  }
  const { token, initials: rawInitials, timeMs: rawTime } = (body ?? {}) as Record<string, unknown>;

  const initials = typeof rawInitials === "string" ? rawInitials.trim().toUpperCase() : "";
  if (!INITIALS.test(initials)) return json({ error: "bad_initials" }, 400, cors);

  if (typeof rawTime !== "number" || !Number.isFinite(rawTime)) {
    return json({ error: "bad_time" }, 400, cors);
  }
  const timeMs = Math.round(rawTime);
  if (typeof token !== "string") return json({ error: "bad_token" }, 400, cors);
  const run = await verifyToken(token, env);
  if (!run) return json({ error: "bad_token" }, 400, cors);
  // the act is whatever the server signed when the run started, never client-claimed
  if (timeMs < MIN_RUN_MS_BY_ACT[run.act] || timeMs > MAX_RUN_MS) {
    return json({ error: "implausible_time" }, 400, cors);
  }

  const now = Date.now();
  const realElapsed = now - run.startedAt;
  if (realElapsed > TOKEN_MAX_AGE_MS) return json({ error: "token_expired" }, 400, cors);
  // the in-game clock can't have counted more time than actually passed
  if (timeMs > realElapsed + CLOCK_SLACK_MS) return json({ error: "implausible_time" }, 400, cors);

  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP"), env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?",
  )
    .bind(ipHash, now - RATE_LIMIT_WINDOW_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_LIMIT_COUNT) return json({ error: "rate_limited" }, 429, cors);

  try {
    await env.DB.prepare(
      "INSERT INTO scores (run_id, initials, time_ms, created_at, ip_hash, act) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(run.runId, initials, timeMs, now, ipHash, run.act)
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return json({ error: "already_submitted" }, 409, cors);
    throw err;
  }

  const ahead = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE act = ? AND time_ms < ?")
    .bind(run.act, timeMs)
    .first<{ n: number }>();

  return json(
    {
      rank: (ahead?.n ?? 0) + 1,
      act: run.act,
      entry: { initials, timeMs },
      top: await topScores(env, 10, run.act),
    },
    201,
    cors,
  );
}

async function topScores(env: Env, limit: number, act: Act) {
  const { results } = await env.DB.prepare(
    "SELECT initials, time_ms, created_at FROM scores WHERE act = ? ORDER BY time_ms ASC, created_at ASC LIMIT ?",
  )
    .bind(act, limit)
    .all<ScoreRow>();
  return results.map((r) => ({ initials: r.initials, timeMs: r.time_ms, createdAt: r.created_at }));
}

// —— Run tokens ——
// Act 2+: "<runId>.<startedAt>.<act>.<base64url HMAC-SHA256>" (the act is signed)
// Legacy:  "<runId>.<startedAt>.<base64url HMAC-SHA256>" → Act 1

function parseAct(raw: unknown): Act | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return n === 1 || n === 2 ? n : null;
}

/** Act asked for when starting a run; an empty or JSON-less body means Act 1. */
async function requestedAct(request: Request): Promise<Act | null> {
  const text = await request.text();
  if (!text.trim()) return 1;
  try {
    const body = JSON.parse(text) as { act?: unknown } | null;
    return body?.act === undefined ? 1 : parseAct(body.act);
  } catch {
    return null;
  }
}

async function mintToken(env: Env, act: Act): Promise<string> {
  const payload = act === 1 ? `${crypto.randomUUID()}.${Date.now()}` : `${crypto.randomUUID()}.${Date.now()}.${act}`;
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyToken(
  token: string,
  env: Env,
): Promise<{ runId: string; startedAt: number; act: Act } | null> {
  const parts = token.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sigRaw = parts[parts.length - 1]!;
  const [runId, startedRaw] = parts as [string, string];
  const act = parts.length === 4 ? parseAct(parts[2]) : 1;
  // Act 1 tokens never carry an act field, so a "<…>.1.<sig>" form isn't valid
  if (!act || (parts.length === 4 && act === 1)) return null;
  const startedAt = Number(startedRaw);
  if (!runId || !Number.isSafeInteger(startedAt)) return null;
  const sig = fromBase64Url(sigRaw);
  if (!sig) return null;
  const key = await hmacKey(env);
  const signed = parts.slice(0, -1).join(".");
  // constant-time comparison happens inside subtle.verify
  const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(signed));
  if (!ok || startedAt > Date.now() + CLOCK_SLACK_MS) return null;
  return { runId, startedAt, act };
}

function hmacKey(env: Env) {
  if (!env.RUN_SECRET) throw new Error("RUN_SECRET is not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.RUN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hashIp(ip: string | null, env: Env): Promise<string> {
  const data = new TextEncoder().encode(`${env.RUN_SECRET}|${ip ?? "unknown"}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// —— helpers ——

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).includes(origin);
}

function corsHeaders(origin: string | null, allowed: boolean): HeadersInit {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(data: unknown, status: number, extra: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function clampInt(raw: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
