CREATE TABLE notification_preferences (
  wallet_address TEXT PRIMARY KEY REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  email_address TEXT,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  telegram_chat_id TEXT,
  telegram_enabled BOOLEAN NOT NULL DEFAULT false,
  reverse_profit_threshold_bps INTEGER NOT NULL DEFAULT 100,
  cooldown_minutes INTEGER NOT NULL DEFAULT 360,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_notification_threshold CHECK (reverse_profit_threshold_bps BETWEEN 0 AND 100000),
  CONSTRAINT chk_notification_cooldown CHECK (cooldown_minutes BETWEEN 5 AND 10080)
);

CREATE INDEX idx_notification_preferences_active
  ON notification_preferences(wallet_address)
  WHERE email_enabled OR telegram_enabled;

CREATE TABLE reverse_profit_alerts (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  original_swap_history_id UUID NOT NULL REFERENCES swap_history(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  error_message TEXT,
  profit_bps INTEGER NOT NULL,
  original_sell_amount_raw NUMERIC(78, 0) NOT NULL,
  estimated_reverse_sell_amount_raw NUMERIC(78, 0) NOT NULL,
  price_snapshot_json JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_reverse_profit_channel CHECK (channel IN ('email', 'telegram')),
  CONSTRAINT chk_reverse_profit_delivery_status CHECK (delivery_status IN ('sent', 'failed'))
);

CREATE INDEX idx_reverse_profit_alerts_swap_channel_sent
  ON reverse_profit_alerts(original_swap_history_id, channel, sent_at DESC)
  WHERE delivery_status = 'sent';

CREATE INDEX idx_reverse_profit_alerts_wallet_created_at
  ON reverse_profit_alerts(wallet_address, created_at DESC);
