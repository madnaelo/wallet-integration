ALTER TABLE limit_orders
  ADD COLUMN cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN cancellation_transaction_hash TEXT;

ALTER TABLE limit_orders
  ADD CONSTRAINT chk_limit_orders_cancellation_transaction_hash CHECK (
    cancellation_transaction_hash IS NULL OR cancellation_transaction_hash ~ '^0x[0-9a-f]{64}$'
  );
