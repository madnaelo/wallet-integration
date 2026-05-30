CREATE TABLE limit_orders (
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
  min_buy_amount_raw TEXT NOT NULL,
  target_rate NUMERIC(38, 18) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  recipient_address TEXT NOT NULL,
  execution_provider TEXT NOT NULL,
  execution_support TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  signed_payload_hash TEXT NOT NULL,
  order_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signed_payload_json JSONB NOT NULL,
  execution_error TEXT,
  submitted_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_limit_orders_sell_decimals CHECK (sell_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_limit_orders_buy_decimals CHECK (buy_token_decimals BETWEEN 0 AND 30),
  CONSTRAINT chk_limit_orders_sell_amount_raw CHECK (sell_amount_raw ~ '^[0-9]+$' AND sell_amount_raw <> '0'),
  CONSTRAINT chk_limit_orders_min_buy_amount_raw CHECK (min_buy_amount_raw ~ '^[0-9]+$' AND min_buy_amount_raw <> '0'),
  CONSTRAINT chk_limit_orders_target_rate CHECK (target_rate > 0),
  CONSTRAINT chk_limit_orders_execution_support CHECK (execution_support IN ('supported', 'unsupported')),
  CONSTRAINT chk_limit_orders_execution_status CHECK (
    execution_status IN ('stored', 'pending_submission', 'submitted', 'open', 'partially_filled', 'filled', 'expired', 'cancelled', 'failed')
  ),
  CONSTRAINT chk_limit_orders_distinct_tokens CHECK (
    lower(sell_token_address) <> lower(buy_token_address)
  )
);

CREATE UNIQUE INDEX idx_limit_orders_order_hash
  ON limit_orders(order_hash);

CREATE INDEX idx_limit_orders_wallet_created_at
  ON limit_orders(wallet_address, created_at DESC);

CREATE INDEX idx_limit_orders_execution
  ON limit_orders(execution_support, execution_status, expires_at, updated_at)
  WHERE execution_support = 'supported';
