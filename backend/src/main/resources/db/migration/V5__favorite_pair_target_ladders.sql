DROP INDEX IF EXISTS idx_favorite_pairs_wallet_pair;

CREATE INDEX idx_favorite_pairs_wallet_pair_lookup
  ON favorite_pairs(wallet_address, chain_id, lower(sell_token_address), lower(buy_token_address));
