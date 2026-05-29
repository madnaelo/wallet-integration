ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_wallet_address_fkey;

DROP INDEX IF EXISTS idx_push_subscriptions_wallet_active;

CREATE TABLE push_subscription_wallets (
  push_subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (push_subscription_id, wallet_address)
);

INSERT INTO push_subscription_wallets (
  push_subscription_id, wallet_address, disabled_at, created_at, updated_at, last_seen_at
)
SELECT id, wallet_address, disabled_at, created_at, updated_at, last_seen_at
FROM push_subscriptions
ON CONFLICT (push_subscription_id, wallet_address) DO NOTHING;

CREATE INDEX idx_push_subscription_wallets_wallet_active
  ON push_subscription_wallets(wallet_address, updated_at DESC)
  WHERE disabled_at IS NULL;

CREATE INDEX idx_push_subscription_wallets_subscription_active
  ON push_subscription_wallets(push_subscription_id)
  WHERE disabled_at IS NULL;
