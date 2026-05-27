# Prompt 36 - Trade Risk Cues And Favorite Actions

## Product Need

The swap screen and Favorites page should feel more trustworthy and action
oriented without changing the core non-custodial execution model.

## Prompt

Add lightweight trust/risk cues to the Trade Summary when the selected quote has
high slippage, a large service-fee ratio, or only partial provider availability.
These should be helpful warnings, not blockers.

Then make saved favorite pairs directly actionable. From the Favorites page,
users should be able to open the saved pair in the swap form or open the reverse
direction. Reuse the existing prefilled swap-link behavior so Telegram links and
Favorites actions do not create two different implementations for the same
workflow.

## Implementation Guidance

- Keep copy user-facing and concise.
- Do not add another pricing/rate polling path for the Favorites page.
- Reuse the existing `PendingSwapLink` parsing model and shareable query-string
  format.
- Keep table actions compact on desktop and mobile.
- Run frontend typecheck/lint before committing.
