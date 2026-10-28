-- Kikosi member predictions: schema v1 (idempotent; safe to re-run).
-- Free-to-play only: no stakes, balances, payments or prizes are stored anywhere.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Nickname accounts: no phone, email or password. recovery_hash is scrypt(salt, code).
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle citext NOT NULL UNIQUE CHECK (char_length(handle::text) BETWEEN 3 AND 20),
  recovery_hash text NOT NULL,
  is_18_confirmed boolean NOT NULL DEFAULT false CHECK (is_18_confirmed),
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fixtures mirrored from football-data.org; id is football-data's own match id (fdId), stable across reschedules.
CREATE TABLE IF NOT EXISTS matches (
  id integer PRIMARY KEY,
  competition text NOT NULL,
  season integer NOT NULL,
  matchday integer,
  home text NOT NULL,
  away text NOT NULL,
  kickoff_utc timestamptz NOT NULL,
  status text NOT NULL,
  ft_home smallint,
  ft_away smallint,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_status_kickoff_idx ON matches (status, kickoff_utc);
CREATE INDEX IF NOT EXISTS matches_comp_matchday_idx ON matches (competition, season, matchday);

CREATE TABLE IF NOT EXISTS predictions (
  member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  match_id integer NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  home_goals smallint NOT NULL CHECK (home_goals BETWEEN 0 AND 20),
  away_goals smallint NOT NULL CHECK (away_goals BETWEEN 0 AND 20),
  points smallint CHECK (points IS NULL OR points BETWEEN 0 AND 3),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, match_id)
);
CREATE INDEX IF NOT EXISTS predictions_match_idx ON predictions (match_id);
CREATE INDEX IF NOT EXISTS predictions_unsettled_idx ON predictions (match_id) WHERE points IS NULL;
CREATE INDEX IF NOT EXISTS predictions_member_settled_idx ON predictions (member_id, settled_at);

-- Friend leagues (join by code).
CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  join_code text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leagues_owner_idx ON leagues (owner_id);

CREATE TABLE IF NOT EXISTS league_members (
  league_id uuid NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, member_id)
);
CREATE INDEX IF NOT EXISTS league_members_member_idx ON league_members (member_id);

-- Sign-up / restore attempts for rate limiting. key is an HMAC of the IP or the lower-cased handle (no raw IPs stored).
CREATE TABLE IF NOT EXISTS auth_attempts (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key text NOT NULL,
  ok boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup_idx ON auth_attempts (kind, key, at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;

-- ---- v2: settlement, streaks, badges ---------------------------------------------------------------
-- matches.home_short/away_short: display names. settled_score: the "h-a" (or 'void') last settled, so corrections re-score.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_short text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_short text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS settled_score text;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS matches_settle_idx ON matches (status) WHERE settled_score IS NULL;

-- Per-member totals, refreshed during settlement (all-time points also drive the cosmetic rank).
CREATE TABLE IF NOT EXISTS member_stats (
  member_id uuid PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  predictions integer NOT NULL DEFAULT 0,
  settled integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  exact integer NOT NULL DEFAULT 0,
  outcomes integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cosmetic badges only: no prizes or money value.
CREATE TABLE IF NOT EXISTS badges (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  sort integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS member_badges (
  member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  context text,
  PRIMARY KEY (member_id, badge_id)
);
-- Weekly winners already decided (week_start in UTC), so a closed week is only judged once.
CREATE TABLE IF NOT EXISTS weekly_results (
  week_start timestamptz PRIMARY KEY,
  winner_id uuid REFERENCES members (id) ON DELETE SET NULL,
  points integer,
  decided_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING;

-- ---- v3: favourite club, fantasy squads, football-data cache --------------------------------------
ALTER TABLE members ADD COLUMN IF NOT EXISTS fav_team_id integer;

-- Trimmed football-data.org responses (teams + squads per competition, scorers), shared by all instances.
CREATE TABLE IF NOT EXISTS fd_cache (
  key text PRIMARY KEY,
  body jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Fantasy squad of 12 real players (just for fun; no prizes or money value).
CREATE TABLE IF NOT EXISTS fantasy_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES members (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My XII' CHECK (char_length(name) BETWEEN 1 AND 30),
  formation jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fantasy_players (
  squad_id uuid NOT NULL REFERENCES fantasy_squads (id) ON DELETE CASCADE,
  player_id integer NOT NULL,
  team_id integer NOT NULL,
  competition text NOT NULL,
  name text NOT NULL,
  position text,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 11),
  x real NOT NULL CHECK (x BETWEEN 0 AND 100),
  y real NOT NULL CHECK (y BETWEEN 0 AND 100),
  PRIMARY KEY (squad_id, player_id),
  UNIQUE (squad_id, slot)
);
INSERT INTO schema_migrations (version) VALUES (3) ON CONFLICT DO NOTHING;

-- ---- v4: banter (reactions + short comments) with light moderation ---------------------------------
-- target_match_id (nullable) = a reaction to the target member's SETTLED prediction on that match (never before kickoff).
CREATE TABLE IF NOT EXISTS reactions (
  id bigserial PRIMARY KEY,
  reactor_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  target_member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  target_match_id integer REFERENCES matches (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('🔥', '😂', '👏', '🤡', '😬', '🐐')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reactor_id <> target_member_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS reactions_one_each_idx ON reactions (reactor_id, target_member_id, coalesce(target_match_id, 0), emoji);
CREATE INDEX IF NOT EXISTS reactions_target_idx ON reactions (target_member_id, target_match_id);

CREATE TABLE IF NOT EXISTS comments (
  id bigserial PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  target_member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS comments_target_idx ON comments (target_member_id, created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS comments_author_idx ON comments (author_id, created_at);

CREATE TABLE IF NOT EXISTS comment_reports (
  comment_id bigint NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, reporter_id)
);
CREATE TABLE IF NOT EXISTS mutes (
  member_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, muted_id),
  CHECK (member_id <> muted_id)
);
INSERT INTO schema_migrations (version) VALUES (4) ON CONFLICT DO NOTHING;

-- ---- v5: realtime events, matchday recaps ----------------------------------------------------------
-- Append-only change feed read by the SSE stream (/api/stream). Payloads never contain anyone's picks.
CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at);

-- One recap per closed EAT week (week_start = Monday 00:00 EAT, stored in UTC).
CREATE TABLE IF NOT EXISTS recaps (
  week_start timestamptz PRIMARY KEY,
  title text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- kind: reaction | comment | exact | streak | mover. ref identifies the item (e.g. comment id, handle, match:handle).
CREATE TABLE IF NOT EXISTS recap_pins (
  week_start timestamptz NOT NULL REFERENCES recaps (week_start) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  score real NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT true,
  by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, kind, ref)
);
INSERT INTO schema_migrations (version) VALUES (5) ON CONFLICT DO NOTHING;

-- ---- v6: central football-data.org scheduler (one budget for every function instance) --------------
-- fd_calls is a sliding 60 s window of upstream calls; fd_acquire() serialises callers with an advisory lock so concurrent
-- functions can never exceed the budget, and gives each job a short lease so only one fetcher wins.
CREATE TABLE IF NOT EXISTS fd_calls (
  id bigserial PRIMARY KEY,
  scope text NOT NULL,
  job text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS fd_calls_scope_at_idx ON fd_calls (scope, at);
CREATE TABLE IF NOT EXISTS fd_budget (
  scope text PRIMARY KEY,
  backoff_until timestamptz NOT NULL DEFAULT 'epoch',
  backoff_n integer NOT NULL DEFAULT 0,
  remote_remaining integer,
  remote_reset_at timestamptz,
  last_status integer,
  rate_limited integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fd_jobs (
  key text PRIMARY KEY,
  last_try timestamptz,
  last_ok timestamptz,
  lease_until timestamptz NOT NULL DEFAULT 'epoch',
  fails integer NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION fd_acquire(p_scope text, p_job text, p_not_before timestamptz, p_budget integer, p_lease_s integer)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE b fd_budget%ROWTYPE; j fd_jobs%ROWTYPE; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fd_budget:' || p_scope));
  INSERT INTO fd_budget (scope) VALUES (p_scope) ON CONFLICT DO NOTHING;
  SELECT * INTO b FROM fd_budget WHERE scope = p_scope;
  IF b.backoff_until > clock_timestamp() THEN RETURN 'backoff'; END IF;
  IF b.remote_remaining IS NOT NULL AND b.remote_remaining <= 1 AND b.remote_reset_at > clock_timestamp() THEN RETURN 'remote'; END IF;
  INSERT INTO fd_jobs (key) VALUES (p_scope || ':' || p_job) ON CONFLICT DO NOTHING;
  SELECT * INTO j FROM fd_jobs WHERE key = p_scope || ':' || p_job;
  IF j.lease_until > clock_timestamp() THEN RETURN 'leased'; END IF;
  IF j.last_try IS NOT NULL AND p_not_before IS NOT NULL AND j.last_try > p_not_before THEN RETURN 'not_due'; END IF;
  SELECT count(*) INTO n FROM fd_calls WHERE scope = p_scope AND at > clock_timestamp() - interval '60 seconds';
  IF n >= p_budget THEN RETURN 'budget'; END IF;
  INSERT INTO fd_calls (scope, job) VALUES (p_scope, p_job);
  UPDATE fd_jobs SET lease_until = clock_timestamp() + make_interval(secs => p_lease_s), last_try = clock_timestamp() WHERE key = p_scope || ':' || p_job;
  IF b.remote_remaining IS NOT NULL THEN UPDATE fd_budget SET remote_remaining = remote_remaining - 1 WHERE scope = p_scope; END IF;
  RETURN 'ok';
END $$;
CREATE OR REPLACE FUNCTION fd_report(p_scope text, p_job text, p_status integer, p_remaining integer, p_reset_s integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE fd_budget SET last_status = p_status,
    remote_remaining = COALESCE(p_remaining, remote_remaining),
    remote_reset_at = CASE WHEN p_reset_s IS NULL THEN remote_reset_at ELSE clock_timestamp() + make_interval(secs => p_reset_s) END,
    backoff_n = CASE WHEN p_status = 429 THEN backoff_n + 1 ELSE 0 END,
    backoff_until = CASE WHEN p_status = 429
      THEN clock_timestamp() + make_interval(secs => GREATEST(COALESCE(p_reset_s, 0), LEAST(240, 15 * power(2, LEAST(backoff_n, 4))::int)))
      ELSE backoff_until END,
    rate_limited = rate_limited + CASE WHEN p_status = 429 THEN 1 ELSE 0 END
  WHERE scope = p_scope;
  UPDATE fd_jobs SET lease_until = 'epoch',
    last_ok = CASE WHEN p_status BETWEEN 200 AND 299 THEN clock_timestamp() ELSE last_ok END,
    fails = CASE WHEN p_status BETWEEN 200 AND 299 THEN 0 ELSE fails + 1 END
  WHERE key = p_scope || ':' || p_job;
  DELETE FROM fd_calls WHERE scope = p_scope AND at < clock_timestamp() - interval '2 hours';
END $$;
INSERT INTO schema_migrations (version) VALUES (6) ON CONFLICT DO NOTHING;

-- ---- v7: live score mirror (provisional points), so every member's "if it ends now" can be computed in SQL ----
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_home smallint;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_away smallint;
CREATE INDEX IF NOT EXISTS matches_live_idx ON matches (status) WHERE status IN ('IN_PLAY', 'PAUSED');
INSERT INTO schema_migrations (version) VALUES (7) ON CONFLICT DO NOTHING;
