CREATE TABLE revenue_quote_batches (
  id uuid PRIMARY KEY,
  issued_at timestamptz NOT NULL,
  payload text NOT NULL,
  signature varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revenue_quotes (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES revenue_quote_batches(id),
  provider varchar(32) NOT NULL,
  source_chain bigint NOT NULL,
  destination_chain bigint NOT NULL,
  owner_address varchar(128) NOT NULL,
  snapshot jsonb NOT NULL,
  quoted_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by varchar(128)
);
CREATE INDEX revenue_quotes_window ON revenue_quotes(quoted_at, provider, source_chain);
CREATE INDEX revenue_quotes_batch ON revenue_quotes(batch_id);

CREATE TABLE revenue_provider_attempts (
  batch_id uuid NOT NULL REFERENCES revenue_quote_batches(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  outcome varchar(32) NOT NULL CHECK (outcome IN ('quoted','fee_validation_failed','unavailable')),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY(batch_id, provider)
);
CREATE INDEX revenue_attempts_window ON revenue_provider_attempts(occurred_at, provider, outcome);

CREATE TABLE revenue_records (
  id uuid PRIMARY KEY,
  history_id uuid NOT NULL UNIQUE REFERENCES swap_history(id),
  quote_id uuid UNIQUE REFERENCES revenue_quotes(id),
  wallet_address varchar(128) NOT NULL,
  source_chain bigint NOT NULL,
  transaction_hash varchar(128) NOT NULL,
  state varchar(16) NOT NULL CHECK (state IN ('EXPECTED','NOT_VERIFIED','ACCRUED','RECEIVED','FAILED')),
  reason varchar(80) NOT NULL,
  verified_fee numeric(78,0),
  confirmed_volume numeric(78,0),
  swap_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 12),
  lease_token uuid,
  lease_until timestamptz,
  UNIQUE(source_chain, transaction_hash),
  CHECK (verified_fee IS NULL OR verified_fee >= 0),
  CHECK (confirmed_volume IS NULL OR confirmed_volume >= 0),
  CHECK (state NOT IN ('ACCRUED','RECEIVED') OR (quote_id IS NOT NULL AND verified_fee > 0))
);
CREATE INDEX revenue_records_window ON revenue_records(created_at, state);
CREATE INDEX revenue_records_due ON revenue_records(next_check_at) WHERE next_check_at IS NOT NULL;

CREATE TABLE revenue_settlement_evidence (
  id bigserial PRIMARY KEY,
  revenue_id uuid NOT NULL REFERENCES revenue_records(id),
  source varchar(64) NOT NULL,
  state varchar(16) NOT NULL,
  evidence jsonb NOT NULL,
  evidence_hash varchar(64) NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(revenue_id, evidence_hash)
);
CREATE INDEX revenue_evidence_record ON revenue_settlement_evidence(revenue_id, id);

-- Legacy browser history is retained, but cannot establish amounts earned.
-- One chain transaction is counted once even if old clients saved duplicates.
INSERT INTO revenue_records(id,history_id,wallet_address,source_chain,transaction_hash,state,reason,created_at)
SELECT id,id,wallet_address,chain_id,canonical_hash,'NOT_VERIFIED','legacy_history_without_server_evidence',created_at
FROM (
  SELECT DISTINCT ON (chain_id,canonical_hash) * FROM (
    SELECT id,wallet_address,chain_id,created_at,
      CASE WHEN tx_hash ~* '^(0x)?[0-9a-f]{64}$' THEN lower(tx_hash) ELSE tx_hash END AS canonical_hash
    FROM swap_history WHERE status <> 'dry_run' AND tx_hash IS NOT NULL AND tx_hash <> 'dry-run'
  ) legacy ORDER BY chain_id,canonical_hash,created_at,id
) deduplicated;
