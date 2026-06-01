ALTER TABLE limit_orders
  ADD COLUMN provider_order_id TEXT;

CREATE INDEX idx_limit_orders_provider_order_id
  ON limit_orders(execution_provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;
