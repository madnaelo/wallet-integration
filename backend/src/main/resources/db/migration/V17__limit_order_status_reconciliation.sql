ALTER TABLE limit_orders
  ADD COLUMN provider_transaction_hash TEXT,
  ADD COLUMN last_status_checked_at TIMESTAMPTZ,
  ADD COLUMN next_status_check_at TIMESTAMPTZ,
  ADD COLUMN status_check_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN status_check_error TEXT,
  ADD COLUMN status_check_locked_until TIMESTAMPTZ,
  ADD COLUMN status_check_lock_token UUID;

UPDATE limit_orders
SET next_status_check_at = now()
WHERE execution_status IN ('submitted', 'open', 'partially_filled');

ALTER TABLE limit_orders
  ADD CONSTRAINT chk_limit_orders_status_check_attempts CHECK (status_check_attempts >= 0),
  ADD CONSTRAINT chk_limit_orders_provider_transaction_hash CHECK (
    provider_transaction_hash IS NULL OR provider_transaction_hash ~ '^0x[0-9a-f]{64}$'
  );

CREATE INDEX idx_limit_orders_status_queue
  ON limit_orders(next_status_check_at, updated_at)
  WHERE execution_status IN ('submitted', 'open', 'partially_filled');
