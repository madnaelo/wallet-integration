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
import {
  connectWallet,
  disconnectWallet,
  getActiveProvider,
  getActiveProviderKind,
  hasInjectedProvider,
  walletSessionSupportsMethod
} from "@/lib/walletConnector";
import {
  BackendClientError,
  type BackendSession,
  type SaveSwapHistoryRequest,
  type SwapHistoryRecord,
  listSwapHistory,
  requestAuthNonce,
  saveSwapHistory,
  verifyAuthSignature
} from "@/lib/backendClient";

type TxStatus = "idle" | "pending" | "confirmed" | "failed";
const QUOTE_TTL_SECONDS = 20;
const BACKEND_SESSION_STORAGE_KEY = "wallet.swapAssistant.backendSession.v1";
const SIGNING_ATTEMPT_TIMEOUT_MS = 90_000;
const WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS = 300_000;
const SIGNING_ATTEMPT_EXPIRY_SECONDS = 300;

type DisplayToken = { address: string; symbol: string; decimals: number };
type QuoteValidationErrors = {
  amount?: string;
  sellToken?: string;
  buyToken?: string;
  slippage?: string;
};
type FeeLine = {
  label: string;
  amount: string;
  token: DisplayToken;
  display: string;
  buyTokenAmount?: string;
  buyTokenDisplay?: string;
};

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const isDryRun = envPublic.DISALLOW_MAINNET;
  const [selectedChainId, setSelectedChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);

  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletKind, setWalletKind] = useState<"injected" | "walletconnect" | null>(null);

  const [sellToken, setSellToken] = useState<string>("");
  const [buyToken, setBuyToken] = useState<string>("");
  const [amountHuman, setAmountHuman] = useState<string>("");
  const [slippageChoice, setSlippageChoice] = useState<string>("100");
  const [customSlippagePct, setCustomSlippagePct] = useState<string>("1");

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteFetchedAtMs, setQuoteFetchedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [quoteError, setQuoteError] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);

  const [approvalTxHash, setApprovalTxHash] = useState<string>("");
  const [swapTxHash, setSwapTxHash] = useState<string>("");
  const [swapStatus, setSwapStatus] = useState<TxStatus>("idle");
  const [actionError, setActionError] = useState<string>("");
  const [connectPromptVisible, setConnectPromptVisible] = useState<boolean>(false);
  const [quoteValidationVisible, setQuoteValidationVisible] = useState<boolean>(false);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [dbSwapHistory, setDbSwapHistory] = useState<SwapHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string>("");
  const [historyNotice, setHistoryNotice] = useState<string>("");

  const chain = useMemo(() => getChainById(selectedChainId), [selectedChainId]);
  const tokens: TokenInfo[] = useMemo(() => DEFAULT_TOKENS_BY_CHAIN[selectedChainId] ?? [], [selectedChainId]);

  useEffect(() => {
    if (!sellToken && tokens.length > 0) setSellToken(tokens[0]!.address);
    if (!buyToken && tokens.length > 1) setBuyToken(tokens[1]!.address);
  }, [tokens, sellToken, buyToken]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Attach listeners to the active provider (injected or WalletConnect)
  useEffect(() => {
    const p = provider ?? getActiveProvider();
    if (!p) return;

    const onAccountsChanged = (accounts: string[]) => {
      setWalletAddress(accounts?.[0] ?? "");
      if (accounts?.[0]) setConnectPromptVisible(false);
    };

    const onChainChanged = (hexChainId: string) => {
      const cid = Number.parseInt(hexChainId, 16);
      setWalletChainId(Number.isFinite(cid) ? cid : null);
    };

    const onDisconnect = () => {
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
      setWalletKind(null);
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

  useEffect(() => {
    if (!walletAddress) {
      setBackendSession(null);
      setDbSwapHistory([]);
      setHistoryError("");
      setHistoryNotice("");
      setHistoryLoading(false);
      return;
    }

    const stored = readStoredBackendSession();
    if (!stored || !isSessionForWallet(stored, walletAddress)) {
      setBackendSession(null);
      setDbSwapHistory([]);
      setHistoryError("");
      setHistoryNotice("");
      setHistoryLoading(false);
      return;
    }

    setBackendSession(stored);
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryNotice("");
    loadBackendHistory(stored)
      .catch((e: any) => {
        setDbSwapHistory([]);
        setBackendSession(null);
        if (isExpiredBackendSessionError(e)) clearStoredBackendSession();
        setHistoryError(normalizeWalletError(e));
      })
      .finally(() => setHistoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, provider]);

  const sellTokenInfo = useMemo(() => tokens.find((t) => t.address === sellToken), [tokens, sellToken]);
  const buyTokenInfo = useMemo(() => tokens.find((t) => t.address === buyToken), [tokens, buyToken]);
  const slippageBps = useMemo(
    () => parseSlippageBps(slippageChoice, customSlippagePct),
    [slippageChoice, customSlippagePct]
  );
  const quoteValidationErrors = useMemo(
    () =>
      getQuoteValidationErrors({
        amountHuman,
        sellTokenInfo,
        buyTokenInfo,
        slippageBps
      }),
    [amountHuman, sellTokenInfo, buyTokenInfo, slippageBps]
  );
  const hasQuoteValidationErrors = useMemo(
    () => Object.values(quoteValidationErrors).some(Boolean),
    [quoteValidationErrors]
  );

  const canQuote =
    !!walletAddress &&
    isAddress(walletAddress) &&
    !hasQuoteValidationErrors;
  const quoteAgeSeconds = quoteFetchedAtMs ? Math.floor((nowMs - quoteFetchedAtMs) / 1000) : 0;
  const quoteSecondsRemaining = quote ? Math.max(0, QUOTE_TTL_SECONDS - quoteAgeSeconds) : 0;
  const isQuoteExpired = !!quote && quoteSecondsRemaining <= 0;

  function requireWalletForForm() {
    if (walletAddress) return true;
    setConnectPromptVisible(true);
    setQuoteError("");
    setActionError("");
    return false;
  }

  function revealQuoteValidation() {
    if (!walletAddress) requireWalletForForm();
    if (hasQuoteValidationErrors) setQuoteValidationVisible(true);
  }

  function clearQuoteState() {
    setQuote(null);
    setQuoteFetchedAtMs(null);
    setQuoteError("");
    setApprovalTxHash("");
    setSwapTxHash("");
    setSwapStatus("idle");
  }

  async function onConnectWallet() {
    setActionError("");
    try {
      const res = await connectWallet({ allowedChainIds: allowedChains.map((c) => c.chainId) });
      setProvider(res.provider);
      setWalletKind(res.kind);
      setConnectPromptVisible(false);
    } catch (e: any) {
      setActionError(normalizeWalletError(e));
    }
  }

  async function onDisconnectWallet() {
    setActionError("");
    setHistoryError("");
    setHistoryNotice("");
    try {
      await disconnectWallet();
    } catch {
      // Best-effort local cleanup still happens below.
    } finally {
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
      setWalletKind(null);
      setBackendSession(null);
      setDbSwapHistory([]);
      clearQuoteState();
    }
  }

  function getProviderOrThrow(): Eip1193Provider {
    const p = provider ?? getActiveProvider();
    if (!p) throw new Error("No wallet connected. Click “Connect Wallet” first.");
    return p;
  }

  async function ensureBackendSession(): Promise<BackendSession> {
    if (!walletAddress) throw new Error("Connect your wallet before saving swap history.");

    const stored = readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      setBackendSession(stored);
      return stored;
    }

    const p = getProviderOrThrow();
    setHistoryNotice("Requesting a one-time sign-in message from the backend...");
    const nonce = await requestAuthNonce(envPublic.BACKEND_BASE_URL, walletAddress);
    const signature = await signMessageWithProvider(
      p,
      walletAddress,
      nonce.message,
      walletKind ?? getActiveProviderKind(),
      setHistoryNotice
    );
    setHistoryNotice("Signature received. Verifying wallet ownership...");
    const session = await verifyAuthSignature(envPublic.BACKEND_BASE_URL, walletAddress, signature);
    writeStoredBackendSession(session);
    setBackendSession(session);
    setHistoryNotice("");
    return session;
  }

  async function refreshBackendHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryNotice("");
    try {
      const session = await ensureBackendSession();
      await loadBackendHistory(session);
    } catch (e: any) {
      setDbSwapHistory([]);
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setHistoryError(normalizeWalletError(e));
    } finally {
      setHistoryNotice("");
      setHistoryLoading(false);
    }
  }

  async function loadBackendHistory(session: BackendSession) {
    const history = await listSwapHistory(envPublic.BACKEND_BASE_URL, session, 25);
    setDbSwapHistory(history);
  }

  async function persistCurrentSwap(status: SaveSwapHistoryRequest["status"], txHash?: string) {
    if (!quote || !sellTokenInfo || !buyTokenInfo) return;

    let session = await ensureBackendSession();
    const request: SaveSwapHistoryRequest = {
      chainId: selectedChainId,
      txHash,
      status,
      sellTokenAddress: sellTokenInfo.address,
      sellTokenSymbol: sellTokenInfo.symbol,
      sellTokenDecimals: sellTokenInfo.decimals,
      buyTokenAddress: buyTokenInfo.address,
      buyTokenSymbol: buyTokenInfo.symbol,
      buyTokenDecimals: buyTokenInfo.decimals,
      sellAmountRaw: quote.sellAmount,
      buyAmountRaw: quote.buyAmount,
      minBuyAmountRaw: stringValue(quote.minBuyAmount),
      aggregator: "0x",
      quote
    };

    let saved: SwapHistoryRecord;
    try {
      saved = await saveSwapHistory(envPublic.BACKEND_BASE_URL, session, request);
    } catch (e: any) {
      if (!isExpiredBackendSessionError(e)) throw e;
      clearStoredBackendSession();
      setBackendSession(null);
      session = await ensureBackendSession();
      saved = await saveSwapHistory(envPublic.BACKEND_BASE_URL, session, request);
    }
    setDbSwapHistory((history) => [saved, ...history.filter((item) => item.id !== saved.id)].slice(0, 25));
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

    revealQuoteValidation();
    if (!requireWalletForForm()) return;
    if (!canQuote || !sellTokenInfo || !buyTokenInfo) return;
    if (slippageBps === null) {
      setQuoteError("Invalid slippage tolerance.");
      return;
    }

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
        takerAddress: walletAddress,
        slippageBps
      });

      const res = await fetch(url, { method: "GET" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error ?? body?.message ?? `Quote failed with status ${res.status}`;
        throw new Error(msg);
      }
      setQuote(body as QuoteResponse);
      setQuoteFetchedAtMs(Date.now());
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
    if (isQuoteExpired) {
      setActionError("Quote expired. Refresh the quote before continuing.");
      return;
    }

    try {
      await ensureCorrectNetwork();

      if (isDryRun) {
        setSwapStatus("confirmed");
        setSwapTxHash("Dry run: no transaction submitted.");
        try {
          await persistCurrentSwap("dry_run", "dry-run");
        } catch (historySaveError: any) {
          setHistoryError(normalizeWalletError(historySaveError));
        }
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
      if (receipt?.status === 1) {
        setSwapStatus("confirmed");
        try {
          await persistCurrentSwap("confirmed", tx.hash);
        } catch (historySaveError: any) {
          setHistoryError(normalizeWalletError(historySaveError));
        }
      } else setSwapStatus("failed");
    } catch (e: any) {
      setSwapStatus("failed");
      setActionError(normalizeWalletError(e));
    }
  }

  const quoteSummary = useMemo(() => {
    if (!quote || !sellTokenInfo || !buyTokenInfo || !chain?.nativeCurrency) return null;

    const nativeToken: DisplayToken = {
      address: "ETH",
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals
    };
    const sellDisplayToken = tokenInfoToDisplay(sellTokenInfo);
    const buyDisplayToken = tokenInfoToDisplay(buyTokenInfo);
    const tokenForAddress = (address: string): DisplayToken => resolveDisplayToken(address, tokens, nativeToken);

    const sellHuman = formatTokenAmount(quote.sellAmount, sellDisplayToken);
    const minBuyAmount = stringValue(quote.minBuyAmount);
    const gasUnits = (quote.gas as string | undefined) ?? nestedString(quote, ["transaction", "gas"]);
    const gasPriceWei = nestedString(quote, ["transaction", "gasPrice"]);
    const networkFeeWei = stringValue(quote.totalNetworkFee) || multiplyIntegerStrings(gasUnits, gasPriceWei);
    const networkFeeLine = networkFeeWei
      ? {
          label: "Network fee",
          amount: networkFeeWei,
          token: nativeToken,
          display: formatTokenAmount(networkFeeWei, nativeToken)
        }
      : null;
    const rawFeeLines = [...(networkFeeLine ? [networkFeeLine] : []), ...collectFeeLines(quote, tokenForAddress)];
    const feeLines = rawFeeLines.map((fee) =>
      withBuyTokenEquivalent(fee, sellDisplayToken, buyDisplayToken, quote.sellAmount, quote.buyAmount)
    );
    const buyTokenFees = sumBuyTokenFees(feeLines);
    const netBuyAmount = subtractIntegerStrings(quote.buyAmount, buyTokenFees);
    const netMinBuyAmount = minBuyAmount ? subtractIntegerStrings(minBuyAmount, buyTokenFees) : "";

    return {
      sellHuman,
      buyHuman: formatTokenAmount(netBuyAmount, buyDisplayToken),
      minBuyHuman: netMinBuyAmount ? formatTokenAmount(netMinBuyAmount, buyDisplayToken) : "",
      price: formatDerivedPrice(quote.sellAmount, sellDisplayToken, netBuyAmount, buyDisplayToken),
      feeLines,
      totalFees: formatConvertedFeeTotal(feeLines, buyDisplayToken)
    };
  }, [quote, sellTokenInfo, buyTokenInfo, chain, tokens]);

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
        <div className="walletActions">
          <span className="badge">
            Network: <span className="mono">{chain?.name ?? `Chain ${selectedChainId}`}</span>
          </span>
          <button className="btn btnPrimary" onClick={onConnectWallet} disabled={!!walletAddress}>
            {walletAddress ? `Connected: ${shortAddr(walletAddress)}` : "Connect Wallet"}
          </button>
          {walletAddress ? (
            <button className="btn" onClick={onDisconnectWallet}>
              Disconnect
            </button>
          ) : null}
          {connectPromptVisible && !walletAddress ? (
            <div className="connectNudge">
              <strong>Connect wallet first</strong>
              <span>Connect your wallet to get a quote or change swap details.</span>
            </div>
          ) : null}
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
                  requireWalletForForm();
                  setSelectedChainId(Number(e.target.value));
                  clearQuoteState();
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
                onChange={(e) => {
                  requireWalletForForm();
                  setAmountHuman(e.target.value);
                  clearQuoteState();
                }}
                aria-invalid={quoteValidationVisible && !!quoteValidationErrors.amount}
                aria-describedby="amount-error"
                placeholder="0.01"
                inputMode="decimal"
              />
              {quoteValidationVisible && quoteValidationErrors.amount ? (
                <div className="fieldError" id="amount-error">
                  {quoteValidationErrors.amount}
                </div>
              ) : null}
              <div className="small" style={{ marginTop: 6 }}>
                Amount is converted to base units using token decimals before requesting a quote.
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <div className="label">Sell token</div>
              <select
                className="select"
                value={sellToken}
                onChange={(e) => {
                  requireWalletForForm();
                  setSellToken(e.target.value);
                  clearQuoteState();
                }}
                aria-invalid={quoteValidationVisible && !!quoteValidationErrors.sellToken}
                aria-describedby="sell-token-error"
              >
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} {t.isNative ? "(native)" : ""}
                  </option>
                ))}
              </select>
              {quoteValidationVisible && quoteValidationErrors.sellToken ? (
                <div className="fieldError" id="sell-token-error">
                  {quoteValidationErrors.sellToken}
                </div>
              ) : null}
            </div>

            <div>
              <div className="label">Buy token</div>
              <select
                className="select"
                value={buyToken}
                onChange={(e) => {
                  requireWalletForForm();
                  setBuyToken(e.target.value);
                  clearQuoteState();
                }}
                aria-invalid={quoteValidationVisible && !!quoteValidationErrors.buyToken}
                aria-describedby="buy-token-error"
              >
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} {t.isNative ? "(native)" : ""}
                  </option>
                ))}
              </select>
              {quoteValidationVisible && quoteValidationErrors.buyToken ? (
                <div className="fieldError" id="buy-token-error">
                  {quoteValidationErrors.buyToken}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label">Slippage tolerance</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select
                className="select"
                style={{ maxWidth: 180 }}
                value={slippageChoice}
                onChange={(e) => {
                  requireWalletForForm();
                  setSlippageChoice(e.target.value);
                  clearQuoteState();
                }}
                aria-invalid={quoteValidationVisible && !!quoteValidationErrors.slippage}
                aria-describedby="slippage-error"
              >
                <option value="0">0%</option>
                <option value="50">0.5%</option>
                <option value="100">1%</option>
                <option value="200">2%</option>
                <option value="custom">Custom</option>
              </select>
              {slippageChoice === "custom" ? (
                <input
                  className="input"
                  style={{ maxWidth: 160 }}
                  value={customSlippagePct}
                  onChange={(e) => {
                    requireWalletForForm();
                    setCustomSlippagePct(e.target.value);
                    clearQuoteState();
                  }}
                  aria-invalid={quoteValidationVisible && !!quoteValidationErrors.slippage}
                  aria-describedby="slippage-error"
                  placeholder="1"
                  inputMode="decimal"
                />
              ) : null}
            </div>
            {quoteValidationVisible && quoteValidationErrors.slippage ? (
              <div className="fieldError" id="slippage-error">
                {quoteValidationErrors.slippage}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <span className="quoteButtonWrap" onMouseEnter={revealQuoteValidation} onClick={revealQuoteValidation}>
              <button className="btn" onClick={fetchQuote} disabled={(!!walletAddress && !canQuote) || quoteLoading}>
                {quoteLoading ? "Fetching quote..." : quote ? "Refresh Quote" : "Get Quote"}
              </button>
            </span>
            <button className="btn btnPrimary" onClick={executeSwap} disabled={!quote || !walletAddress || isQuoteExpired}>
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
          <div className="quoteHeader">
            <div className="label">Trade Summary</div>
            {quote ? (
              <span className={isQuoteExpired ? "quoteExpired" : "quoteTimer"}>
                {isQuoteExpired ? "Quote expired" : `Refreshes in ${quoteSecondsRemaining}s`}
              </span>
            ) : null}
          </div>
          {!quote ? (
            <div className="small">No quote loaded.</div>
          ) : (
            <>
              <div className="kv">
                <div className="subtle">You pay</div>
                <div className="mono">{quoteSummary?.sellHuman ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Rate</div>
                <div className="mono">{quoteSummary?.price ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Total fees</div>
                <div className="mono">{quoteSummary?.totalFees || "Not provided"}</div>
              </div>
              {quoteSummary?.feeLines.length ? (
                <details className="feeDetails">
                  <summary>Fee breakdown</summary>
                  {quoteSummary.feeLines.map((fee, index) => (
                    <div className="kv" key={`${fee.label}-${fee.token.address}-${index}`}>
                      <div className="subtle">{fee.label}</div>
                      <div className="mono">{formatFeeDetail(fee)}</div>
                    </div>
                  ))}
                </details>
              ) : null}
              <div className="kv receiveRow">
                <div className="subtle">You receive</div>
                <div className="mono">{quoteSummary?.buyHuman ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Minimum received</div>
                <div className="mono">{quoteSummary?.minBuyHuman || "Not provided"}</div>
              </div>
              <div className="small" style={{ marginTop: 10 }}>
                Final received amount can change before confirmation, but it should not be below the minimum received amount.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="quoteHeader">
          <div>
            <div className="label">Swap History (database)</div>
            <div className="subtle">
              {backendSession ? `Signed in as ${shortAddr(backendSession.walletAddress)}` : "Wallet signature required to save history."}
            </div>
          </div>
          <button className="btn" onClick={refreshBackendHistory} disabled={!walletAddress || historyLoading}>
            {historyLoading ? (backendSession ? "Syncing..." : "Open Wallet To Sign") : backendSession ? "Refresh History" : "Sign In To Sync"}
          </button>
        </div>
        {historyNotice ? <div className="small" style={{ marginTop: 8 }}>{historyNotice}</div> : null}
        {historyError ? <div className="error" style={{ marginTop: 8 }}>{historyError}</div> : null}
        <div className="small">
          {dbSwapHistory.length === 0
            ? "No database-backed swaps saved yet."
            : dbSwapHistory
                .slice(0, 5)
                .map(
                  (s) =>
                    `${new Date(s.createdAt).toISOString()}  ${s.status}  ${s.sellTokenSymbol}->${s.buyTokenSymbol}  ${
                      s.txHash ?? "no tx"
                    }`
                )
                .join("\n")}
        </div>
        <div className="small" style={{ marginTop: 10 }}>
          Local execution log entries: {swapLog.list().length}
        </div>
      </div>
    </div>
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function readStoredBackendSession(): BackendSession | null {
  try {
    const raw = window.localStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackendSession;
    if (!parsed.walletAddress || !parsed.accessToken || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now() + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredBackendSession(session: BackendSession) {
  window.localStorage.setItem(BACKEND_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredBackendSession() {
  window.localStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
}

function isSessionForWallet(session: BackendSession, walletAddress: string): boolean {
  return session.walletAddress.toLowerCase() === walletAddress.toLowerCase();
}

function isExpiredBackendSessionError(e: any): boolean {
  return e instanceof BackendClientError && e.status === 401;
}

async function signMessageWithProvider(
  provider: Eip1193Provider,
  walletAddress: string,
  message: string,
  providerKind: "injected" | "walletconnect" | null,
  setNotice: (message: string) => void
): Promise<string> {
  const hexMessage = utf8ToHex(message);
  const supportsPersonalSign = walletSessionSupportsMethod(provider, "personal_sign");
  if (providerKind === "walletconnect" && supportsPersonalSign === false) {
    throw new Error(
      "The connected WalletConnect session did not approve personal_sign. Disconnect, reconnect, and approve message signing."
    );
  }

  const attempts =
    providerKind === "walletconnect"
      ? [
          { label: "wallet text signature", params: [message, walletAddress] },
          { label: "wallet hex signature", params: [hexMessage, walletAddress] }
        ]
      : [
          { label: "wallet hex signature", params: [hexMessage, walletAddress] },
          { label: "wallet text signature", params: [message, walletAddress] }
        ];

  let lastError: unknown = null;
  for (const [index, attempt] of attempts.entries()) {
    try {
      setNotice(
        `Open your connected wallet and approve the sign-in message. This proves wallet ownership and cannot move funds.`
      );
      const signature = await requestWithTimeout(
        requestWalletSignature(provider, attempt.params, providerKind),
        providerKind === "walletconnect" ? WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS : SIGNING_ATTEMPT_TIMEOUT_MS,
        `${attempt.label} did not return a signature.`
      );

      if (typeof signature !== "string" || !signature.startsWith("0x")) {
        throw new Error("Wallet did not return a valid signature.");
      }

      return signature;
    } catch (e: any) {
      if (isUserRejectedWalletRequest(e)) throw e;
      if (isWalletRequestTimeout(e)) {
        throw new Error(
          "The connected wallet did not return a signature. Reopen the wallet request, or disconnect/reconnect WalletConnect and try again."
        );
      }
      lastError = e;
      if (index === 0) {
        setNotice("The wallet did not accept the first signing format. Trying the alternate signing format...");
      }
    }
  }

  throw new Error(normalizeWalletError(lastError) || "Wallet did not return a signature.");
}

function requestWalletSignature(
  provider: Eip1193Provider,
  params: string[],
  providerKind: "injected" | "walletconnect" | null
): Promise<unknown> {
  const args = {
    method: "personal_sign",
    params
  };
  if (providerKind === "walletconnect") {
    return provider.request(args, SIGNING_ATTEMPT_EXPIRY_SECONDS);
  }
  return provider.request(args);
}

function requestWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const error = new Error(message);
      error.name = "WalletRequestTimeout";
      reject(error);
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timeoutId));
  });
}

function isWalletRequestTimeout(e: any): boolean {
  return e?.name === "WalletRequestTimeout";
}

function isUserRejectedWalletRequest(e: any): boolean {
  const message = String(e?.message ?? e ?? "");
  return e?.code === 4001 || /reject|denied|cancel/i.test(message);
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getQuoteValidationErrors(params: {
  amountHuman: string;
  sellTokenInfo: TokenInfo | undefined;
  buyTokenInfo: TokenInfo | undefined;
  slippageBps: number | null;
}): QuoteValidationErrors {
  const errors: QuoteValidationErrors = {};

  if (!params.sellTokenInfo) {
    errors.sellToken = "Select a token to sell.";
  }

  if (!params.buyTokenInfo) {
    errors.buyToken = "Select a token to buy.";
  }

  if (params.sellTokenInfo && params.buyTokenInfo && params.sellTokenInfo.address === params.buyTokenInfo.address) {
    errors.buyToken = "Choose a different token to buy.";
  }

  if (!params.amountHuman.trim()) {
    errors.amount = "Enter an amount.";
  } else if (params.sellTokenInfo && !parseUnitsSafe(params.amountHuman, params.sellTokenInfo.decimals)) {
    errors.amount = "Enter a valid amount greater than 0.";
  }

  if (params.slippageBps === null) {
    errors.slippage = "Enter a slippage tolerance from 0% to 10%.";
  }

  return errors;
}

function tokenInfoToDisplay(token: TokenInfo): DisplayToken {
  return {
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals
  };
}

function resolveDisplayToken(address: string, tokens: TokenInfo[], nativeToken: DisplayToken): DisplayToken {
  if (isNativeTokenAddress(address)) return nativeToken;

  const found = tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(address));
  if (found) return tokenInfoToDisplay(found);

  return {
    address,
    symbol: isAddress(address) ? shortAddr(address) : address,
    decimals: 18
  };
}

function isNativeTokenAddress(address: string): boolean {
  const normalized = normalizeTokenKey(address);
  return normalized === "eth" || normalized === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}

function formatTokenAmount(amountBaseUnits: string, token: DisplayToken): string {
  return `${formatDecimal(formatUnitsSafe(amountBaseUnits, token.decimals), 8)} ${token.symbol}`;
}

function formatDerivedPrice(
  sellAmount: string,
  sellToken: DisplayToken,
  buyAmount: string,
  buyToken: DisplayToken
): string {
  const sell = Number(formatUnitsSafe(sellAmount, sellToken.decimals));
  const buy = Number(formatUnitsSafe(buyAmount, buyToken.decimals));
  if (!Number.isFinite(sell) || !Number.isFinite(buy) || sell <= 0) return "";
  return `${formatDecimal(String(buy / sell), 8)} ${buyToken.symbol} per ${sellToken.symbol}`;
}

function formatDecimal(value: string, maximumFractionDigits: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n === 0) return "0";
  const threshold = 1 / 10 ** maximumFractionDigits;
  if (Math.abs(n) < threshold) return `< ${threshold.toLocaleString(undefined, { maximumFractionDigits })}`;
  return n.toLocaleString(undefined, {
    maximumFractionDigits,
    maximumSignificantDigits: 10
  });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseSlippageBps(choice: string, customPct: string): number | null {
  if (choice !== "custom") return Number(choice);

  const pct = Number(customPct.trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 10) return null;
  return Math.round(pct * 100);
}

function multiplyIntegerStrings(a: string, b: string): string {
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return "";
  return (BigInt(a) * BigInt(b)).toString();
}

function subtractIntegerStrings(value: string, deduction: string): string {
  if (!/^\d+$/.test(value)) return value;
  if (!/^\d+$/.test(deduction)) return value;
  const result = BigInt(value) - BigInt(deduction);
  return result > 0n ? result.toString() : "0";
}

function collectFeeLines(quote: QuoteResponse, tokenForAddress: (address: string) => DisplayToken): FeeLine[] {
  const fees: any = quote.fees;
  if (!fees || typeof fees !== "object") return [];

  const lines: FeeLine[] = [];
  pushFeeLine(lines, "0x provider fee", fees.zeroExFee, tokenForAddress);
  pushFeeLine(lines, "Platform fee", fees.integratorFee, tokenForAddress);
  if (Array.isArray(fees.integratorFees)) {
    fees.integratorFees.forEach((fee: unknown, index: number) => {
      pushFeeLine(lines, `Platform fee ${index + 1}`, fee, tokenForAddress);
    });
  }
  pushFeeLine(lines, "Additional gas fee", fees.gasFee, tokenForAddress);
  return lines;
}

function withBuyTokenEquivalent(
  fee: FeeLine,
  sellToken: DisplayToken,
  buyToken: DisplayToken,
  sellAmount: string,
  buyAmount: string
): FeeLine {
  const buyTokenAmount = convertFeeToBuyToken(fee, sellToken, buyToken, sellAmount, buyAmount);
  return {
    ...fee,
    buyTokenAmount,
    buyTokenDisplay: buyTokenAmount ? formatTokenAmount(buyTokenAmount, buyToken) : undefined
  };
}

function convertFeeToBuyToken(
  fee: FeeLine,
  sellToken: DisplayToken,
  buyToken: DisplayToken,
  sellAmount: string,
  buyAmount: string
): string {
  if (isSameToken(fee.token, buyToken)) return fee.amount;
  if (isSameToken(fee.token, sellToken)) return multiplyDivideIntegerStrings(fee.amount, buyAmount, sellAmount);
  return "";
}

function multiplyDivideIntegerStrings(value: string, multiplier: string, divisor: string): string {
  if (!/^\d+$/.test(value) || !/^\d+$/.test(multiplier) || !/^\d+$/.test(divisor)) return "";
  const divisorBigInt = BigInt(divisor);
  if (divisorBigInt === 0n) return "";
  return ((BigInt(value) * BigInt(multiplier)) / divisorBigInt).toString();
}

function sumBuyTokenFees(lines: FeeLine[]): string {
  return lines
    .reduce((sum, line) => (/^\d+$/.test(line.buyTokenAmount ?? "") ? sum + BigInt(line.buyTokenAmount!) : sum), 0n)
    .toString();
}

function isSameToken(a: DisplayToken, b: DisplayToken): boolean {
  if (isNativeTokenAddress(a.address) && isNativeTokenAddress(b.address)) return true;
  return normalizeTokenKey(a.address) === normalizeTokenKey(b.address);
}

function pushFeeLine(
  lines: FeeLine[],
  label: string,
  fee: unknown,
  tokenForAddress: (address: string) => DisplayToken
) {
  if (!fee || typeof fee !== "object") return;
  const amount = stringValue((fee as any).amount);
  const tokenAddress = stringValue((fee as any).token);
  if (!amount || !tokenAddress) return;

  const token = tokenForAddress(tokenAddress);
  lines.push({
    label,
    amount,
    token,
    display: formatTokenAmount(amount, token)
  });
}

function formatConvertedFeeTotal(lines: FeeLine[], buyToken: DisplayToken): string {
  const buyTokenTotal = sumBuyTokenFees(lines);
  const unconvertedFees = lines.filter((line) => !line.buyTokenAmount);
  const convertedDisplay = formatTokenAmount(buyTokenTotal, buyToken);

  if (!unconvertedFees.length) return convertedDisplay;
  return `${convertedDisplay} + ${formatOriginalFeeTotal(unconvertedFees)}`;
}

function formatFeeDetail(fee: FeeLine): string {
  if (!fee.buyTokenDisplay) return fee.display;
  if (fee.buyTokenDisplay === fee.display) return fee.display;
  return `${fee.buyTokenDisplay} (${fee.display})`;
}

function formatOriginalFeeTotal(lines: FeeLine[]): string {
  if (!lines.length) return "0";

  const totals = new Map<string, { amount: bigint; token: DisplayToken }>();
  for (const line of lines) {
    if (!/^\d+$/.test(line.amount)) continue;
    const key = `${normalizeTokenKey(line.token.address)}:${line.token.symbol}:${line.token.decimals}`;
    const current = totals.get(key);
    const amount = BigInt(line.amount);
    totals.set(key, {
      amount: (current?.amount ?? 0n) + amount,
      token: line.token
    });
  }

  if (!totals.size) return lines.map((line) => line.display).join(" + ");
  return Array.from(totals.values())
    .map((total) => formatTokenAmount(total.amount.toString(), total.token))
    .join(" + ");
}

function nestedString(obj: unknown, path: string[]): string {
  let current: any = obj;
  for (const key of path) {
    current = current?.[key];
  }
  return typeof current === "string" ? current : "";
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
