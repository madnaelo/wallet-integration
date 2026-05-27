# Prompt 35 - Loss Protection Alerts

## Product Need

Reverse-swap monitoring should not only find profitable reversals. Users also
want optional loss-protection notifications when a saved swap moves against them
by a chosen threshold.

## Prompt

Extend the existing reverse-swap notification workflow to support loss
protection alerts. Use the same efficient batched price fetch and scheduler.
Add user preferences for enabling/disabling loss alerts and setting the loss
threshold. Keep email and Telegram delivery on the existing notification
channels. Avoid creating a second monitor or duplicate alert engine.

## Implementation Guidance

- Add a Flyway migration for the new preference fields and alert type.
- Keep profit and loss alert cooldowns separate per swap and channel.
- Use clear user-facing wording; do not imply financial advice.
- Update frontend preference settings in the Preferences page.
- Add tests for profit and loss evaluation plus notification message text.
- Update env examples and deployment config defaults.
- Commit this as its own clean change.
