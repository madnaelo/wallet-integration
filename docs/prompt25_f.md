# Prompt 25: Navigation Menu And Telegram Local Config

Polish the app navigation and fix Telegram linking availability in local
development.

## Scope

- Replace the top-level navigation buttons with a menu-style navigation.
- Use link semantics for Swap, Favorites, and Preferences so they feel like app
  destinations instead of form actions.
- Preserve the single-page experience and support hash navigation.
- Investigate why Telegram linking says it is unavailable after backend restart.
- Ensure the Spring Boot backend can read local Telegram settings from
  `.env.development` without requiring manual environment exports.

## Product Guidance

- Navigation should be visibly different from trade/action buttons.
- Preferences and Favorites should feel like separate app areas.
- Telegram linking should not ask for chat IDs or phone numbers.
- If Telegram is configured locally, users should be able to start the bot link
  flow after wallet sign-in.

## Technical Guidance

- Keep the app as an SPA for now.
- Keep nav accessible with normal links and `aria-current`.
- Load `.env.development` in local backend workflows without committing secrets.
- Preserve process environment precedence over local `.env.development` values.

## Safety Guidance

- Do not commit Telegram bot tokens.
- Do not print or expose Telegram tokens in user-facing logs or UI.
- Do not weaken wallet-authenticated backend access for notification settings.
