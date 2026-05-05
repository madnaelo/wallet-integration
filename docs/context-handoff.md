# Context Handoff

Use this file first when restarting in a fresh context.

## Recommended Read Order

1. `docs/BRD.md`
2. `docs/prompt1_f.md`
3. `docs/prompt2_f.md`
4. `docs/prompt3_f.md`
5. `docs/discussion-summary.md`
6. `docs/implementation-change-summary.md`
7. Current git diff/status

## Current Product Direction

The app is a non-custodial swap intelligence product, not merely a generic swap screen.

Core wedge:

- Users save favorite token pairs.
- App monitors quote/rate movement.
- App stores historical swaps.
- App detects profitable reverse-swap opportunities.
- App notifies users when an opportunity appears.

The current codebase is still a swap/quote MVP. The future product work is to add persistence, monitoring, and notifications.

## Current Testing Direction

0x does not support Sepolia for Swap API quotes. Sepolia remains useful for wallet/mock/future-provider testing, but not for real 0x E2E swaps.

Current practical test mode:

- Real 0x API quotes on supported chains.
- Dry-run swap execution when `NEXT_PUBLIC_DISALLOW_MAINNET=true`.
- No live transaction submission in dry-run mode.

## Current Env Model

Active env model:

```env
ZEROX_API_KEY=...
AFFILIATE_ADDRESS=...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_ALLOWED_CHAIN_IDS=...
NEXT_PUBLIC_DISALLOW_MAINNET=...
```

Behavior:

- `ZEROX_API_KEY` present: real 0x quote calls.
- `ZEROX_API_KEY` absent and dry-run enabled: mock quote fallback.
- `NEXT_PUBLIC_DISALLOW_MAINNET=true`: dry-run, no live approvals/swaps.
- `NEXT_PUBLIC_DISALLOW_MAINNET=false`: live execution allowed.

## Important UX Decisions

Trade summary should show only user-facing values:

- You pay.
- Rate.
- Total fees.
- Expandable fee breakdown.
- You receive.
- Minimum received.

Developer details such as raw calldata, gas units, and gas price should not be shown in the main summary.

Minimum received is controlled by slippage:

- Default: `1%`.
- Presets: `0%`, `0.5%`, `1%`, `2%`, `Custom`.
- Custom range: `0%` to `10%`.

Quote freshness:

- Quote TTL is `20` seconds.
- Expired quotes remain visible.
- Expired quotes disable swap/dry-run.
- User must refresh the quote before execution.

Form behavior:

- If wallet is disconnected and user interacts with the form, show a non-modal connect prompt near the connect wallet button.
- If fields are invalid, show field-level validation messages.
- Any quote-affecting input change clears the existing quote.

## Main Files Changed Recently

- `src/app/page.tsx`
- `src/app/globals.css`
- `src/app/api/quote/route.ts`
- `src/lib/quoteClient.ts`
- `src/lib/server/aggregator.ts`
- `src/lib/server/zeroxClient.ts`
- `src/lib/server/mockAggregatorClient.ts`
- `src/lib/server/quoteProvider.ts`
- `src/lib/envPublic.ts`
- `src/lib/chains.ts`
- `src/lib/walletConnector.ts`

## Verification Habit

Run after changes:

```powershell
npm run typecheck
```

This has been passing after recent implementation changes.

## Suggested Restart Prompt

Paste this into a new session:

```text
We are continuing work on the wallet swap MVP in f:\assignments\wallet.
Please first read docs/context-handoff.md, docs/BRD.md, docs/prompt*.md,
docs/discussion-summary.md, and docs/implementation-change-summary.md.
Then inspect git status/diff before making changes.
Current focus is improving the non-custodial swap UI and evolving it toward the
favorite-pairs, price-alerts, reverse-swap-profit product described in the docs.
```
