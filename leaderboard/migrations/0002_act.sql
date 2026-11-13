-- Act 2 has its own leaderboard. Existing rows are Act 1 runs.
ALTER TABLE scores ADD COLUMN act INTEGER NOT NULL DEFAULT 1;

CREATE INDEX scores_by_act_time ON scores (act, time_ms, created_at);
