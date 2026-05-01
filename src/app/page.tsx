"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import type { QuoteResponse } from "@/lib/types";
import { CHAINS, getAllowedChains, getChainById } from "@/lib/chains";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { ERC20_ABI } from "@/lib/erc20";
import { envPublic } from "@/lib/envPublic";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { swapLog } from "@/lib/swapLog";
import { connectWallet, getActiveProvider, hasInjectedProvider } from "@/lib/walletConnector";

type TxStatus = "idle" | "pending" | "confirmed" | "failed";

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const isDryRun = envPublic.DISALLOW_MAINNET;
  const [selectedChainId, setSelectedChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);

  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const [sellToken, setSellToken] = useState<string>("");
  const [buyToken, setBuyToken] = useState<string>("");
  const [amountHuman, setAmountHuman] = useState<string>("");

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);

  const [approvalTxHash, setApprovalTxHash] = useState<string>("");
  const [swapTxHash, setSwapTxHash] = useState<string>("");
  const [swapStatus, setSwapStatus] = useState<TxStatus>("idle");
  const [actionError, setActionError] = useState<string>("");

  const chain = useMemo(() => getChainById(selectedChainId), [selectedChainId]);
  const tokens: TokenInfo[] = useMemo(() => DEFAULT_TOKENS_BY_CHAIN[selectedChainId] ?? [], [selectedChainId]);

  useEffect(() => {
    if (!sellToken && tokens.length > 0) setSellToken(tokens[0]!.address);
    if (!buyToken && tokens.length > 1) setBuyToken(tokens[1]!.address);
  }, [tokens, sellToken, buyToken]);

  // Attach listeners to the active provider (injected or WalletConnect)
  useEffect(() => {
    const p = provider ?? getActiveProvider();
    if (!p) return;

    const onAccountsChanged = (accounts: string[]) => {
      setWalletAddress(accounts?.[0] ?? "");
    };

    const onChainChanged = (hexChainId: string) => {
      const cid = Number.parseInt(hexChainId, 16);
      setWalletChainId(Number.isFinite(cid) ? cid : null);
    };

    const onDisconnect = () => {
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
    };

    p.on?.("accountsChanged", onAccountsChanged);
    p.on?.("chainChanged", onChainChanged);
    p.on?.("disconnect", onDisconnect);

    (async () => {
      try {
        const accounts = (await p.request({ method: "eth_accounts" })) as string[];
        setWalletAddress(accounts?.[0] ?? "");
        const hex = (await p.request({ method: "eth_chainId" })) as string;
        onChainChanged(hex);
      } catch {
        // ignore
      }
    })();

    return () => {
      p.removeListener?.("accountsChanged", onAccountsChanged);
      p.removeListener?.("chainChanged", onChainChanged);
      p.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider]);

  const sellTokenInfo = useMemo(() => tokens.find((t) => t.address === sellToken), [tokens, sellToken]);
  const buyTokenInfo = useMemo(() => tokens.find((t) => t.address === buyToken), [tokens, buyToken]);

  const canQuote =
    !!walletAddress &&
    isAddress(walletAddress) &&
    !!sellTokenInfo &&
    !!buyTokenInfo &&
    sellTokenInfo.address !== buyTokenInfo.address &&
    amountHuman.trim().length > 0;

  async function onConnectWallet() {
    setActionError("");
    try {
      const res = await connectWallet({ allowedChainIds: allowedChains.map((c) => c.chainId) });
      setProvider(res.provider);
    } catch (e: any) {
      setActionError(normalizeWalletError(e));
    }
  }

  function getProviderOrThrow(): Eip1193Provider {
    const p = provider ?? getActiveProvider();
    if (!p) throw new Error("No wallet connected. Click “Connect Wallet” first.");
    return p;
  }

  async function ensureCorrectNetwork() {
    const p = getProviderOrThrow();

    const desired = selectedChainId;
    const current = walletChainId;

    if (current === desired) return;

    const hexDesired = "0x" + desired.toString(16);
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexDesired }]
      });
    } catch (e: any) {
      // If chain not added, try to add it (best-effort)
      if (e?.code === 4902) {
        const c = CHAINS[desired];
        if (!c?.rpcUrls?.length || !c.nativeCurrency) throw new Error("Chain not available to add in this app.");
        await p.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexDesired,
              chainName: c.name,
              nativeCurrency: c.nativeCurrency,
              rpcUrls: c.rpcUrls,
              blockExplorerUrls: c.blockExplorerUrls
            }
          ]
        });
      } else {
        throw e;
      }
    }
  }

  async function fetchQuote() {
    setQuote(null);
    setQuoteError("");
    setActionError("");
    setApprovalTxHash("");
    setSwapTxHash("");
    setSwapStatus("idle");

    if (!canQuote || !sellTokenInfo || !buyTokenInfo) return;

    const sellAmount = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
    if (!sellAmount) {
      setQuoteError("Invalid amount.");
      return;
    }

    setQuoteLoading(true);
    try {
      const url = buildQuoteUrl({
        chainId: selectedChainId,
        sellToken: sellTokenInfo.address,
        buyToken: buyTokenInfo.address,
        sellAmount,
        takerAddress: walletAddress
      });

      const res = await fetch(url, { method: "GET" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error ?? body?.message ?? `Quote failed with status ${res.status}`;
        throw new Error(msg);
      }
      setQuote(body as QuoteResponse);
    } catch (e: any) {
      setQuoteError(normalizeWalletError(e));
    } finally {
      setQuoteLoading(false);
    }
  }

  async function ensureAllowanceAndApproveIfNeeded() {
    if (!quote) throw new Error("No quote loaded.");
    if (!sellTokenInfo) throw new Error("Sell token not selected.");
    if (!walletAddress) throw new Error("Wallet not connected.");

    if (sellTokenInfo.isNative) return;

    const p = getProviderOrThrow();
    const provider = new ethers.BrowserProvider(p);
    const signer = await provider.getSigner();

    const token = new ethers.Contract(sellTokenInfo.address, ERC20_ABI, signer);

    const spender = (quote.allowanceTarget as string | undefined) ?? quote.to;
    if (!spender || !isAddress(spender)) throw new Error("Invalid spender from quote.");

    const currentAllowance: bigint = await token.allowance(walletAddress, spender);
    const needed = BigInt(quote.sellAmount);

    if (currentAllowance >= needed) return;

    const tx = await token.approve(spender, needed);
    setApprovalTxHash(tx.hash);
    await tx.wait();
  }

  async function executeSwap() {
    setActionError("");
    if (!quote) {
      setActionError("Fetch a quote first.");
      return;
    }

    try {
      await ensureCorrectNetwork();

      if (isDryRun) {
        setSwapStatus("confirmed");
        setSwapTxHash("Dry run: no transaction submitted.");
        return;
      }

      await ensureAllowanceAndApproveIfNeeded();

      const p = getProviderOrThrow();
      const provider = new ethers.BrowserProvider(p);
      const signer = await provider.getSigner();

      setSwapStatus("pending");

      // Optional recommended: simulate via eth_call before sending
      try {
        await provider.call({
          to: quote.to,
          data: quote.data,
          value: BigInt(quote.value ?? "0")
        });
      } catch (e: any) {
        throw new Error(`Simulation failed: ${normalizeWalletError(e)}`);
      }

      let gasLimit: bigint | null = null;
      try {
        const estimated = await signer.estimateGas({
          to: quote.to,
          data: quote.data,
          value: BigInt(quote.value ?? "0")
        });
        gasLimit = (estimated * 120n) / 100n;
      } catch {
        if (quote.gas) gasLimit = (BigInt(quote.gas) * 120n) / 100n;
      }

      const tx = await signer.sendTransaction({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value ?? "0"),
        gasLimit: gasLimit ?? undefined
      });

      setSwapTxHash(tx.hash);
      swapLog.add({ txHash: tx.hash, walletAddress, timestampMs: Date.now() });

      const receipt = await tx.wait();
      if (receipt?.status === 1) setSwapStatus("confirmed");
      else setSwapStatus("failed");
    } catch (e: any) {
      setSwapStatus("failed");
      setActionError(normalizeWalletError(e));
    }
  }

  const quoteSummary = useMemo(() => {
    if (!quote || !sellTokenInfo || !buyTokenInfo) return null;

    const sellHuman = formatUnitsSafe(quote.sellAmount, sellTokenInfo.decimals);
    const buyHuman = formatUnitsSafe(quote.buyAmount, buyTokenInfo.decimals);

    return {
      sellHuman,
      buyHuman,
      price: (quote.price as string | undefined) ?? "",
      gas: (quote.gas as string | undefined) ?? ""
    };
  }, [quote, sellTokenInfo, buyTokenInfo]);

  const connectHint = useMemo(() => {
    if (walletAddress) return "";
    if (hasInjectedProvider()) return "Detected an injected wallet in your browser.";
    return "No injected wallet detected. We’ll open WalletConnect so you can connect a mobile wallet.";
  }, [walletAddress]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Swap Aggregator MVP</h1>
          <div className="subtle">Non-custodial swaps via 0x + your wallet. Backend only builds quotes.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="badge">
            Network: <span className="mono">{chain?.name ?? `Chain ${selectedChainId}`}</span>
          </span>
          <button className="btn btnPrimary" onClick={onConnectWallet} disabled={!!walletAddress}>
            {walletAddress ? `Connected: ${shortAddr(walletAddress)}` : "Connect Wallet"}
          </button>
        </div>
      </div>

      {!walletAddress ? <div className="small" style={{ marginBottom: 12 }}>{connectHint}</div> : null}

      <div className="grid">
        <div className="panel">
          <div className="row">
            <div>
              <div className="label">Chain</div>
              <select
                className="select"
                value={selectedChainId}
                onChange={(e) => {
                  setSelectedChainId(Number(e.target.value));
                  setQuote(null);
                  setQuoteError("");
                  setActionError("");
                }}
              >
                {allowedChains.map((c) => (
                  <option key={c.chainId} value={c.chainId}>
                    {c.name} (chainId {c.chainId})
                  </option>
                ))}
              </select>
              <div className="small" style={{ marginTop: 6 }}>
                Wallet chainId: <span className="mono">{walletChainId ?? "unknown"}</span>
              </div>
            </div>

            <div>
              <div className="label">Amount (sell)</div>
              <input
                className="input"
                value={amountHuman}
                onChange={(e) => setAmountHuman(e.target.value)}
                placeholder="0.01"
                inputMode="decimal"
              />
              <div className="small" style={{ marginTop: 6 }}>
                Amount is converted to base units using token decimals before requesting a quote.
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <div className="label">Sell token</div>
              <select className="select" value={sellToken} onChange={(e) => setSellToken(e.target.value)}>
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} {t.isNative ? "(native)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="label">Buy token</div>
              <select className="select" value={buyToken} onChange={(e) => setBuyToken(e.target.value)}>
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} {t.isNative ? "(native)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn" onClick={fetchQuote} disabled={!canQuote || quoteLoading}>
              {quoteLoading ? "Fetching quote..." : "Get Quote"}
            </button>
            <button className="btn btnPrimary" onClick={executeSwap} disabled={!quote || !walletAddress}>
              {isDryRun ? "Dry Run" : "Swap"}
            </button>
          </div>

          {quoteError ? <div className="error" style={{ marginTop: 12 }}>{quoteError}</div> : null}
          {actionError ? <div className="error" style={{ marginTop: 12 }}>{actionError}</div> : null}

          {approvalTxHash ? (
            <div className="small" style={{ marginTop: 12 }}>
              Approval tx: <span className="mono">{approvalTxHash}</span>
            </div>
          ) : null}

          {swapTxHash ? (
            <div className="small" style={{ marginTop: 8 }}>
              Swap tx: <span className="mono">{swapTxHash}</span>
            </div>
          ) : null}

          {swapStatus !== "idle" ? (
            <div
              className={swapStatus === "confirmed" ? "ok" : swapStatus === "pending" ? "warn" : "error"}
              style={{ marginTop: 8 }}
            >
              Status: {swapStatus}
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="label">Quote</div>
          {!quote ? (
            <div className="small">No quote loaded.</div>
          ) : (
            <>
              <div className="kv">
                <div className="subtle">Sell amount</div>
                <div className="mono">{quoteSummary?.sellHuman ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Buy amount</div>
                <div className="mono">{quoteSummary?.buyHuman ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Price</div>
                <div className="mono">{quoteSummary?.price ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Estimated gas (from quote)</div>
                <div className="mono">{quoteSummary?.gas ?? ""}</div>
              </div>
              <div className="small" style={{ marginTop: 10 }}>
                The backend returns the full 0x quote response. The swap transaction is sent directly from your wallet.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="label">Swap Tracking (in-memory)</div>
        <div className="small">
          {swapLog.list().length === 0
            ? "No swaps logged yet."
            : swapLog
                .list()
                .slice(0, 5)
                .map((s) => `${new Date(s.timestampMs).toISOString()}  ${s.walletAddress}  ${s.txHash}`)
                .join("\n")}
        </div>
      </div>
    </div>
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function normalizeWalletError(e: any): string {
  if (e?.code === 4001) return "User rejected the request in their wallet.";

  const msg =
    e?.shortMessage ||
    e?.reason ||
    e?.message ||
    (typeof e === "string" ? e : "") ||
    "Unknown error";

  if (/project id/i.test(msg) && /walletconnect/i.test(msg)) {
    return "WalletConnect is not configured. Set WALLETCONNECT_PROJECT_ID in your environment.";
  }

  if (/insufficient funds/i.test(msg)) return "Insufficient funds for gas or swap amount.";
  if (/insufficient liquidity/i.test(msg)) return "Insufficient liquidity for this trade.";
  if (/slippage/i.test(msg)) return "Swap failed due to slippage. Try again with a smaller amount.";

  return msg;
}
