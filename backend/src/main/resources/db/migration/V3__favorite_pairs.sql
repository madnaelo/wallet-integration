CREATE TABLE favorite_pairs (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  sell_token_address TEXT NOT NULL,
  sell_token_symbol TEXT NOT NULL,
  sell_token_decimals INTEGER NOT NULL,
  buy_token_address TEXT NOT NULL,
  buy_token_symbol TEXT NOT NULL,
  buy_token_decimals INTEGER NOT NULL,
  target_rate NUMERIC(38, 18),
  alert_direction TEXT NOT NULL DEFAULT 'above',
  alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_favorite_pair_sell_decimals CHECK (sell_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_favorite_pair_buy_decimals CHECK (buy_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_favorite_pair_target_rate CHECK (target_rate IS NULL OR target_rate > 0),
  CONSTRAINT chk_favorite_pair_alert_direction CHECK (alert_direction IN ('above', 'below')),
  CONSTRAINT chk_favorite_pair_distinct_tokens CHECK (
    lower(sell_token_address) <> lower(buy_token_address)
  )
);

CREATE UNIQUE INDEX idx_favorite_pairs_wallet_pair
  ON favorite_pairs(wallet_address, chain_id, lower(sell_token_address), lower(buy_token_address));

CREATE INDEX idx_favorite_pairs_wallet_created_at
  ON favorite_pairs(wallet_address, created_at DESC);

CREATE INDEX idx_favorite_pairs_active_alerts
  ON favorite_pairs(wallet_address, chain_id)
  WHERE alerts_enabled;

CREATE TABLE favorite_pair_alerts (
  id UUID PRIMARY KEY,
  favorite_pair_id UUID NOT NULL REFERENCES favorite_pairs(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  error_message TEXT,
  current_rate NUMERIC(38, 18) NOT NULL,
  target_rate NUMERIC(38, 18) NOT NULL,
  alert_direction TEXT NOT NULL,
  price_snapshot_json JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_favorite_pair_alert_channel CHECK (channel IN ('email', 'telegram')),
  CONSTRAINT chk_favorite_pair_alert_delivery_status CHECK (delivery_status IN ('sent', 'failed')),
  CONSTRAINT chk_favorite_pair_alert_direction CHECK (alert_direction IN ('above', 'below'))
);

CREATE INDEX idx_favorite_pair_alerts_pair_channel_sent
  ON favorite_pair_alerts(favorite_pair_id, channel, sent_at DESC)
  WHERE delivery_status = 'sent';

CREATE INDEX idx_favorite_pair_alerts_wallet_created_at
  ON favorite_pair_alerts(wallet_address, created_at DESC);
