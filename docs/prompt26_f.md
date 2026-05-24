# Prompt 26: Add Favorites From Swap And Target Ladders

Make favorite-pair alerts easier to create and allow users to save several
target prices for the same token pair.

## Scope

- Add an Add Favorite control directly on the Swap page.
- Keep an Add Favorite composer on the Favorites page.
- Prepopulate the target-rate field from the current quote when a quote is
  available.
- Allow the same wallet to save the same token pair more than once when the
  target prices are meaningfully different.
- Prevent near-duplicate same-pair alerts by requiring a minimum gap between
  targets for the same pair and direction.

## Product Guidance

- Treat favorite entries as alert rules, not just a single saved pair.
- Users should be able to ladder targets such as ETH/USDT at 2500, 2600, and
  2700.
- Do not update an existing favorite when the user clicks Add Favorite; create a
  new favorite alert entry.
- Use a percentage gap instead of an absolute gap so low-price and high-price
  tokens both behave naturally.

## Technical Guidance

- Drop the one-row-per-pair uniqueness constraint.
- Enforce a 1% minimum target gap for the same wallet, chain, sell token, buy
  token, and alert direction.
- Keep one untargeted favorite per pair to avoid duplicate empty entries.
- Preserve existing alert delivery and cooldown behavior per favorite entry.

## Safety Guidance

- Keep validation in the backend even if the frontend displays helper text.
- Do not rely on live quote rates as guaranteed executable prices.
- Avoid accidental upserts that overwrite a user's previous target alert.
