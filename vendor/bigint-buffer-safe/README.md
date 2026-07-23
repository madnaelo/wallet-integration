# bigint-buffer safe compatibility module

This private package supplies the four `bigint-buffer` functions used by
Solana's buffer-layout utilities without loading the vulnerable native binding
reported in `GHSA-3gc7-fjrx-p6mg`.

Conversions use JavaScript `BigInt` and are bounded to 4096 bytes. Solana's
layouts in this application use fixed widths of at most 32 bytes.
