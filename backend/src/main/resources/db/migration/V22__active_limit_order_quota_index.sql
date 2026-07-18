CREATE INDEX idx_limit_orders_wallet_active
  ON limit_orders(wallet_address, execution_status)
  WHERE execution_status IN ('stored', 'pending_submission', 'submitted', 'open', 'partially_filled', 'failed');
