DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM limit_orders
    WHERE execution_status IN ('stored', 'pending_submission', 'submitted', 'open', 'partially_filled', 'failed')
    GROUP BY wallet_address, chain_id, lower(sell_token_address), lower(execution_provider)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Active limit orders share a wallet/network/sell-token/provider allowance scope; reconcile them before migration V24.';
  END IF;
END
$$;

CREATE UNIQUE INDEX idx_limit_orders_active_allowance_scope
  ON limit_orders (
    wallet_address,
    chain_id,
    lower(sell_token_address),
    lower(execution_provider)
  )
  WHERE execution_status IN ('stored', 'pending_submission', 'submitted', 'open', 'partially_filled', 'failed');
