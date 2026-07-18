ALTER TABLE limit_orders
  DROP CONSTRAINT chk_limit_orders_execution_status;

ALTER TABLE limit_orders
  ADD CONSTRAINT chk_limit_orders_execution_status CHECK (
    execution_status IN (
      'stored',
      'pending_submission',
      'submitted',
      'open',
      'partially_filled',
      'filled',
      'expired',
      'cancelled',
      'failed',
      'rejected'
    )
  );
