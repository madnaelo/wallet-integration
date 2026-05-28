ALTER TABLE notification_preferences
  ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS idx_notification_preferences_active;

CREATE INDEX idx_notification_preferences_active
  ON notification_preferences(wallet_address)
  WHERE email_enabled OR telegram_enabled OR push_enabled;

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  user_agent TEXT,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_push_subscription_endpoint CHECK (endpoint ~ '^https://'),
  CONSTRAINT chk_push_subscription_p256dh CHECK (length(p256dh) BETWEEN 40 AND 512),
  CONSTRAINT chk_push_subscription_auth_secret CHECK (length(auth_secret) BETWEEN 8 AND 256)
);

CREATE INDEX idx_push_subscriptions_wallet_active
  ON push_subscriptions(wallet_address, updated_at DESC)
  WHERE disabled_at IS NULL;

ALTER TABLE reverse_profit_alerts
  DROP CONSTRAINT IF EXISTS chk_reverse_profit_channel;

ALTER TABLE reverse_profit_alerts
  ADD CONSTRAINT chk_reverse_profit_channel CHECK (channel IN ('email', 'telegram', 'push'));

ALTER TABLE favorite_pair_alerts
  DROP CONSTRAINT IF EXISTS chk_favorite_pair_alert_channel;

ALTER TABLE favorite_pair_alerts
  ADD CONSTRAINT chk_favorite_pair_alert_channel CHECK (channel IN ('email', 'telegram', 'push'));

ALTER TABLE auto_swap_alerts
  DROP CONSTRAINT IF EXISTS chk_auto_swap_alert_channel;

ALTER TABLE auto_swap_alerts
  ADD CONSTRAINT chk_auto_swap_alert_channel CHECK (channel IN ('email', 'telegram', 'push'));
