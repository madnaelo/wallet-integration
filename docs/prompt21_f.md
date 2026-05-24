# Prompt 21: Recipient Address Source Label

The recipient address area should make it clear how the displayed address was
chosen. Users need to know whether the address is the current connected wallet
or a custom recipient address they provided.

## Scope

- Add an informative label directly below the `Recipient address` label.
- Show `Current wallet` when the recipient is coming from the connected wallet.
- Show `Pasted address` when the user saved a pasted address.
- Show `Scanned QR` when the user saved an address from QR scanning.
- Show `Imported wallet` when the address came from the wallet import flow.
- Keep the label compact on one line and show the selected recipient network.
- Do not duplicate the recipient address inside the label because the readonly
  address field already displays it.
- When wallet import exposes a wallet name, include it in the label.
- Preserve the existing pencil edit flow.

## Product Guidance

- The label should feel like the connected wallet label: compact, visible, and
  useful without adding technical explanation.
- Do not make the user infer recipient source from memory.
- Keep the full recipient address available in accessible title/label text.

## Safety Guidance

- Reset the recipient source to `Current wallet` when the destination token or
  recipient wallet address changes back to the connected-wallet flow.
- Do not claim an address came from a wallet if it was pasted or scanned.
- Do not hide the recipient address; custom-recipient swaps need visible review.
