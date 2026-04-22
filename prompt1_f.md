Build a minimal non-custodial crypto swap web app.

Frontend:
- Next.js (TypeScript)
- Use ethers.js
- Connect MetaMask wallet

UI:
- Select token A → token B
- Enter amount
- Show quote
- "Swap" button

Backend (Spring Boot):
- GET /api/quote
  - Calls 0x API:
    https://api.0x.org/swap/v1/quote
  - Inject:
    - affiliateAddress (env variable)
    - buyTokenPercentageFee = 0.002
  - Return FULL response including:
    - price
    - buyAmount
    - to
    - data
    - value
    - gas

Frontend Swap Execution:
- On clicking "Swap":
  - Use ethers.js signer.sendTransaction()
  - Pass:
    - to
    - data
    - value
    - gasLimit
  - Let user sign in MetaMask
  - Show transaction hash after submission

Constraints:
- No private keys stored
- No backend transaction signing
- No custody of funds

Goal:
- User can complete a real on-chain swap
- Platform earns fee via affiliateAddress