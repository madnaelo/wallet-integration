# Prompt 27: Fix Favorite Alert Price Fetching

Debug why a Telegram alert was not sent for an ETH to USDT favorite-pair target.

## Scope

- Inspect notification preferences, favorite-pair rows, alert delivery records,
  and scheduler logs.
- Confirm whether the failure is in eligibility, price evaluation, or Telegram
  delivery.
- Fix the backend monitor if price fetching prevents favorite alerts from being
  evaluated.
- Add a focused backend regression test for the price client.

## Product Guidance

- Favorite alerts are evaluated on scheduled backend snapshots, not every market
  tick.
- If a target is met at a scheduler snapshot and Telegram is linked/enabled, the
  user should receive a Telegram alert.
- Delivery records should make it clear whether no alert was created, sending
  failed, or sending succeeded.

## Technical Guidance

- CoinGecko requests must use absolute URLs when passed to Spring `RestClient`.
- Keep the batched price-fetching model.
- Test native token price fetching without calling the real internet.

## Safety Guidance

- Do not expose Telegram bot tokens or raw chat IDs in logs or user-facing
  output.
- Avoid sending duplicate alerts inside the cooldown window.
