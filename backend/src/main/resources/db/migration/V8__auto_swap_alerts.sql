CREATE TABLE auto_swap_alerts (
  id UUID PRIMARY KEY,
  auto_swap_rule_id UUID NOT NULL REFERENCES auto_swap_rules(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  error_message TEXT,
  current_rate NUMERIC(38, 18) NOT NULL,
  threshold_rate NUMERIC(38, 18) NOT NULL,
  alert_direction TEXT NOT NULL,
  sell_amount_raw TEXT NOT NULL,
  slippage_bps INTEGER NOT NULL,
  price_snapshot_json JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_auto_swap_alert_channel CHECK (channel IN ('email', 'telegram')),
  CONSTRAINT chk_auto_swap_alert_delivery_status CHECK (delivery_status IN ('sent', 'failed')),
  CONSTRAINT chk_auto_swap_alert_direction CHECK (alert_direction IN ('above', 'below')),
  CONSTRAINT chk_auto_swap_alert_sell_amount_raw CHECK (sell_amount_raw ~ '^[0-9]+$'),
  CONSTRAINT chk_auto_swap_alert_slippage_bps CHECK (slippage_bps BETWEEN 0 AND 10000)
);

CREATE INDEX idx_auto_swap_alerts_rule_channel_sent
  ON auto_swap_alerts(auto_swap_rule_id, channel, sent_at DESC)
  WHERE delivery_status = 'sent';

CREATE INDEX idx_auto_swap_alerts_wallet_created_at
  ON auto_swap_alerts(wallet_address, created_at DESC);
