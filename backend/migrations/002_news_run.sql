-- Tracks each news-aggregation run. Replaces per-process in-memory state so that
-- status + the single-run lock work correctly across multiple Swarm replicas.
CREATE TABLE IF NOT EXISTS news_run (
  id          SERIAL PRIMARY KEY,
  trigger     TEXT,
  status      TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'done' | 'failed'
  created     INT NOT NULL DEFAULT 0,
  skipped     INT NOT NULL DEFAULT 0,
  errors      INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- At most ONE run may be 'running' at a time, across all replicas + crons.
-- The pipeline claims a run by inserting a 'running' row; a second concurrent
-- insert (e.g. the other replica's cron) violates this index and is rejected.
CREATE UNIQUE INDEX IF NOT EXISTS ux_news_run_running ON news_run (status) WHERE status = 'running';
