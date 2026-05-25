CREATE TABLE app_feature_flags (
  feature_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auto_swap_rules (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  sell_token_address TEXT NOT NULL,
  sell_token_symbol TEXT NOT NULL,
  sell_token_decimals INTEGER NOT NULL,
  buy_token_address TEXT NOT NULL,
  buy_token_symbol TEXT NOT NULL,
  buy_token_decimals INTEGER NOT NULL,
  sell_amount_raw TEXT NOT NULL,
  threshold_rate NUMERIC(38, 18) NOT NULL,
  alert_direction TEXT NOT NULL DEFAULT 'above',
  slippage_bps INTEGER NOT NULL,
  recipient_address TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  execution_readiness TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_auto_swap_sell_decimals CHECK (sell_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_auto_swap_buy_decimals CHECK (buy_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_auto_swap_sell_amount_raw CHECK (sell_amount_raw ~ '^[0-9]+$' AND sell_amount_raw <> '0'),
  CONSTRAINT chk_auto_swap_threshold_rate CHECK (threshold_rate > 0),
  CONSTRAINT chk_auto_swap_alert_direction CHECK (alert_direction IN ('above', 'below')),
  CONSTRAINT chk_auto_swap_slippage_bps CHECK (slippage_bps BETWEEN 0 AND 10000),
  CONSTRAINT chk_auto_swap_execution_mode CHECK (execution_mode IN ('auto_when_supported', 'notify_to_confirm')),
  CONSTRAINT chk_auto_swap_execution_readiness CHECK (execution_readiness IN ('auto_supported', 'confirmation_required')),
  CONSTRAINT chk_auto_swap_status CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  CONSTRAINT chk_auto_swap_distinct_tokens CHECK (
    lower(sell_token_address) <> lower(buy_token_address)
  )
);

CREATE INDEX idx_auto_swap_rules_wallet_created_at
  ON auto_swap_rules(wallet_address, created_at DESC);

CREATE INDEX idx_auto_swap_rules_active_pair
  ON auto_swap_rules(wallet_address, chain_id, lower(sell_token_address), lower(buy_token_address), alert_direction)
  WHERE status = 'active';

CREATE INDEX idx_auto_swap_rules_ready
  ON auto_swap_rules(status, execution_mode, execution_readiness, updated_at)
  WHERE status = 'active';
