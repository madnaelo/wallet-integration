CREATE TABLE telegram_link_codes (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_link_codes_wallet_active
  ON telegram_link_codes(wallet_address, expires_at DESC)
  WHERE consumed_at IS NULL;
