# Prompt 31: Mobile Quote Loading And Summary Reveal

## Product Context

On small screens, the quote form and trade summary stack vertically. After the
user taps Get Quote or Refresh Quote, the refreshed summary can appear below
the fold without any clear feedback that the quote has loaded.

## Requirement

Improve the mobile quote flow:

- Show a compact loading spinner beside the Get Quote / Refresh Quote label
  while a quote request is in progress.
- After a quote loads successfully on a small screen, smoothly scroll down
  enough to reveal the trade summary.
- Keep the Get Quote / Refresh Quote control visible after scrolling so users
  understand where they are and can refresh again without feeling lost.

## Technical Guidance

- Only auto-scroll after a user-triggered quote fetch succeeds.
- Avoid moving the page on desktop layouts or when the summary is already
  visible.
- Respect reduced-motion preferences.
- Do not change quote calculation, provider selection, wallet signing, or swap
  execution behavior.

## Acceptance Criteria

- Mobile users see immediate loading feedback next to the quote action.
- Successful quote refreshes bring the trade summary into view with smooth
  motion.
- The refresh action remains visible near the top of the viewport after the
  scroll.
- Frontend typecheck and lint pass.
