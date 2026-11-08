-- Fastest full runs (all 5 nights). One row per finished run.
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,      -- from the signed run token; blocks replaying a token
  initials TEXT NOT NULL,           -- 3 letters A–Z
  time_ms INTEGER NOT NULL,         -- in-game run clock (prep + nights, shop excluded)
  created_at INTEGER NOT NULL,      -- unix ms
  ip_hash TEXT NOT NULL             -- salted SHA-256 of the client IP, only for rate limiting
);

CREATE INDEX scores_by_time ON scores (time_ms, created_at);
CREATE INDEX scores_by_ip ON scores (ip_hash, created_at);
