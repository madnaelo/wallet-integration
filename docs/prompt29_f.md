# Prompt 29: Wallet Signing And Transaction Approval Clarity

## Product Context

The Wallet asks users to approve wallet signatures for history sync and wallet
transactions for swaps. Button labels such as `Open wallet to sign` and generic
statuses such as `Pending` can make users think the web app will open their
mobile wallet automatically.

## Requirement

Replace misleading action states with clear, non-clickable guidance:

- When history sync is waiting for a wallet signature, show a polished animated
  info pill telling the user to open the wallet app they used to connect.
- Do not present the waiting state as a disabled button.
- After the user clicks Swap and the wallet transaction request is in flight,
  show a visible animated pill telling the user to open the wallet app and sign
  the transaction.
- Keep the existing successful states, refresh actions, and saved history
  behavior unchanged.

## Technical Guidance

- Keep all wallet signing and transaction submission non-custodial.
- Clear the wallet-request notice whenever the request resolves, fails, or the
  quote is reset.
- Disable the swap action while the wallet is waiting for user approval to avoid
  duplicate transaction prompts.
- Keep UI text user-facing and avoid provider/debug language.

## Acceptance Criteria

- History sync clearly communicates that the user must approve a wallet
  signature outside the web page.
- Swap execution clearly communicates that the user must approve the transaction
  in their wallet app.
- The generic `Pending` state is not the only visible feedback while wallet
  approval is required.
- Frontend typecheck and lint pass.
