-- Schema for the optional Postgres database (Vercel Postgres / Neon).
-- The app works without this — it falls back to the bundled dataset in
-- lib/happy-hours.ts. Attach a database and run `npm run seed` to use Postgres.

CREATE TABLE IF NOT EXISTS happy_hours (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  address      TEXT NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  days         JSONB NOT NULL,          -- e.g. ["Mon","Tue","Wed"]
  start_time   TEXT NOT NULL,           -- "HH:MM" 24h
  end_time     TEXT NOT NULL,           -- "HH:MM" 24h
  deals        JSONB NOT NULL,          -- e.g. ["$5 drafts"]
  categories   JSONB NOT NULL,          -- e.g. ["beer","sports"]
  vibe         TEXT NOT NULL,
  price_level  SMALLINT NOT NULL        -- 1, 2, or 3
);

CREATE INDEX IF NOT EXISTS idx_happy_hours_neighborhood
  ON happy_hours (neighborhood);
