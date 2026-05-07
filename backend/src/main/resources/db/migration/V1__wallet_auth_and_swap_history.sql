CREATE TABLE wallet_users (
  wallet_address TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE wallet_nonces (
  wallet_address TEXT PRIMARY KEY REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_sessions (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_sessions_wallet_address ON wallet_sessions(wallet_address);
CREATE INDEX idx_wallet_sessions_expires_at ON wallet_sessions(expires_at);

CREATE TABLE swap_history (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  sell_token_address TEXT NOT NULL,
  sell_token_symbol TEXT NOT NULL,
  sell_token_decimals INTEGER NOT NULL,
  buy_token_address TEXT NOT NULL,
  buy_token_symbol TEXT NOT NULL,
  buy_token_decimals INTEGER NOT NULL,
  sell_amount_raw NUMERIC(78, 0) NOT NULL,
  buy_amount_raw NUMERIC(78, 0) NOT NULL,
  min_buy_amount_raw NUMERIC(78, 0),
  aggregator TEXT NOT NULL DEFAULT '0x',
  quote_json JSONB,
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_swap_history_status CHECK (status IN ('dry_run', 'submitted', 'confirmed', 'failed'))
);

CREATE INDEX idx_swap_history_wallet_created_at ON swap_history(wallet_address, created_at DESC);
CREATE INDEX idx_swap_history_reverse_lookup ON swap_history(wallet_address, chain_id, sell_token_address, buy_token_address);
