"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import type { QuoteResponse } from "@/lib/types";
import { CHAINS, getAllowedChains, getChainById } from "@/lib/chains";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { ERC20_ABI } from "@/lib/erc20";
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import { isAppKitConfigured } from "@/context/appkit";
import { envPublic } from "@/lib/envPublic";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { swapLog } from "@/lib/swapLog";
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
type RouteLine = {
  source: string;
  share: string;
};

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const { open: openAppKit } = useAppKit();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider: appKitProvider, walletProviderType } = useAppKitProvider<Eip1193Provider>("eip155");
  const { disconnect: disconnectAppKit } = useDisconnect();
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
  const [rateInverted, setRateInverted] = useState<boolean>(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");

  const [approvalTxHash, setApprovalTxHash] = useState<string>("");
  const [swapTxHash, setSwapTxHash] = useState<string>("");
  const [swapStatus, setSwapStatus] = useState<TxStatus>("idle");
  const [actionError, setActionError] = useState<string>("");
  const [connectPromptVisible, setConnectPromptVisible] = useState<boolean>(false);
  const [quoteValidationVisible, setQuoteValidationVisible] = useState<boolean>(false);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [dbSwapHistory, setDbSwapHistory] = useState<SwapHistoryRecord[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState<boolean>(false);
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string>("");
  const [historyNotice, setHistoryNotice] = useState<string>("");
  const historyRequestInFlightRef = useRef<boolean>(false);

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

  useEffect(() => {
    if (appKitConnected && appKitAddress && appKitProvider) {
      setProvider(appKitProvider);
      setWalletAddress(appKitAddress);
      setWalletKind(walletProviderType === "WALLET_CONNECT" ? "walletconnect" : "injected");
      setConnectPromptVisible(false);
      return;
    }

    if (!appKitConnected) {
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
      setWalletKind(null);
    }
  }, [appKitAddress, appKitConnected, appKitProvider, walletProviderType]);

  // Attach listeners to the connected wallet provider.
  useEffect(() => {
    const p = provider;
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
      setHistoryExpanded(false);
      setHistoryLoaded(false);
      setHistoryError("");
      setHistoryNotice("");
      setHistoryLoading(false);
      return;
    }

    const stored = readStoredBackendSession();
    if (!stored || !isSessionForWallet(stored, walletAddress)) {
      setBackendSession(null);
      setDbSwapHistory([]);
      setHistoryLoaded(false);
      setHistoryError("");
      setHistoryNotice("");
      setHistoryLoading(false);
      return;
    }

    setBackendSession(stored);
    setDbSwapHistory([]);
    setHistoryLoaded(false);
    setHistoryError("");
    setHistoryNotice("");
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
  const availableQuotes = useMemo(() => quote?.availableQuotes ?? (quote ? [quote] : []), [quote]);

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
    setSelectedQuoteId("");
    setQuoteFetchedAtMs(null);
    setQuoteError("");
    setApprovalTxHash("");
    setSwapTxHash("");
    setSwapStatus("idle");
  }

  async function openWalletChooser() {
    setActionError("");
    if (!isAppKitConfigured) {
      setActionError("Wallet connection is unavailable right now. Please try again later.");
      return;
    }
    await openAppKit({ view: "Connect" });
  }

  async function onDisconnectWallet() {
    setActionError("");
    setHistoryError("");
    setHistoryNotice("");
    try {
      await disconnectAppKit({ namespace: "eip155" });
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
    const p = provider;
    if (!p) throw new Error("Connect your wallet first.");
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
      walletKind,
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
    if (historyRequestInFlightRef.current) return;
    historyRequestInFlightRef.current = true;
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
      historyRequestInFlightRef.current = false;
    }
  }

  async function loadBackendHistory(session: BackendSession) {
    const history = await listSwapHistory(envPublic.BACKEND_BASE_URL, session, 25);
    setDbSwapHistory(history);
    setHistoryLoaded(true);
  }

  function onHistoryToggle(event: { currentTarget: HTMLDetailsElement }) {
    const expanded = event.currentTarget.open;
    setHistoryExpanded(expanded);

    if (!expanded || !walletAddress || historyLoaded || historyRequestInFlightRef.current) return;

    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      void refreshBackendHistory();
    }
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
      aggregator: stringValue(quote.providerId) || "swap-provider",
      quote: quoteForHistory(quote)
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
      const fetchedQuote = body as QuoteResponse;
      setQuote(fetchedQuote);
      setSelectedQuoteId(fetchedQuote.quoteId ?? "");
      setQuoteFetchedAtMs(Date.now());
    } catch (e: any) {
      setQuoteError(normalizeWalletError(e));
    } finally {
      setQuoteLoading(false);
    }
  }

  function onSelectedQuoteChange(quoteId: string) {
    const next = availableQuotes.find((item) => item.quoteId === quoteId);
    if (!next || !quote) return;

    setSelectedQuoteId(quoteId);
    setQuote({
      ...next,
      availableQuotes,
      quoteErrors: quote.quoteErrors
    });
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
    const grossBuyAmount = stringValue(quote.grossBuyAmount) || quote.buyAmount;
    const minBuyAmount = stringValue(quote.minBuyAmount);
    const routeLines = collectRouteLines(quote, tokenForAddress);
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
    const swapFeeLines = collectFeeLines(quote, tokenForAddress).map((fee) =>
      withBuyTokenEquivalent(fee, sellDisplayToken, buyDisplayToken, quote.sellAmount, grossBuyAmount)
    );
    const buyTokenFeesDeducted = sumFeesChargedInToken(swapFeeLines, buyDisplayToken);
    const netBuyAmount = stringValue(quote.netBuyAmount) || subtractIntegerStrings(grossBuyAmount, buyTokenFeesDeducted);
    const netMinBuyAmount = minBuyAmount ? subtractIntegerStrings(minBuyAmount, buyTokenFeesDeducted) : "";
    const networkCost = networkFeeLine?.display ?? "Not provided";
    const platformFeeBps = numberValue(quote.platformFeeBps);
    const platformFeeLabel = platformFeeBps > 0 ? formatFeeBps(platformFeeBps) : "";
    const swapFeeTotal = swapFeeLines.length ? formatConvertedFeeTotal(swapFeeLines, buyDisplayToken) : platformFeeLabel || "None";

    return {
      providerName: stringValue(quote.providerName) || "Best route",
      sellHuman,
      grossBuyHuman: formatTokenAmount(grossBuyAmount, buyDisplayToken),
      buyHuman: formatTokenAmount(netBuyAmount, buyDisplayToken),
      minBuyHuman: netMinBuyAmount ? formatTokenAmount(netMinBuyAmount, buyDisplayToken) : "",
      rate: formatPairRate(quote.sellAmount, sellDisplayToken, grossBuyAmount, buyDisplayToken, rateInverted),
      networkCost,
      routeLines,
      routeSummary: formatRouteSummary(routeLines, stringValue(quote.providerName)),
      swapFeeLines,
      swapFeeTotal,
      platformFeeLabel
    };
  }, [quote, sellTokenInfo, buyTokenInfo, chain, tokens, rateInverted]);

  const connectHint = useMemo(() => {
    if (walletAddress) return "";
    return "Choose a browser wallet or connect from your phone.";
  }, [walletAddress]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">The Wallet</h1>
          <div className="subtle">Your Personal Swap Aggregator. Get the best price for your swaps.</div>
        </div>
        <div className="walletActions">
          <span className="badge">
            Network: <span className="mono">{chain?.name ?? `Chain ${selectedChainId}`}</span>
          </span>
          <button className="btn btnPrimary" onClick={openWalletChooser} disabled={!!walletAddress}>
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
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="small" style={{ marginTop: 6 }}>
                Wallet network: <span className="mono">{formatWalletNetwork(walletChainId)}</span>
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
              {isDryRun ? "Preview Swap" : "Swap"}
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
            <div className="small">Enter swap details to see your quote.</div>
          ) : (
            <>
              <div className="kv">
                <div className="subtle">You pay</div>
                <div className="mono">{quoteSummary?.sellHuman ?? ""}</div>
              </div>
              <div className="kv receiveRow">
                <div className="subtle">You receive</div>
                <div className="mono">{quoteSummary?.buyHuman ?? ""}</div>
              </div>
              <div className="kv">
                <div className="subtle">Rate</div>
                <button className="rateButton mono" type="button" onClick={() => setRateInverted((value) => !value)}>
                  {quoteSummary?.rate ?? ""}
                </button>
              </div>
              <div className="kv">
                <div className="subtle">Route</div>
                <div className="routeChoice">
                  {availableQuotes.length > 1 && buyTokenInfo ? (
                    <select
                      className="select routeSelect"
                      value={selectedQuoteId || quote.quoteId || ""}
                      onChange={(e) => onSelectedQuoteChange(e.target.value)}
                    >
                      {availableQuotes.map((item) => (
                        <option key={item.quoteId ?? item.providerId} value={item.quoteId ?? ""}>
                          {formatQuoteOption(item, tokenInfoToDisplay(buyTokenInfo))}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="mono">{quoteSummary?.providerName ?? ""}</span>
                  )}
                </div>
              </div>
              <div className="kv">
                <div className="subtle">Service fee</div>
                <div className="mono">{quoteSummary?.swapFeeTotal ?? ""}</div>
              </div>
              {quoteSummary ? (
                <details className="feeDetails routeDetails">
                  <summary>
                    <span className="subtle">Details</span>
                    <span className="mono">Minimum, fees, network</span>
                  </summary>
                  {quoteSummary.swapFeeLines.map((fee, index) => (
                    <div className="kv" key={`${fee.label}-${fee.token.address}-${index}`}>
                      <div className="subtle">{fee.label}</div>
                      <div className="mono feeAmount">{renderFeeDetail(fee)}</div>
                    </div>
                  ))}
                  {!quoteSummary.swapFeeLines.length && quoteSummary.platformFeeLabel ? (
                    <div className="kv">
                      <div className="subtle">Service fee</div>
                      <div className="mono">{quoteSummary.platformFeeLabel}</div>
                    </div>
                  ) : null}
                  <div className="kv">
                    <div className="subtle">Before fees</div>
                    <div className="mono">{quoteSummary.grossBuyHuman}</div>
                  </div>
                  <div className="kv">
                    <div className="subtle">Minimum received</div>
                    <div className="mono">{quoteSummary.minBuyHuman || "Not provided"}</div>
                  </div>
                  <div className="kv">
                    <div className="subtle">Network cost</div>
                    <div className="mono">{quoteSummary.networkCost}</div>
                  </div>
                </details>
              ) : null}
              <div className="small" style={{ marginTop: 10 }}>
                Network fee is paid separately in the chain native token and confirmed in your wallet.
              </div>
            </>
          )}
        </div>
      </div>

      <details className="panel historyPanel" open={historyExpanded} onToggle={onHistoryToggle}>
        <summary className="historySummary">
          <span className="historyChevron" aria-hidden="true" />
          <span className="historyTitleBlock">
            <span className="label">Swap History</span>
            <span className="subtle">
              {backendSession ? `Connected as ${shortAddr(backendSession.walletAddress)}` : "Connect your wallet to see saved swaps."}
            </span>
          </span>
          <span className="historyActions">
            <span className="badge">
              {historyLoading
                ? "Loading history"
                : historyExpanded
                  ? historyLoaded
                    ? `${dbSwapHistory.length} saved`
                    : "Ready to load history"
                  : "Expand to see history"}
            </span>
          </span>
        </summary>
        <div className="historyContent">
          <div className="quoteHeader">
            <div className="subtle">
              {walletAddress
                ? backendSession
                  ? ""
                  : "Sign once to view your saved swaps."
                : "Connect your wallet to view your saved swaps."}
            </div>
            <button className="btn" onClick={refreshBackendHistory} disabled={!walletAddress || historyLoading}>
              {historyLoading
                ? backendSession
                  ? "Syncing..."
                  : "Open Wallet To Sign"
                : backendSession
                  ? historyLoaded
                    ? "Refresh History"
                    : "Load History"
                  : "Sign In To Sync"}
            </button>
          </div>
          {historyNotice ? <div className="small" style={{ marginTop: 8 }}>{historyNotice}</div> : null}
          {historyError ? <div className="error" style={{ marginTop: 8 }}>{historyError}</div> : null}
          {!historyLoaded && dbSwapHistory.length === 0 ? (
            <div className="small">History has not been loaded yet.</div>
          ) : dbSwapHistory.length === 0 ? (
            <div className="small">No saved swaps yet.</div>
          ) : (
            <div className="historyTableWrap">
              <table className="historyTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Swap</th>
                    <th>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {dbSwapHistory.slice(0, 5).map((swap) => (
                    <tr key={swap.id}>
                      <td>{formatHistoryDate(swap.createdAt)}</td>
                      <td>{formatHistoryStatus(swap.status)}</td>
                      <td>
                        {swap.sellTokenSymbol} to {swap.buyTokenSymbol}
                      </td>
                      <td className="mono">{formatHistoryTx(swap.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatWalletNetwork(chainId: number | null): string {
  if (!chainId) return "Not connected";
  return getChainById(chainId)?.name ?? "Unsupported network";
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatHistoryStatus(status: SwapHistoryRecord["status"]): string {
  switch (status) {
    case "dry_run":
      return "Preview";
    case "submitted":
      return "Submitted";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatHistoryTx(txHash: string | undefined): string {
  if (!txHash || txHash === "dry-run") return "-";
  return shortAddr(txHash);
}

function quoteForHistory(quote: QuoteResponse): QuoteResponse {
  const { availableQuotes: _availableQuotes, quoteErrors: _quoteErrors, ...rest } = quote;
  return rest;
}

function formatQuoteOption(quote: QuoteResponse, buyToken: DisplayToken): string {
  const providerName = stringValue(quote.providerName) || "Route";
  const rankLabel = quote.isBest ? "Best - " : "";
  const amount = stringValue(quote.netBuyAmount) || stringValue(quote.buyAmount);
  const formattedAmount = amount ? formatTokenAmount(amount, buyToken) : "Quote";
  return `${rankLabel}${providerName} - ${formattedAmount}`;
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

function walletSessionSupportsMethod(provider: Eip1193Provider | null, method: string): boolean | null {
  const p: any = provider;
  const methods = p?.session?.namespaces?.eip155?.methods;
  if (!Array.isArray(methods)) return null;
  return methods.includes(method);
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

function formatPairRate(
  sellAmount: string,
  sellToken: DisplayToken,
  buyAmount: string,
  buyToken: DisplayToken,
  inverted: boolean
): string {
  const sell = Number(formatUnitsSafe(sellAmount, sellToken.decimals));
  const buy = Number(formatUnitsSafe(buyAmount, buyToken.decimals));
  if (!Number.isFinite(sell) || !Number.isFinite(buy) || sell <= 0 || buy <= 0) return "";

  if (inverted) {
    return `1 ${buyToken.symbol} = ${formatDecimal(String(sell / buy), 8)} ${sellToken.symbol}`;
  }
  return `1 ${sellToken.symbol} = ${formatDecimal(String(buy / sell), 8)} ${buyToken.symbol}`;
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

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function collectRouteLines(quote: QuoteResponse, tokenForAddress: (address: string) => DisplayToken): RouteLine[] {
  if (Array.isArray(quote.routeLines) && quote.routeLines.length) {
    return quote.routeLines.map((line: any) => ({
      source: stringValue(line?.source) || "Liquidity source",
      share: stringValue(line?.share) || "Best route"
    }));
  }

  const fills = (quote as any)?.route?.fills;
  if (!Array.isArray(fills)) return [];

  return fills
    .map((fill: any) => {
      const source =
        stringValue(fill?.source) ||
        stringValue(fill?.sourceName) ||
        stringValue(fill?.name) ||
        "Liquidity source";
      const share = formatRouteShare(fill?.proportionBps ?? fill?.proportion ?? fill?.shareBps ?? fill?.percentage);
      const from = stringValue(fill?.from);
      const to = stringValue(fill?.to);
      const pair =
        from && to
          ? `${tokenForAddress(from).symbol} -> ${tokenForAddress(to).symbol}`
          : stringValue(fill?.input) && stringValue(fill?.output)
            ? `${tokenForAddress(stringValue(fill.input)).symbol} -> ${tokenForAddress(stringValue(fill.output)).symbol}`
            : "";

      return {
        source: pair ? `${source} (${pair})` : source,
        share
      };
    })
    .filter((line) => line.source.trim().length > 0);
}

function formatRouteShare(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 100 ? `${formatDecimal(String(value / 100), 2)}%` : `${formatDecimal(String(value), 2)}%`;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 100 ? `${formatDecimal(String(numeric / 100), 2)}%` : `${formatDecimal(String(numeric), 2)}%`;
    }
  }
  return "Best route";
}

function formatRouteSummary(lines: RouteLine[], providerName?: string): string {
  const fallback = providerName ? `${providerName} route` : "Best route";
  if (!lines.length) return fallback;
  if (lines.length === 1) return lines[0]!.source;
  return `${lines[0]!.source} + ${lines.length - 1} more`;
}

function collectFeeLines(quote: QuoteResponse, tokenForAddress: (address: string) => DisplayToken): FeeLine[] {
  if (Array.isArray(quote.serviceFees) && quote.serviceFees.length) {
    return quote.serviceFees
      .map((fee: any) => {
        const amount = stringValue(fee?.amount);
        const tokenAddress = stringValue(fee?.token);
        if (!amount || !tokenAddress) return null;
        const token = tokenForAddress(tokenAddress);
        return {
          label: stringValue(fee?.label) || "Service fee",
          amount,
          token,
          display: formatTokenAmount(amount, token)
        };
      })
      .filter((fee): fee is FeeLine => !!fee);
  }

  const fees: any = quote.fees;
  if (!fees || typeof fees !== "object") return [];

  const lines: FeeLine[] = [];
  pushFeeLine(lines, "Service fee", fees.zeroExFee, tokenForAddress);
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

function sumFeesChargedInToken(lines: FeeLine[], token: DisplayToken): string {
  return lines
    .reduce((sum, line) => (isSameToken(line.token, token) && /^\d+$/.test(line.amount) ? sum + BigInt(line.amount) : sum), 0n)
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

function renderFeeDetail(fee: FeeLine) {
  if (!fee.buyTokenDisplay || fee.buyTokenDisplay === fee.display) return fee.display;
  return (
    <>
      <span>{fee.display}</span>
      <span className="feeEquivalent">{fee.buyTokenDisplay}</span>
    </>
  );
}

function formatFeeBps(feeBps: number): string {
  return `${formatDecimal(String(feeBps / 100), 4)}%`;
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
    return "Mobile wallet connection is unavailable right now. Try a browser wallet.";
  }

  if (/insufficient funds/i.test(msg)) return "Insufficient funds for gas or swap amount.";
  if (/insufficient liquidity/i.test(msg)) return "Insufficient liquidity for this trade.";
  if (/slippage/i.test(msg)) return "Swap failed due to slippage. Try again with a smaller amount.";

  return msg;
}
