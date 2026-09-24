CREATE SCHEMA ${marketRadarSchema};

CREATE TABLE ${marketRadarSchema}.latest (
  pair_key varchar(90) NOT NULL,
  audience varchar(12) NOT NULL CHECK (audience IN ('research', 'commercial')),
  observed_at bigint NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (pair_key, audience)
);
CREATE TABLE ${marketRadarSchema}.observations (
  pair_key varchar(90) NOT NULL,
  audience varchar(12) NOT NULL CHECK (audience IN ('research', 'commercial')),
  observed_at bigint NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  lifecycles jsonb NOT NULL,
  PRIMARY KEY (pair_key, audience, observed_at)
);
CREATE INDEX radar_observation_retention_idx ON ${marketRadarSchema}.observations(observed_at);
CREATE TABLE ${marketRadarSchema}.signals (
  id varchar(64) PRIMARY KEY,
  pair_key varchar(90) NOT NULL,
  audience varchar(12) NOT NULL CHECK (audience IN ('research', 'commercial')),
  observed_at bigint NOT NULL,
  zone_id varchar(140) NOT NULL,
  zone_type varchar(8) NOT NULL CHECK (zone_type IN ('SUPPLY', 'DEMAND')),
  structural_score integer NOT NULL CHECK (structural_score BETWEEN 0 AND 100),
  venue_count integer NOT NULL CHECK (venue_count BETWEEN 1 AND 3),
  scoring_version varchar(64) NOT NULL,
  snapshot jsonb NOT NULL,
  zone jsonb NOT NULL,
  UNIQUE(pair_key, audience, zone_id, observed_at, scoring_version)
);
CREATE INDEX radar_signal_report_idx ON ${marketRadarSchema}.signals(audience, observed_at, structural_score, venue_count);
CREATE INDEX radar_signal_zone_idx ON ${marketRadarSchema}.signals(zone_id, audience, observed_at DESC);
CREATE TABLE ${marketRadarSchema}.outcomes (
  signal_id varchar(64) NOT NULL REFERENCES ${marketRadarSchema}.signals(id) ON DELETE CASCADE,
  horizon_ms integer NOT NULL CHECK (horizon_ms BETWEEN 60000 AND 86400000),
  due_at bigint NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE', 'INCOMPLETE_DATA', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until bigint,
  lease_id uuid,
  result jsonb,
  PRIMARY KEY (signal_id, horizon_ms)
);
CREATE INDEX radar_outcome_due_idx ON ${marketRadarSchema}.outcomes(due_at) WHERE status = 'PENDING';
CREATE TABLE ${marketRadarSchema}.events (
  id varchar(64) PRIMARY KEY,
  pair_key varchar(90) NOT NULL,
  audience varchar(12) NOT NULL CHECK (audience IN ('research', 'commercial')),
  observed_at bigint NOT NULL,
  event_type varchar(40) NOT NULL CHECK (event_type IN ('SUPPLY_APPROACHED','DEMAND_APPROACHED','ZONE_STRENGTHENED','ZONE_WEAKENED','ZONE_BROKEN','BUYER_ABSORPTION_INCREASED','SELLER_ABSORPTION_INCREASED')),
  payload jsonb NOT NULL,
  last_rule_id uuid,
  processed_at timestamptz
);
CREATE INDEX radar_event_pending_idx ON ${marketRadarSchema}.events(observed_at) WHERE processed_at IS NULL;
CREATE TABLE ${marketRadarSchema}.alert_rules (
  id uuid PRIMARY KEY,
  wallet_address varchar(128) NOT NULL,
  pair_key varchar(90) NOT NULL,
  event_type varchar(40) NOT NULL CHECK (event_type IN ('SUPPLY_APPROACHED','DEMAND_APPROACHED','ZONE_STRENGTHENED','ZONE_WEAKENED','ZONE_BROKEN','BUYER_ABSORPTION_INCREASED','SELLER_ABSORPTION_INCREASED')),
  minimum_score integer NOT NULL DEFAULT 60 CHECK (minimum_score BETWEEN 0 AND 100),
  cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (cooldown_minutes BETWEEN 15 AND 1440),
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wallet_address, pair_key, event_type)
);
CREATE INDEX radar_alert_match_idx ON ${marketRadarSchema}.alert_rules(pair_key, event_type);
CREATE TABLE ${marketRadarSchema}.markets (
  pair_key varchar(90) NOT NULL,
  audience varchar(12) NOT NULL CHECK (audience IN ('research','commercial')),
  discovered_at bigint NOT NULL,
  venues jsonb NOT NULL,
  PRIMARY KEY(pair_key,audience)
);
CREATE TABLE ${marketRadarSchema}.watches (
  pair_key varchar(90) PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
