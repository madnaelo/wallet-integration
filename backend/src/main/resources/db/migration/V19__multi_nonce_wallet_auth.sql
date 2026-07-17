ALTER TABLE wallet_nonces
  ADD COLUMN id UUID;

UPDATE wallet_nonces
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE wallet_nonces
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  DROP CONSTRAINT wallet_nonces_pkey,
  ADD CONSTRAINT wallet_nonces_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX idx_wallet_nonces_nonce
  ON wallet_nonces(nonce);

CREATE INDEX idx_wallet_nonces_wallet_created_at
  ON wallet_nonces(wallet_address, created_at DESC);

CREATE INDEX idx_wallet_nonces_expires_at
  ON wallet_nonces(expires_at);
