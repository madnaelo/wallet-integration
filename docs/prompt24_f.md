# Prompt 24: User-Friendly Telegram Linking And Settings Pages

The previous Telegram preference UI exposed a Telegram chat ID field. Normal
users do not know what a chat ID is, and Telegram bots cannot safely identify
users by phone number. Replace this with a bot-based linking flow and move
settings out of the swap surface.

## Scope

- Explain and encode the product decision that Telegram uses bot chat IDs
  internally, but users should not type them.
- Add a one-time Telegram connection flow:
  - backend creates a short link code for the signed-in wallet,
  - frontend opens the configured Telegram bot with that code,
  - user starts/sends the code to the bot,
  - backend checks bot updates and stores the chat ID silently.
- Move notification preferences to a separate Preferences view.
- Move favorite-pair management to a separate Favorites view.
- Add top-level navigation for Swap, Favorites, and Preferences while keeping
  the app as a single-page experience.

## Product Guidance

- Do not ask for Telegram phone numbers. Bots cannot look users up by phone
  number and users should not need to share it.
- Do not show raw chat IDs in normal settings UI.
- Preferences should feel like a destination, not a technical panel under the
  trade form.
- Keep Swap focused on quoting and execution.

## Technical Guidance

- Store Telegram chat IDs only after a wallet-authenticated link code is
  confirmed through bot updates.
- Keep link codes short-lived and single-use.
- Continue using the same notification preference record once Telegram is
  connected.
- Keep frontend navigation local to the SPA for now.

## Safety Guidance

- Do not commit Telegram bot tokens.
- Do not send wallet secrets, signatures, bearer tokens, or seed phrases through
  Telegram.
- Treat Telegram linking as a convenience notification channel, not identity
  proof stronger than the signed wallet session.
