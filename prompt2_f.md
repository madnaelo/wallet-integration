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
- Add basic abuse protection (rate limiting / caching) if feasible.

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
2) User selects tokens and amount.
3) Frontend calls backend `GET /api/quote` with:
   - chainId (from wallet)
   - sellToken (address or symbol)
   - buyToken (address or symbol)
   - sellAmount (in base units or human units; be explicit and consistent)
   - takerAddress (user wallet address)
4) Frontend displays quote.
5) On "Swap":
   - Use `ethers.js` signer to send the transaction:
     - `to` = quote.to
     - `data` = quote.data
     - `value` = quote.value
     - `gasLimit` = quote.gas (or estimateGas with a safety buffer)
   - Let user sign in MetaMask
   - Show transaction hash after submission
   - Optionally show confirmation status (pending/confirmed/failed)

Important:
- Ensure chain/network in MetaMask matches the quote chainId.
- Never send transactions from backend.

---

## 5) Dev/QA Testing Without Real Funds

Support safe testing via testnets:
- Use testnet chain IDs for dev/qa (configurable).
- Use faucet funds for gas and test tokens where available.
- Provide environment guardrails to prevent accidental mainnet usage in dev/qa.

Add optional preflight checks:
- Simulate transaction with `eth_call` before prompting swap (optional but recommended).
- Estimate gas and show errors early.

---

## 6) “All Chains” and “All Tokens” Strategy (Design for Future)

The MVP should be designed so it can expand to:
- Multiple chains
- Multiple aggregators (0x, 1inch, Paraswap, etc.)
- “All tokens” via discovery/import, not a massive static DB

Key design principles:

### Chains
Maintain an internal **enabled chain registry** (policy), not “every chain in existence.”
- Per environment, define `ALLOWED_CHAIN_IDS`.
- For each enabled chain, store required metadata:
  - chainId, name
  - aggregator base URL(s)
  - RPC URL(s)
  - feature flags (quotes enabled, swaps enabled)

Frontend should fetch enabled chains from backend (future endpoint), or use a shared config for MVP.

### Tokens
Do NOT attempt to store all tokens globally.
Use a layered approach:
1) Curated default token list per chain (for UX)
2) Token import by address (user pastes address)
3) Denylist/blocklist for known bad tokens
4) Optional risk checks (liquidity thresholds, honeypot/tax detection) later

For MVP:
- Provide a small curated token list for at least one chain.
- Optionally allow token import by address (recommended if time permits).

---

## 7) Production Readiness Requirements (MVP)

Implement:
- Strong typing (TypeScript) for request/response DTOs
- Input validation (chainId, addresses, amounts)
- Clear error handling and user-friendly messages
- Environment-based configuration:
  - `ZEROX_API_KEY`
  - `AFFILIATE_ADDRESS`
  - `ALLOWED_CHAIN_IDS` (dev/qa/prod)
  - RPC URLs if needed
- Security basics:
  - CORS configured appropriately
  - Rate limiting (at least minimal)
  - Do not log sensitive user data unnecessarily
- Code organization that supports future expansion:
  - Aggregator client interface (e.g., `DexAggregatorClient`)
  - `ZeroXClient` implementation
  - Quote normalization layer (optional)
  - Chain registry module

---

## 8) Deliverables

Produce a working MVP with:
- Next.js frontend (TypeScript) + ethers.js + MetaMask connect
- Backend `GET /api/quote` calling 0x with affiliate fee injection
- Swap execution via MetaMask using returned tx payload
- Dev/QA environment support via testnets and guardrails

---

## 9) Notes / Business Context

Business model:
- Earn fee via aggregator affiliate/integrator parameters:
  - `affiliateAddress` + `buyTokenPercentageFee=0.002`

Legal positioning:
- Non-custodial software interface
- Users sign their own transactions
- Platform never holds funds

---

## 10) Implementation Guidance

When implementing:
- Prefer simplicity but keep modular boundaries for future features:
  - user accounts
  - analytics/reporting
  - charts
  - favorites
  - swap history
  - price alerts/notifications

Do not implement those future features now, but design the code so they can be added without rewriting the MVP.

END OF PROMPT
