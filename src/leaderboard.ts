/**
 * Client for the Keep Hands leaderboard Worker (see /leaderboard).
 * Everything fails soft: if the API is unset or unreachable, callers get
 * null / an error code and the UI simply hides the board.
 */

export type ScoreEntry = { initials: string; timeMs: number; createdAt: number };

export type SubmitResult =
  | { ok: true; rank: number; top: ScoreEntry[] }
  | { ok: false; error: string };

const BASE = ((import.meta.env.VITE_LEADERBOARD_URL as string | undefined) ?? "").replace(/\/+$/, "");

export const leaderboardEnabled = BASE.length > 0;

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T } | null> {
  if (!leaderboardEnabled) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    return { status: res.status, body: (await res.json()) as T };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Act = 1 | 2;

/**
 * Ask the server to stamp the start of a run; the token proves when it began and
 * which act it is (the act is signed in, so a time can only land on its own board).
 */
export async function startRun(act: Act = 1): Promise<string | null> {
  const res = await request<{ token?: string }>("/runs", {
    method: "POST",
    body: JSON.stringify({ act }),
  });
  return res?.status === 200 && res.body.token ? res.body.token : null;
}

export async function submitScore(
  token: string | null,
  initials: string,
  timeMs: number,
): Promise<SubmitResult> {
  if (!token) return { ok: false, error: "no_token" };
  const res = await request<{ rank?: number; top?: ScoreEntry[]; error?: string }>("/scores", {
    method: "POST",
    body: JSON.stringify({ token, initials, timeMs }),
  });
  if (!res) return { ok: false, error: "offline" };
  if (res.status === 201 && res.body.rank && res.body.top) {
    return { ok: true, rank: res.body.rank, top: res.body.top };
  }
  return { ok: false, error: res.body.error ?? "server_error" };
}

export async function fetchTop(limit = 10, act: Act = 1): Promise<ScoreEntry[] | null> {
  const res = await request<{ top?: ScoreEntry[] }>(`/scores?act=${act}&limit=${limit}`);
  return res?.status === 200 && res.body.top ? res.body.top : null;
}

export function describeSubmitError(error: string): string {
  // the run itself works offline (service worker); only posting needs a connection
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline, so your time couldn't be posted.";
  }
  switch (error) {
    case "rate_limited":
      return "Too many submissions. Try again in a few minutes.";
    case "already_submitted":
      return "This run is already on the board.";
    case "implausible_time":
    case "bad_token":
    case "token_expired":
    case "no_token":
      return "This run couldn't be verified, so it can't be posted.";
    case "bad_initials":
      return "Use exactly 3 letters.";
    default:
      return "Couldn't reach the leaderboard. Check your connection.";
  }
}
