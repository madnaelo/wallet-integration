# Prompt 23: Telegram Settings And Favorite-Pair Alerts

Add user-facing notification settings and favorite-pair alerting to the wallet
swap MVP.

## Scope

- Enable Telegram notifications in the local development environment for
  testing without committing the secret bot token.
- Add a wallet-authenticated Notifications panel where the user can enable or
  disable Telegram alerts and save their Telegram chat ID.
- Add wallet-owned favorite pairs.
- Let users save the current selected swap pair as a favorite.
- Let users optionally set a target rate for the pair:
  - notify when the rate is at or above the target,
  - notify when the rate is at or below the target.
- Extend the backend scheduler so favorite-pair alerts and reverse-swap alerts
  share one batched price-fetch pass.

## Product Guidance

- Use explicit target rates instead of vague percentage movement alerts for
  favorite pairs. A user can reason about `1 ETH at or above 2500 USDT`.
- Keep favorite alerts independent from reverse-swap profit alerts.
- Do not require a target rate unless alerts are enabled for the favorite pair.
- Keep notification copy clear that the rate is indicative and users should
  check a live quote before swapping.

## Technical Guidance

- Store favorite pairs in the backend database by wallet address.
- Persist alert delivery attempts and enforce the existing notification
  cooldown per favorite pair and channel.
- Reuse the batched CoinGecko token price client instead of calling quote
  providers pair-by-pair.
- Keep frontend settings authenticated by the existing wallet sign-in session.

## Safety Guidance

- Do not commit Telegram bot tokens or chat IDs as tracked secrets.
- Do not send wallet signatures, bearer tokens, private keys, or seed phrases in
  notification messages.
- Do not promise executable swap output from the favorite-pair monitor because
  provider route output may differ due to liquidity, fees, and slippage.
