-- Initial schema for the self-hosted analytics.
--
-- Run this ONCE against a fresh Postgres database (Neon free tier works
-- great). Set DATABASE_URL on Vercel to that connection string and the
-- /api/event route + /admin dashboard start working.
--
-- Privacy model: we only ever persist (timestamp, path, referrer host,
-- daily-rotating visitor hash). No IP, no User-Agent, no cookie, no
-- per-session identifier that crosses days. See apps/web/lib/analytics.ts.

CREATE TABLE IF NOT EXISTS analytics_events (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  path            TEXT NOT NULL,
  referrer_host   TEXT,
  -- sha256 hex of (date_YYYY_MM_DD || ip || ua || ANALYTICS_SALT).
  -- Hashed daily so it cannot be used to link the same visitor across
  -- days; pseudonymous within a day for unique-visitor counts.
  visitor_hash    CHAR(64) NOT NULL
);

-- Aggregations scope to a date range; this index covers them all.
CREATE INDEX IF NOT EXISTS idx_events_ts ON analytics_events (ts);
