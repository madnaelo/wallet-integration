ALTER TABLE swap_history
  ADD COLUMN buy_chain_id BIGINT;

UPDATE swap_history
SET buy_chain_id = chain_id
WHERE buy_chain_id IS NULL;

ALTER TABLE swap_history
  ALTER COLUMN buy_chain_id SET NOT NULL;

CREATE INDEX idx_swap_history_cross_chain_reverse_lookup
  ON swap_history(wallet_address, buy_chain_id, chain_id, buy_token_address, sell_token_address);
