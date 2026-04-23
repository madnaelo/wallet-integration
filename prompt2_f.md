# Prompt 2 (Full Context): Build a Production-Ready MVP Non-Custodial Crypto Swap Aggregator

You are an expert software developer. Build a production-ready MVP for a **non-custodial crypto swap aggregator** web application.

This prompt supersedes prior chat context. Use this as the single source of truth.

---

## 1) Product Summary

Build a minimal but production-ready swap UI that:
- Connects a user wallet (MetaMask initially)
- Lets the user select **Token A → Token B**
- Lets the user enter an amount
- Fetches a **real swap quote** from an aggregator (start with **0x Swap API**)
- Executes the swap **non-custodially**: the user signs and submits the transaction in their wallet
- The platform earns fees via aggregator affiliate/integrator parameters (no custody, no backend signing)

Non-custodial constraints:
- ❌ No private keys stored anywhere
- ❌ No backend transaction signing
- ❌ No custody of funds
- ✅ User signs transactions in MetaMask
- ✅ Backend only builds/returns quote/tx payload

---

## 2) Strict Tech Stack (MVP)

Frontend (STRICT):
- Next.js (React) with TypeScript
- ethers.js
- MetaMask wallet connection (MVP)
- Deployed on Vercel (or similar)

Backend (Decision):
- Prefer Node.js/TypeScript backend for best long-term adaptability with crypto ecosystem.
- Backend can be implemented as either:
  1) Next.js API routes (single repo) OR
  2) Separate Node service (Express/Fastify)
Choose the simplest production-ready approach, but keep code modular so it can be split later.

Do NOT use Spring Boot for this implementation unless explicitly requested later.

---

## 3) Core Backend Endpoint (MVP)

Implement:
- `GET /api/quote`

Behavior:
- Calls 0x Swap API quote endpoint:
  - `https://api.0x.org/swap/v1/quote` (or chain-specific base URL if required)
- Inject fee parameters:
  - `affiliateAddress` from environment variable
  - `buyTokenPercentageFee = 0.002` (0.2%)
- Return the **FULL** 0x response to the frontend, including at minimum:
  - `price`
  - `buyAmount`
  - `to`
  - `data`
  - `value`
  - `gas`

Auth:
- No user auth required for MVP.

Protection:
- Add basic rate limiting (e.g. per IP)
- Add lightweight caching for identical quote requests (short TTL)

Config:
- Use `0x API key` from environment variable.
- Support multiple environments (dev/qa/prod) via env vars.

---

## 4) Frontend Swap Execution (MVP)

UI:
- Token A selector
- Token B selector
- Amount input
- Quote display (price, buyAmount, estimated gas if available)
- "Swap" button

Flow:
1) User connects MetaMask.
2) Ensure wallet chainId is supported.
3) User selects tokens and amount.
4) Convert human-readable amount → base units using token decimals.
5) Frontend calls backend `GET /api/quote` with:
   - chainId
   - sellToken
   - buyToken
   - sellAmount (base units)
   - takerAddress (user wallet)
6) Display quote (convert values back to human-readable).
7) Before swap:
   - Check ERC20 allowance for sellToken
   - If insufficient:
     - Prompt user to approve token spending
     - Wait for approval confirmation
8) On "Swap":
   - Ensure wallet is on correct network (prompt switch if needed)
   - Estimate gas using ethers.js
   - Add safety buffer (~20%)
   - Fallback to quote.gas if estimation fails
   - Send transaction using signer.sendTransaction():
     - to = quote.to
     - data = quote.data
     - value = quote.value
     - gasLimit = computed gas
   - Let user sign in MetaMask
   - Show transaction hash after submission
   - Show status: pending → confirmed / failed

Error handling:
- Display clear user-friendly errors:
  - insufficient funds
  - insufficient liquidity
  - slippage issues
  - user rejected transaction
  - network mismatch

Important:
- Never send transactions from backend.

---

## 5) Dev/QA Testing Without Real Funds

Support safe testing via testnets:
- Use testnet chain IDs for dev/qa (configurable)
- Use faucet funds
- Provide environment guardrails to prevent accidental mainnet usage

Optional (recommended):
- Simulate transaction via eth_call before execution
- Estimate gas before showing swap

---

## 6) “All Chains” and “All Tokens” Strategy (Design for Future)

### Chains
Maintain an internal **enabled chain registry**:
- Controlled via `ALLOWED_CHAIN_IDS`
- Each chain includes:
  - chainId
  - name
  - aggregator base URL
  - RPC URL
  - feature flags

### Tokens
Use layered token approach:
1) Curated default list
2) Token import by address
3) Blocklist for malicious tokens
4) Optional risk checks later

For MVP:
- Provide small curated token list
- Support token import by address if feasible

---

## 7) Production Readiness Requirements (MVP)

Implement:
- Strong typing (TypeScript)
- Input validation (addresses, chainId, amounts)
- Clean error handling
- Environment config:
  - ZEROX_API_KEY
  - AFFILIATE_ADDRESS
  - ALLOWED_CHAIN_IDS
- Security basics:
  - CORS restrictions
  - Rate limiting
  - Avoid sensitive logging

Architecture:
- Aggregator abstraction layer:
  - DexAggregatorClient interface
  - ZeroXClient implementation
- Chain registry module
- Clear modular structure for future expansion

---

## 8) Swap Tracking (Lightweight)

After transaction submission:
- Capture and log:
  - tx hash
  - wallet address
  - timestamp
- Store in memory or simple log (no DB required for MVP)

---

## 9) Deliverables

- Next.js frontend (TypeScript)
- MetaMask wallet integration
- Backend `/api/quote`
- Swap execution via wallet
- ERC20 approval flow
- Dev/testnet support
- Fee collection via affiliateAddress

---

## 10) Notes / Business Context

Business model:
- Affiliate fee via 0x:
  - affiliateAddress
  - buyTokenPercentageFee = 0.002

Legal:
- Non-custodial
- User-signed transactions
- No fund handling

---

## 11) Implementation Guidance

- Keep MVP minimal but clean
- Design for future:
  - multi-aggregator
  - user accounts
  - analytics
  - alerts
- Do NOT implement those now

END OF PROMPT