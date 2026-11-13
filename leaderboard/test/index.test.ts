import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";

// Must match the bindings in vitest.config.ts
const SECRET = "test-run-secret";
const ORIGIN = "http://localhost:5173";
const OTHER_ORIGIN = "https://evil.example";

type Body = Record<string, unknown> & {
  error?: string;
  token?: string;
  rank?: number;
  entry?: { initials: string; timeMs: number };
  top?: { initials: string; timeMs: number; createdAt: number }[];
};

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A run token exactly as the Worker mints it, but started `ageMs` ago. */
async function token(ageMs: number): Promise<string> {
  const payload = `${crypto.randomUUID()}.${Date.now() - ageMs}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; origin?: string | null; ip?: string } = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.Origin = origin;
  headers["CF-Connecting-IP"] = opts.ip ?? "203.0.113.10";
  const res = await worker.fetch(
    new Request(`https://leaderboard.test${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as Body };
}

const submit = async (body: unknown, ip?: string) => call("POST", "/scores", { body, ip });

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM scores").run();
});

describe("GET /scores", () => {
  it("returns an empty board", async () => {
    const r = await call("GET", "/scores");
    expect(r.status).toBe(200);
    expect(r.body.top).toEqual([]);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("clamps the limit to 1..50 and defaults to 10", async () => {
    const now = Date.now();
    const rows = Array.from({ length: 55 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO scores (run_id, initials, time_ms, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)",
      ).bind(`seed-${i}`, "AAA", 120_000 + i, now + i, "seed"),
    );
    await env.DB.batch(rows);

    expect((await call("GET", "/scores?limit=0")).body.top).toHaveLength(1);
    expect((await call("GET", "/scores?limit=999")).body.top).toHaveLength(50);
    expect((await call("GET", "/scores?limit=abc")).body.top).toHaveLength(10);
    expect((await call("GET", "/scores")).body.top).toHaveLength(10);
  });
});

describe("CORS", () => {
  it("answers the preflight for an allowed origin", async () => {
    const r = await call("OPTIONS", "/scores");
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("refuses the preflight for another origin", async () => {
    const r = await call("OPTIONS", "/scores", { origin: OTHER_ORIGIN });
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses a POST from another origin", async () => {
    const r = await call("POST", "/scores", {
      origin: OTHER_ORIGIN,
      body: { token: await token(200_000), initials: "ABC", timeMs: 150_000 },
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("origin_not_allowed");
  });
});

describe("POST /runs", () => {
  it("mints a three-part signed token", async () => {
    const r = await call("POST", "/runs");
    expect(r.status).toBe(200);
    const parts = String(r.body.token).split(".");
    expect(parts).toHaveLength(3);
    expect(Number(parts[1])).toBeGreaterThan(Date.now() - 5_000);
  });
});

describe("POST /scores validation", () => {
  it("rejects a tampered token", async () => {
    const minted = String((await call("POST", "/runs")).body.token);
    const tampered = `${minted.slice(0, -2)}${minted.endsWith("AA") ? "BB" : "AA"}`;
    const r = await submit({ token: tampered, initials: "ABC", timeMs: 150_000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_token");
  });

  it("rejects a token signed with a different secret", async () => {
    const [id, started] = (await token(200_000)).split(".");
    const r = await submit({ token: `${id}.${started}.AAAA`, initials: "ABC", timeMs: 150_000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_token");
  });

  it("rejects a claimed time longer than the real time elapsed", async () => {
    const fresh = String((await call("POST", "/runs")).body.token);
    const r = await submit({ token: fresh, initials: "ABC", timeMs: 150_000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("implausible_time");
  });

  it("rejects a time under the 105s floor", async () => {
    const r = await submit({ token: await token(200_000), initials: "ABC", timeMs: 90_000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("implausible_time");
  });

  it("rejects bad initials", async () => {
    for (const initials of ["AB", "ABCD", "A1C", "", 123]) {
      const r = await submit({ token: await token(200_000), initials, timeMs: 150_000 });
      expect(r.status, String(initials)).toBe(400);
      expect(r.body.error).toBe("bad_initials");
    }
  });

  it("rejects a non-numeric time and bad JSON", async () => {
    const r = await submit({ token: await token(200_000), initials: "ABC", timeMs: "150000" });
    expect(r.body.error).toBe("bad_time");
    const res = await worker.fetch(
      new Request("https://leaderboard.test/scores", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: "{not json",
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Body).error).toBe("bad_json");
  });

  it("rejects an expired token (older than 12h)", async () => {
    const r = await submit({ token: await token(13 * 60 * 60 * 1000), initials: "ABC", timeMs: 150_000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("token_expired");
  });
});

describe("POST /scores accepted runs", () => {
  it("stores a valid run, uppercases initials, and ranks it", async () => {
    const r = await submit({ token: await token(200_000), initials: "abc", timeMs: 150_000 });
    expect(r.status).toBe(201);
    expect(r.body.rank).toBe(1);
    expect(r.body.entry).toEqual({ initials: "ABC", timeMs: 150_000 });
    expect(r.body.top?.[0]).toMatchObject({ initials: "ABC", timeMs: 150_000 });
  });

  it("refuses to replay the same token", async () => {
    const t = await token(200_000);
    expect((await submit({ token: t, initials: "ABC", timeMs: 150_000 })).status).toBe(201);
    const again = await submit({ token: t, initials: "ABC", timeMs: 140_000 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already_submitted");
  });

  it("orders the board by time and reports each run's rank", async () => {
    const runs: [string, number, number][] = [
      ["MID", 150_000, 1],
      ["TOP", 120_000, 1],
      ["LOW", 200_000, 3],
      ["TWO", 130_000, 2],
    ];
    for (const [initials, timeMs, rank] of runs) {
      const r = await submit({ token: await token(300_000), initials, timeMs }, `198.51.100.${rank}${timeMs}`);
      expect(r.status).toBe(201);
      expect(r.body.rank, initials).toBe(rank);
    }
    const board = await call("GET", "/scores");
    expect(board.body.top?.map((e) => e.initials)).toEqual(["TOP", "TWO", "MID", "LOW"]);
  });

  it("rate-limits a 6th submission from one IP within 10 minutes", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 5; i++) {
      const r = await submit({ token: await token(300_000), initials: "RAT", timeMs: 150_000 + i }, ip);
      expect(r.status, `submission ${i + 1}`).toBe(201);
    }
    const sixth = await submit({ token: await token(300_000), initials: "RAT", timeMs: 160_000 }, ip);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe("rate_limited");

    // a different IP is unaffected
    const other = await submit({ token: await token(300_000), initials: "OTH", timeMs: 160_000 }, "192.0.2.78");
    expect(other.status).toBe(201);
  });
});

describe("routing", () => {
  it("returns 404 for unknown paths", async () => {
    expect((await call("GET", "/nope")).status).toBe(404);
  });
});

/** An Act 2 token (act signed into the payload), started `ageMs` ago. */
async function act2Token(ageMs: number, actField = "2"): Promise<string> {
  const payload = `${crypto.randomUUID()}.${Date.now() - ageMs}.${actField}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

describe("acts", () => {
  it("mints Act 2 tokens with the act signed in, and Act 1 tokens in the legacy form", async () => {
    const a2 = await call("POST", "/runs", { body: { act: 2 } });
    expect(a2.status).toBe(200);
    expect(a2.body.token!.split(".")).toHaveLength(4);
    expect(a2.body.token!.split(".")[2]).toBe("2");
    const a1 = await call("POST", "/runs", { body: { act: 1 } });
    expect(a1.body.token!.split(".")).toHaveLength(3);
    const none = await call("POST", "/runs");
    expect(none.body.token!.split(".")).toHaveLength(3);
  });

  it("rejects unknown acts", async () => {
    expect((await call("POST", "/runs", { body: { act: 3 } })).body.error).toBe("bad_act");
    expect((await call("POST", "/runs", { body: { act: "x" } })).body.error).toBe("bad_act");
    expect((await call("GET", "/scores?act=9")).body.error).toBe("bad_act");
  });

  it("keeps separate boards and ranks within the act", async () => {
    expect((await submit({ token: await token(400_000), initials: "ONE", timeMs: 200_000 }, "198.51.100.1")).status).toBe(201);
    const a2 = await submit({ token: await act2Token(400_000), initials: "TWO", timeMs: 300_000 }, "198.51.100.2");
    expect(a2.status).toBe(201);
    expect(a2.body.act).toBe(2);
    expect(a2.body.rank).toBe(1); // the faster Act 1 time doesn't count against it
    expect(a2.body.top!.map((e) => e.initials)).toEqual(["TWO"]);

    expect((await call("GET", "/scores?act=1")).body.top!.map((e) => e.initials)).toEqual(["ONE"]);
    expect((await call("GET", "/scores?act=2")).body.top!.map((e) => e.initials)).toEqual(["TWO"]);
    // no act = Act 1 (what the current live game asks for)
    expect((await call("GET", "/scores")).body.top!.map((e) => e.initials)).toEqual(["ONE"]);
  });

  it("applies the Act 2 floor (120s) to Act 2 runs only", async () => {
    const quick = 110_000; // fine for Act 1 (floor 105s), too fast for Act 2
    expect((await submit({ token: await token(400_000), initials: "AAA", timeMs: quick }, "198.51.100.3")).status).toBe(201);
    const a2 = await submit({ token: await act2Token(400_000), initials: "BBB", timeMs: quick }, "198.51.100.4");
    expect(a2.status).toBe(400);
    expect(a2.body.error).toBe("implausible_time");
  });

  it("won't accept an Act 1 token re-labelled as Act 2, or an explicit act-1 field", async () => {
    const legacy = await token(400_000);
    const [id, started, sig] = legacy.split(".");
    const forged = `${id}.${started}.2.${sig}`;
    expect((await submit({ token: forged, initials: "CCC", timeMs: 300_000 }, "198.51.100.5")).body.error).toBe("bad_token");
    const explicitOne = await act2Token(400_000, "1");
    expect((await submit({ token: explicitOne, initials: "DDD", timeMs: 300_000 }, "198.51.100.6")).body.error).toBe("bad_token");
  });
});
