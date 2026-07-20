ALTER TABLE swap_history
  DROP CONSTRAINT chk_swap_history_status;

ALTER TABLE swap_history
  ADD CONSTRAINT chk_swap_history_status
    CHECK (status IN ('dry_run', 'submitted', 'confirmed', 'failed', 'refunded')),
  ADD COLUMN provider_status TEXT,
  ADD COLUMN provider_substatus TEXT,
  ADD COLUMN destination_tx_hash TEXT,
  ADD COLUMN status_check_error TEXT,
  ADD COLUMN last_status_checked_at TIMESTAMPTZ,
  ADD COLUMN next_status_check_at TIMESTAMPTZ,
  ADD COLUMN status_check_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN status_check_locked_until TIMESTAMPTZ,
  ADD COLUMN status_check_lock_token UUID,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT chk_swap_history_status_check_attempts CHECK (status_check_attempts >= 0);

UPDATE swap_history
SET tx_hash = lower(tx_hash)
WHERE tx_hash ~* '^(0x)?[0-9a-f]{64}$';

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY wallet_address, chain_id, tx_hash
      ORDER BY
        CASE status
          WHEN 'confirmed' THEN 5
          WHEN 'refunded' THEN 4
          WHEN 'failed' THEN 3
          WHEN 'submitted' THEN 2
          ELSE 1
        END DESC,
        created_at DESC,
        id DESC
    ) AS position
  FROM swap_history
  WHERE tx_hash IS NOT NULL
    AND tx_hash <> ''
    AND tx_hash <> 'dry-run'
)
DELETE FROM swap_history history
USING ranked
WHERE history.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX uq_swap_history_wallet_chain_tx
  ON swap_history(wallet_address, chain_id, tx_hash)
  WHERE tx_hash IS NOT NULL
    AND tx_hash <> ''
    AND tx_hash <> 'dry-run';

UPDATE swap_history
SET next_status_check_at = now()
WHERE lower(aggregator) = 'lifi'
  AND chain_id <> buy_chain_id
  AND status = 'submitted';

CREATE INDEX idx_swap_history_lifi_status_due
  ON swap_history(next_status_check_at, created_at)
  WHERE lower(aggregator) = 'lifi'
    AND status = 'submitted'
    AND next_status_check_at IS NOT NULL;
