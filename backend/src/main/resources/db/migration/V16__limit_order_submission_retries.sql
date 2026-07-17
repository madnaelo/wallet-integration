ALTER TABLE limit_orders
  ADD COLUMN submission_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_submission_at TIMESTAMPTZ,
  ADD COLUMN last_submission_attempt_at TIMESTAMPTZ,
  ADD COLUMN submission_locked_until TIMESTAMPTZ,
  ADD COLUMN submission_lock_token UUID,
  ADD COLUMN signed_payload_hash_version SMALLINT NOT NULL DEFAULT 1;

UPDATE limit_orders current_order
SET order_hash = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM limit_orders duplicate_order
        WHERE duplicate_order.id <> current_order.id
          AND lower(duplicate_order.order_hash) = lower(current_order.order_hash)
      )
      THEN lower(current_order.order_hash)
      ELSE current_order.order_hash
    END,
    execution_status = CASE
      WHEN execution_status IN ('stored', 'pending_submission', 'failed') THEN 'failed'
      ELSE execution_status
    END,
    execution_error = CASE
      WHEN execution_status IN ('stored', 'pending_submission', 'failed')
      THEN 'Review and sign this order again before it can be submitted.'
      ELSE execution_error
    END,
    next_submission_at = NULL;

ALTER TABLE limit_orders
  ADD CONSTRAINT chk_limit_orders_submission_attempts CHECK (submission_attempts >= 0),
  ADD CONSTRAINT chk_limit_orders_payload_hash_version CHECK (signed_payload_hash_version IN (1, 2));

CREATE INDEX idx_limit_orders_submission_queue
  ON limit_orders(next_submission_at, created_at)
  WHERE execution_status IN ('stored', 'pending_submission', 'failed');
