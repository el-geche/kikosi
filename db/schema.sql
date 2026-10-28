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
