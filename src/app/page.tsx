"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import type { QuoteResponse } from "@/lib/types";
import { CHAINS, getAllowedChains, getChainById } from "@/lib/chains";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import { getEip1193Provider } from "@/lib/wallet";
import { ERC20_ABI } from "@/lib/erc20";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { swapLog } from "@/lib/swapLog";

type TxStatus = "idle" | "pending" | "confirmed" | "failed";

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const [selectedChainId, setSelectedChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);

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

  useEffect(() => {
    const eth = getEip1193Provider();
    if (!eth) return;

    const onAccountsChanged = (accounts: string[]) => {
      setWalletAddress(accounts?.[0] ?? "");
    };

    const onChainChanged = (hexChainId: string) => {
      const cid = Number.parseInt(hexChainId, 16);
      setWalletChainId(Number.isFinite(cid) ? cid : null);
    };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    (async () => {
      try {
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        setWalletAddress(accounts?.[0] ?? "");
        const hex = (await eth.request({ method: "eth_chainId" })) as string;
        onChainChanged(hex);
      } catch {
        // ignore
      }
    })();

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const sellTokenInfo = useMemo(() => tokens.find((t) => t.address === sellToken), [tokens, sellToken]);
  const buyTokenInfo = useMemo(() => tokens.find((t) => t.address === buyToken), [tokens, buyToken]);

  const canQuote =
    !!walletAddress &&
    isAddress(walletAddress) &&
    !!sellTokenInfo &&
    !!buyTokenInfo &&
    sellTokenInfo.address !== buyTokenInfo.address &&
    amountHuman.trim().length > 0;

  async function connectWallet() {
    setActionError("");
    const eth = getEip1193Provider();
    if (!eth) {
      setActionError("MetaMask not detected. Please install MetaMask.");
      return;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setWalletAddress(accounts?.[0] ?? "");
      const hex = (await eth.request({ method: "eth_chainId" })) as string;
      setWalletChainId(Number.parseInt(hex, 16));
    } catch (e: any) {
      setActionError(normalizeWalletError(e));
    }
  }

  async function ensureCorrectNetwork() {
    const eth = getEip1193Provider();
    if (!eth) throw new Error("MetaMask not detected.");

    const desired = selectedChainId;
    const current = walletChainId;

    if (current === desired) return;

    const hexDesired = "0x" + desired.toString(16);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexDesired }]
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        const c = CHAINS[desired];
        if (!c?.rpcUrls?.length || !c.nativeCurrency) throw new Error("Chain not available to add in this app.");
        await eth.request({
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

    const eth = getEip1193Provider();
    if (!eth) throw new Error("MetaMask not detected.");

    const provider = new ethers.BrowserProvider(eth);
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
      await ensureAllowanceAndApproveIfNeeded();

      const eth = getEip1193Provider();
      if (!eth) throw new Error("MetaMask not detected.");

      const provider = new ethers.BrowserProvider(eth);
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

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Swap Aggregator MVP</h1>
          <div className="subtle">Non-custodial swaps via 0x + MetaMask. Backend only builds quotes.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="badge">
            Network: <span className="mono">{chain?.name ?? `Chain ${selectedChainId}`}</span>
          </span>
          <button className="btn btnPrimary" onClick={connectWallet} disabled={!!walletAddress}>
            {walletAddress ? `Connected: ${shortAddr(walletAddress)}` : "Connect MetaMask"}
          </button>
        </div>
      </div>

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
              Swap
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
  if (e?.code === 4001) return "User rejected the request in MetaMask.";

  const msg =
    e?.shortMessage ||
    e?.reason ||
    e?.message ||
    (typeof e === "string" ? e : "") ||
    "Unknown error";

  // Common patterns from RPC / 0x
  if (/insufficient funds/i.test(msg)) return "Insufficient funds for gas or swap amount.";
  if (/insufficient liquidity/i.test(msg)) return "Insufficient liquidity for this trade.";
  if (/slippage/i.test(msg)) return "Swap failed due to slippage. Try again with a smaller amount.";

  return msg;
}
