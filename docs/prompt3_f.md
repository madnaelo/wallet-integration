Wallet Integration (MVP):

- Do NOT require MetaMask as the only option

- Implement a wallet connection modal with:
  - MetaMask (if injected provider is available)
  - WalletConnect (required fallback for all users)

- Behavior:
  - If MetaMask is installed → allow direct connection
  - If MetaMask is NOT installed → guide user to connect via WalletConnect (QR code or deep link)

- Use a standard library:
  - wagmi + viem OR ethers.js + WalletConnect SDK

- The app must work for:
  - Desktop users without MetaMask (via WalletConnect)
  - Mobile users (via WalletConnect deep linking)

- Wallet is required to execute swaps, but choice of wallet must be flexible