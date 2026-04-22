**🧠 Business Overview (Simple & Clear)**

We are building a **non-custodial crypto swap aggregator platform**.

**🎯 What it does**

- Users connect their crypto wallet (MetaMask, WalletConnect, etc.)
- The platform fetches **best token swap rates** across multiple decentralized exchanges (DEXs)
- Users execute trades **directly from their wallet**
- The platform **never holds user funds**

**💰 How it makes money**

- Adds a small **markup fee (0.1%-0.3%)** on each swap via aggregator APIs (like 0x / 1inch)
- Optional: earns referral commissions from fiat on-ramp providers

**⚖️ Legal positioning**

- Non-custodial → **no handling of funds**
- No fiat processing → **no banking/license required**
- Users sign their own transactions → platform is just a **software interface**

👉 This keeps it **\$0 licensing, low risk, and fast to launch**

**🧩 Core Value Proposition**

"A simple interface that gives users the best crypto swap rates across multiple exchanges in one place."

Users benefit from:

- Better prices (aggregated liquidity)
- Convenience (one UI instead of many DEXs)
- No signup required (wallet-based login)

**⚙️ Technical Overview (High-Level)**

**🧱 Architecture**

\[ User Wallet \]  
↓  
\[ Frontend (React / Next.js) \]  
↓  
\[ Backend API (Spring Boot or Node.js) \]  
↓  
\[ DEX Aggregator APIs \]  
↓  
\[ Blockchain \]

**🔹 Frontend Responsibilities**

- Wallet connection (MetaMask, WalletConnect)
- UI for token swap (from/to, amount)
- Display balances (via blockchain RPC)
- Show best price and route
- Ask user to sign transaction

**🔹 Backend Responsibilities**

- Call DEX aggregator APIs (0x, 1inch, ParaSwap)
- Inject **hidden fee wallet address**
- Return best quote to frontend
- Handle wallet-based login (signature verification)
- Store user preferences (optional)
- (Optional) analytics/logging

**🔹 Third-Party APIs Used**

**DEX Aggregators (core)**

- 0x API
- 1inch API
- ParaSwap API

**Optional**

- Jupiter (Solana)
- OpenOcean

**Fiat On-Ramp (optional)**

- Transak
- Ramp
- MoonPay

**🔐 Key Design Principles**

- ❌ Never store private keys
- ❌ Never custody funds
- ❌ Never execute trades on behalf of user
- ✅ User signs transactions in wallet
- ✅ Platform only builds transaction payload
- ✅ Fee is embedded in swap via API

**👤 Authentication Model**

- Wallet-based login (signature-based)
- No passwords required
- Wallet address = user ID

Optional:

- Store preferences (favorite tokens, settings)

**🗄️ Minimal Database Schema (Optional)**

**users**

- wallet_address (primary key)
- preferences (JSON)

**swap_logs (optional)**

- tx_hash
- timestamp
- fee_earned

**🚀 MVP Scope**

- Connect wallet
- Select tokens (from/to)
- Get best swap quote (via 0x API initially)
- Execute swap (user signs transaction)
- Collect fee via affiliate parameter