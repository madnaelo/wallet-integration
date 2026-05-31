"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Address, LimitOrder as OneInchLimitOrder, MakerTraits, randBigInt } from "@1inch/limit-order-sdk";
import { useAppKit, useAppKitAccount, useAppKitProvider, useWalletInfo } from "@reown/appkit/react";
import { isAppKitConfigured } from "@/context/appkit";
import { CHAINS, getAllowedChains } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import type { BackendSession, LimitOrder as LimitOrderRecord, LimitOrderCapability } from "@/lib/backendClient";
import {
  BackendClientError,
  checkLimitOrderCapability,
  getFeatureFlags,
  listLimitOrders,
  requestAuthNonce,
  saveLimitOrder,
  verifyAuthSignature
} from "@/lib/backendClient";
import type { TokenInfo } from "@/lib/tokens";
import { listTokens } from "@/lib/tokenClient";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { TokenPicker, type TokenPickerOption } from "@/components/TokenPicker";
import {
  buildFallbackTokensByChain,
  buildTokenPickerNetworks,
  buildTokenPickerOptions,
  getEvmNetworkId
} from "@/lib/tokenPickerOptions";

const BACKEND_SESSION_STORAGE_KEY = "wallet.swapAssistant.backendSession.v1";
const SIGNING_ATTEMPT_TIMEOUT_MS = 90_000;
const WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS = 300_000;
const SIGNING_ATTEMPT_EXPIRY_SECONDS = 300;
const UINT_40_MAX = (1n << 40n) - 1n;

type ProviderKind = "injected" | "walletconnect" | null;

export default function LimitOrdersPage() {
  const chains = useMemo(() => getAllowedChains(), []);
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider, walletProviderType } = useAppKitProvider<Eip1193Provider>("eip155");
  const { walletInfo } = useWalletInfo("eip155");
  const backendSessionRequestRef = useRef<Promise<BackendSession> | null>(null);

  const providerKind: ProviderKind = walletProviderType === "WALLET_CONNECT" ? "walletconnect" : walletProvider ? "injected" : null;
  const walletName = getWalletDisplayName(walletInfo?.name, walletProviderType);
  const [chainId, setChainId] = useState<number>(chains[0]?.chainId ?? 1);
  const [tokensByChain, setTokensByChain] = useState<Record<number, TokenInfo[]>>(() =>
    buildFallbackTokensByChain(chains.map((chain) => chain.chainId))
  );
  const [tokensLoadingByChain, setTokensLoadingByChain] = useState<Record<number, boolean>>({});
  const [tokenListNotice, setTokenListNotice] = useState("");
  const [sellTokenAddress, setSellTokenAddress] = useState("");
  const [sellTokenNetworkId, setSellTokenNetworkId] = useState(getEvmNetworkId(chains[0]?.chainId ?? 1));
  const [buyTokenAddress, setBuyTokenAddress] = useState("");
  const [buyTokenNetworkId, setBuyTokenNetworkId] = useState(getEvmNetworkId(chains[0]?.chainId ?? 1));
  const [sellAmount, setSellAmount] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [capability, setCapability] = useState<LimitOrderCapability | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityError, setCapabilityError] = useState("");
  const [featureFlags, setFeatureFlags] = useState({ autoSwapEnabled: false, limitOrdersEnabled: true });
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [orders, setOrders] = useState<LimitOrderRecord[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");

  const tokenPickerTokens = useMemo(
    () => buildTokenPickerOptions(chains, tokensByChain),
    [chains, tokensByChain]
  );
  const tokenPickerNetworks = useMemo(
    () => buildTokenPickerNetworks(chains, tokenPickerTokens),
    [chains, tokenPickerTokens]
  );
  const tokensLoading = useMemo(
    () => chains.some((chain) => tokensLoadingByChain[chain.chainId]),
    [chains, tokensLoadingByChain]
  );
  const sellToken = useMemo(
    () => findTokenPickerSelection(tokenPickerTokens, sellTokenAddress, sellTokenNetworkId),
    [sellTokenAddress, sellTokenNetworkId, tokenPickerTokens]
  );
  const buyToken = useMemo(
    () => findTokenPickerSelection(tokenPickerTokens, buyTokenAddress, buyTokenNetworkId),
    [buyTokenAddress, buyTokenNetworkId, tokenPickerTokens]
  );
  const sameNetworkSelected = Boolean(sellToken && buyToken && sellToken.networkId === buyToken.networkId);
  const selectedChain = useMemo(() => chains.find((chain) => chain.chainId === chainId) ?? chains[0], [chainId, chains]);
  const sellAmountRaw = useMemo(() => {
    if (!sellToken || !sellAmount.trim()) return "";
    return parseUnitsSafe(sellAmount, sellToken.decimals) ?? "";
  }, [sellAmount, sellToken]);
  const minBuyAmountRaw = useMemo(() => {
    if (!sellToken || !buyToken || !sellAmount.trim() || !targetRate.trim()) return "";
    if (!parseUnitsSafe(sellAmount, sellToken.decimals)) return "";
    return computeTakingAmountRaw(sellAmount, targetRate, buyToken.decimals) ?? "";
  }, [buyToken, sellAmount, sellToken, targetRate]);

  useEffect(() => {
    const controllers: AbortController[] = [];
    setTokensByChain((current) => {
      const next = { ...current };
      for (const chain of chains) {
        next[chain.chainId] = next[chain.chainId] ?? [];
      }
      return next;
    });
    setTokensLoadingByChain(Object.fromEntries(chains.map((chain) => [chain.chainId, true])));
    setTokenListNotice("");

    for (const chain of chains) {
      const controller = new AbortController();
      controllers.push(controller);
      listTokens(chain.chainId, controller.signal)
        .then((items) => {
          if (!items.length) return;
          setTokensByChain((current) => ({
            ...current,
            [chain.chainId]: items
          }));
        })
        .catch((error: any) => {
          if (error?.name === "AbortError") return;
          setTokenListNotice("Showing popular tokens while the full list is unavailable.");
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setTokensLoadingByChain((current) => ({
            ...current,
            [chain.chainId]: false
          }));
        });
    }

    return () => controllers.forEach((controller) => controller.abort());
  }, [chains]);

  useEffect(() => {
    if (!tokenPickerTokens.length) return;
    setSellTokenAddress((current) => current || tokenPickerTokens[0]?.address || "");
    setSellTokenNetworkId((current) => current || tokenPickerTokens[0]?.networkId || getEvmNetworkId(chainId));
    setBuyTokenAddress((current) => {
      if (current) return current;
      const sell = tokenPickerTokens[0];
      return tokenPickerTokens.find((token) => token.networkId === sell?.networkId && !sameToken(token.address, sell.address))?.address
        ?? tokenPickerTokens[1]?.address
        ?? "";
    });
    setBuyTokenNetworkId((current) => current || tokenPickerTokens[0]?.networkId || getEvmNetworkId(chainId));
  }, [chainId, tokenPickerTokens]);

  useEffect(() => {
    if (address && !recipientAddress.trim()) setRecipientAddress(address);
  }, [address, recipientAddress]);

  useEffect(() => {
    if (!address) {
      setBackendSession(null);
      setOrders([]);
      setOrdersLoaded(false);
      return;
    }
    const stored = readStoredBackendSession();
    if (stored && isSessionForWallet(stored, address)) {
      setBackendSession(stored);
      return;
    }
    setBackendSession(null);
    setOrders([]);
    setOrdersLoaded(false);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags(envPublic.BACKEND_BASE_URL)
      .then((flags) => {
        if (!cancelled) setFeatureFlags(flags);
      })
      .catch(() => {
        if (!cancelled) setFeatureFlags({ autoSwapEnabled: false, limitOrdersEnabled: true });
      })
      .finally(() => {
        if (!cancelled) setFeatureFlagsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sellToken || !buyToken) {
      setCapability(null);
      return;
    }
    if (!sameNetworkSelected || typeof sellToken.quoteChainId !== "number") {
      setCapability(null);
      setCapabilityLoading(false);
      setCapabilityError("Choose both tokens on the same supported EVM network.");
      return;
    }
    let cancelled = false;
    setCapabilityLoading(true);
    setCapabilityError("");
    checkLimitOrderCapability(envPublic.BACKEND_BASE_URL, {
      chainId: sellToken.quoteChainId,
      sellTokenAddress: sellToken.address,
      sellTokenSymbol: sellToken.symbol,
      sellTokenDecimals: sellToken.decimals,
      buyTokenAddress: buyToken.address,
      buyTokenSymbol: buyToken.symbol,
      buyTokenDecimals: buyToken.decimals
    })
      .then((result) => {
        if (!cancelled) setCapability(result);
      })
      .catch((error) => {
        if (!cancelled) setCapabilityError(error?.message ?? "Limit order support could not be checked.");
      })
      .finally(() => {
        if (!cancelled) setCapabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyToken, sameNetworkSelected, sellToken]);

  const recipientValid = isAddress(recipientAddress);
  const canCreateLimitOrder = Boolean(
    walletProvider &&
    address &&
    capability?.automaticExecutionSupported &&
    termsAccepted &&
    sellToken &&
    buyToken &&
    sameNetworkSelected &&
    sellAmountRaw &&
    minBuyAmountRaw &&
    recipientValid
  );
  const estimatedReceive = buyToken && minBuyAmountRaw ? formatCompactNumber(formatUnitsSafe(minBuyAmountRaw, buyToken.decimals)) : "";
  const targetRateLabel = sellToken && buyToken
    ? `1 ${sellToken.symbol} = ${targetRate.trim() || "-"} ${buyToken.symbol}`
    : "Choose a pair";
  const capabilityTitle = capabilityLoading
    ? "Checking support..."
    : capability?.automaticExecutionSupported
      ? "Ready for signed execution"
      : "Alerts only for this pair";
  const capabilityBody = capabilityError || capability?.reason || "Choose a same-network contract-token pair to check limit-order support.";

  function selectTokenForSide(side: "sell" | "buy", token: TokenPickerOption) {
    const nextChainId = token.quoteChainId;
    if (typeof nextChainId === "number") setChainId(nextChainId);

    if (side === "sell") {
      setSellTokenAddress(token.address);
      setSellTokenNetworkId(token.networkId);
      if (!buyToken || buyToken.networkId !== token.networkId || sameToken(buyToken.address, token.address)) {
        const nextBuy = tokenPickerTokens.find((item) => item.networkId === token.networkId && !sameToken(item.address, token.address));
        setBuyTokenAddress(nextBuy?.address ?? "");
        setBuyTokenNetworkId(nextBuy?.networkId ?? token.networkId);
      }
      return;
    }

    setBuyTokenAddress(token.address);
    setBuyTokenNetworkId(token.networkId);
    if (!sellToken || sellToken.networkId !== token.networkId || sameToken(sellToken.address, token.address)) {
      const nextSell = tokenPickerTokens.find((item) => item.networkId === token.networkId && !sameToken(item.address, token.address));
      setSellTokenAddress(nextSell?.address ?? "");
      setSellTokenNetworkId(nextSell?.networkId ?? token.networkId);
    }
  }

  function swapSelectedTokens() {
    if (!sellToken || !buyToken) return;
    setSellTokenAddress(buyToken.address);
    setSellTokenNetworkId(buyToken.networkId);
    setBuyTokenAddress(sellToken.address);
    setBuyTokenNetworkId(sellToken.networkId);
    if (typeof buyToken.quoteChainId === "number") setChainId(buyToken.quoteChainId);
  }

  const appHeader = (
    <header className="header">
      <div className="headerTop">
        <div className="headerCopy">
          <h1 className="h1">Swap Assistant</h1>
          <div className="subtle">Your Personal Swap Assistant. Get the best price for your swaps.</div>
        </div>
        <div className="walletActions">
          <button
            className="btn btnPrimary"
            type="button"
            disabled={!isAppKitConfigured}
            onClick={() => void open({ view: isConnected && address ? "Account" : "Connect", namespace: "eip155" })}
          >
            {isConnected && address ? `${walletName} ${shortAddress(address)}` : "Connect Wallet"}
          </button>
        </div>
      </div>
      <nav className="appNav" aria-label="Main navigation">
        <ul className="appMenu">
          <li><Link className="appMenuLink" href="/">Intro</Link></li>
          <li><Link className="appMenuLink" href="/swap">Swap</Link></li>
          <li><Link className="appMenuLink" href="/swap#favorites">Favorites</Link></li>
          <li>
            <Link className="appMenuLink appMenuLinkActive" href="/limit-orders" aria-current="page">
              Limit Orders
            </Link>
          </li>
          {featureFlags.autoSwapEnabled ? <li><Link className="appMenuLink" href="/swap#auto-swap">Set Alerts</Link></li> : null}
          <li><Link className="appMenuLink" href="/swap#preferences">Preferences</Link></li>
        </ul>
      </nav>
    </header>
  );

  async function ensureBackendSession(): Promise<BackendSession> {
    if (!walletProvider || !address) throw new Error("Connect your wallet first.");
    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, address)) {
      setBackendSession(stored);
      return stored;
    }

    if (backendSessionRequestRef.current) return backendSessionRequestRef.current;

    const request = (async () => {
      const nonce = await requestAuthNonce(envPublic.BACKEND_BASE_URL, address);
      setOrderNotice(`Open ${walletName} and approve sign-in. This only proves the wallet is yours.`);
      const signature = await signMessage(walletProvider, address, nonce.message, providerKind);
      const session = await verifyAuthSignature(envPublic.BACKEND_BASE_URL, address, signature);
      writeStoredBackendSession(session);
      setBackendSession(session);
      return session;
    })();

    backendSessionRequestRef.current = request;
    try {
      return await request;
    } finally {
      backendSessionRequestRef.current = null;
    }
  }

  async function loadOrders() {
    setOrderError("");
    setOrderNotice("");
    try {
      const session = await ensureBackendSession();
      const nextOrders = await listLimitOrders(envPublic.BACKEND_BASE_URL, session);
      setOrders(nextOrders);
      setOrdersLoaded(true);
    } catch (error) {
      if (isExpiredBackendSessionError(error)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setOrderError(normalizeWalletError(error));
    }
  }

  async function createLimitOrder() {
    setOrderSaving(true);
    setOrderError("");
    setOrderNotice("");
    try {
      if (!walletProvider || !address) throw new Error("Connect your wallet before creating a limit order.");
      if (!sellToken || !buyToken || !sellAmountRaw || !minBuyAmountRaw) throw new Error("Complete the order details first.");
      if (!sameNetworkSelected || typeof sellToken.quoteChainId !== "number") throw new Error("Choose both tokens on the same supported network.");
      if (!recipientValid) throw new Error("Enter a valid recipient address.");
      if (!capability?.automaticExecutionSupported) throw new Error(capability?.reason || "This pair is not available for limit orders.");
      const executionChainId = sellToken.quoteChainId;
      await ensureCorrectNetwork(walletProvider, executionChainId);
      const session = await ensureBackendSession();

      const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000);
      const order = buildOneInchOrder({
        chainId: executionChainId,
        maker: address,
        recipient: recipientAddress,
        sellToken,
        buyToken,
        sellAmountRaw,
        minBuyAmountRaw,
        expiresAt
      });
      const typedData = order.getTypedData(executionChainId);
      setOrderNotice(`Open ${walletName} and sign the limit order terms. This signature is not a fund transfer.`);
      const signature = await signTypedData(walletProvider, address, typedData, providerKind);
      const orderHash = order.getOrderHash(executionChainId);
      const signedPayloadJson = JSON.stringify(
        {
          version: "1inch-limit-order-v4",
          provider: "1inch_orderbook",
          chainId: executionChainId,
          data: { ...order.build(), extension: order.extension.encode() },
          typedData,
          createdAt: new Date().toISOString()
        },
        jsonBigIntReplacer
      );

      setOrderNotice("Submitting your signed limit order...");
      const saved = await saveLimitOrder(envPublic.BACKEND_BASE_URL, session, {
        chainId: executionChainId,
        sellTokenAddress: sellToken.address,
        sellTokenSymbol: sellToken.symbol,
        sellTokenDecimals: sellToken.decimals,
        buyTokenAddress: buyToken.address,
        buyTokenSymbol: buyToken.symbol,
        buyTokenDecimals: buyToken.decimals,
        sellAmountRaw,
        minBuyAmountRaw,
        targetRate,
        expiresAt: expiresAt.toISOString(),
        recipientAddress: recipientAddress.trim(),
        executionProvider: "1inch_orderbook",
        orderHash,
        signature,
        signedPayloadJson,
        termsAccepted
      });
      setOrders((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setOrdersLoaded(true);
      setOrderNotice(limitOrderStatusMessage(saved));
    } catch (error) {
      if (isExpiredBackendSessionError(error)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setOrderError(normalizeWalletError(error));
    } finally {
      setOrderSaving(false);
    }
  }

  if (featureFlagsLoaded && !featureFlags.limitOrdersEnabled) {
    return (
      <main className="container limitOrderPage">
        {appHeader}
        <section className="panel limitOrderWarning">
          <h2>Temporarily Unavailable</h2>
          <p className="small">
            We will show Limit Orders here when the feature is enabled. Normal swaps and alerts are still available.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="container limitOrderPage">
      {appHeader}

      <section className="limitOrderHero" aria-labelledby="limit-order-title">
        <div>
          <p className="introEyebrow">Limit Orders</p>
          <h2 id="limit-order-title">Swap later at the price you choose.</h2>
          <p>
            Choose the same tokens as a normal swap, set your target rate, and sign exact order terms once. A supported
            protocol can execute only within the limits you approved.
          </p>
        </div>
        <div className="limitOrderHeroFacts" aria-label="Limit order safeguards">
          <span>Wallet approval required</span>
          <span>Exact signed terms</span>
          <span>No custody of funds</span>
        </div>
      </section>

      {tokenListNotice ? <div className="small limitOrderTokenNotice">{tokenListNotice}</div> : null}

      <div className="limitOrderShell">
        <section className="panel limitOrderFormPanel" aria-label="Limit order form">
          <div className="limitOrderFormHeader">
            <div>
              <h2>Create Limit Order</h2>
              <p>Same swap flow, with a target price and expiry.</p>
            </div>
            <span className="badge">{selectedChain?.name ?? "Network"}</span>
          </div>

          <div className="limitAmountBlock">
            <div className="label">Amount to sell</div>
            <input
              className="input limitAmountInput"
              inputMode="decimal"
              value={sellAmount}
              onChange={(event) => setSellAmount(event.target.value)}
              placeholder="0.01"
            />
          </div>

          <div className="tokenPairRow limitOrderTokenRow">
            <TokenPicker
              label="Sell token"
              value={sellTokenAddress}
              selectedNetworkId={sellTokenNetworkId}
              networks={tokenPickerNetworks}
              tokens={tokenPickerTokens}
              loading={tokensLoading}
              onChange={(token) => selectTokenForSide("sell", token)}
            />

            <button
              className="tokenFlipButton"
              type="button"
              title="Swap tokens"
              aria-label="Swap sell and buy tokens"
              onClick={swapSelectedTokens}
              disabled={!sellToken || !buyToken}
            >
              <span className="tokenFlipIcon tokenFlipIconHorizontal" aria-hidden="true">&#8644;</span>
              <span className="tokenFlipIcon tokenFlipIconVertical" aria-hidden="true">&#8645;</span>
            </button>

            <TokenPicker
              label="Buy token"
              value={buyTokenAddress}
              selectedNetworkId={buyTokenNetworkId}
              networks={tokenPickerNetworks}
              tokens={tokenPickerTokens}
              loading={tokensLoading}
              onChange={(token) => selectTokenForSide("buy", token)}
            />
          </div>

          <div className="limitTargetGrid">
            <label className="field">
              <span className="label">Target rate</span>
              <input
                className="input"
                inputMode="decimal"
                value={targetRate}
                onChange={(event) => setTargetRate(event.target.value)}
                placeholder="Target price"
              />
              <span className="small">{targetRateLabel}</span>
            </label>

            <label className="field">
              <span className="label">Expires in</span>
              <select className="input" value={expiryHours} onChange={(event) => setExpiryHours(event.target.value)}>
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="24">1 day</option>
                <option value="168">7 days</option>
              </select>
            </label>
          </div>

          <TargetRatePicker
            buySymbol={buyToken?.symbol ?? "buy token"}
            sellSymbol={sellToken?.symbol ?? "sell token"}
            value={targetRate}
            onChange={setTargetRate}
          />

          <label className="field">
            <span className="label">Recipient address</span>
            <input
              className="input"
              value={recipientAddress}
              onChange={(event) => setRecipientAddress(event.target.value)}
              placeholder={address || "0x..."}
            />
          </label>

          <label className="limitOrderTerms">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>
              I understand execution is not guaranteed. Prices, liquidity, allowance, wallet balance, gas cost, and expiry
              can stop execution. Swap Assistant may submit only the exact signed order terms shown here.
            </span>
          </label>

          {orderNotice ? <div className="ok limitOrderMessage">{orderNotice}</div> : null}
          {orderError ? <div className="error limitOrderMessage">{orderError}</div> : null}
        </section>

        <aside className="panel limitOrderSummaryPanel" aria-label="Limit order summary">
          <div className={`limitOrderCapability ${capability?.automaticExecutionSupported ? "limitOrderCapabilityReady" : ""}`}>
            <strong>{capabilityTitle}</strong>
            <p>{capabilityBody}</p>
            {capability && capability.executionProvider !== "none" ? <span className="badge">{capability.executionProvider}</span> : null}
          </div>

          <div className="limitOrderSummaryList">
            <SummaryRow label="You sell" value={sellAmount && sellToken ? `${sellAmount} ${sellToken.symbol}` : "-"} />
            <SummaryRow label="Target" value={targetRateLabel} />
            <SummaryRow label="Receive at target" value={estimatedReceive && buyToken ? `${estimatedReceive} ${buyToken.symbol}` : "-"} />
            <SummaryRow label="Network" value={selectedChain?.name ?? "-"} />
            <SummaryRow label="Expiry" value={formatExpiryLabel(expiryHours)} />
          </div>

          <div className="limitOrderActionStack">
            <button className="btn btnPrimary" type="button" disabled={!canCreateLimitOrder || orderSaving} onClick={() => void createLimitOrder()}>
              {orderSaving ? "Creating..." : "Create Limit Order"}
            </button>
            <button className="btn" type="button" disabled={!address || orderSaving} onClick={() => void loadOrders()}>
              {ordersLoaded ? "Refresh Orders" : "Load Orders"}
            </button>
            <p className="small">
              {canCreateLimitOrder
                ? "Your wallet will show the exact order terms before you sign."
                : "Connect your wallet, complete the fields, choose a supported pair, and accept the terms."}
            </p>
          </div>
        </aside>
      </div>

      <section className="panel limitOrderWarning" aria-labelledby="limit-risk-title">
        <h2 id="limit-risk-title">Read Before Creating A Limit Order</h2>
        <ul>
          <li>Limit orders are not guaranteed to execute, even when your target price appears to be reached.</li>
          <li>Orders can fail because of liquidity, gas costs, allowance, wallet balance, expiry, or provider downtime.</li>
          <li>Automatic execution is enabled only when a supported protocol can verify the signed order terms.</li>
          <li>Native BTC, native assets, and unsupported routes stay blocked until a safe signed-order adapter exists.</li>
        </ul>
      </section>

      <section className="panel limitOrderAudit">
        <h2>Security Model</h2>
        <p>
          Swap Assistant stores the signed order payload and a hash of the signed terms. If any order parameter is changed,
          the protocol signature no longer matches and the order must not execute.
        </p>
        <p className="small">
          Current safe adapter: 1inch Orderbook / Limit Order Protocol for EVM contract-token pairs that support EIP-712
          signing. Unsupported pairs stay as alerts until a matching signed-intent adapter exists.
        </p>
      </section>

      <section className="panel limitOrderAudit">
        <div className="limitOrderSectionHeader">
          <h2>Your Limit Orders</h2>
          <button className="btn" type="button" disabled={!address || orderSaving} onClick={() => void loadOrders()}>
            {ordersLoaded ? "Refresh" : "Load"}
          </button>
        </div>
        {!ordersLoaded ? (
          <p className="small">Load your signed orders after connecting and signing in.</p>
        ) : orders.length ? (
          <div className="limitOrderList">
            {orders.map((order) => (
              <div className="limitOrderItem" key={order.id}>
                <div>
                  <strong>{order.sellTokenSymbol} to {order.buyTokenSymbol}</strong>
                  <span className="small">{formatOrderTarget(order)} - expires {formatDate(order.expiresAt)}</span>
                </div>
                <span className="badge">{formatOrderStatus(order.executionStatus)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="small">No signed limit orders yet.</p>
        )}
      </section>
    </main>
  );
}

function TargetRatePicker({
  buySymbol,
  sellSymbol,
  value,
  onChange
}: {
  buySymbol: string;
  sellSymbol: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const base = parsePositiveNumber(value) ?? 1;
  const points = [-0.08, -0.045, -0.02, 0, 0.025, 0.055, 0.09].map((offset, index) => {
    const rate = base * (1 + offset);
    return {
      id: `${offset}:${index}`,
      label: `${offset >= 0 ? "+" : ""}${Math.round(offset * 100)}%`,
      rate: formatRateInput(rate),
      height: 34 + index * 6 + (offset > 0 ? 18 : 0)
    };
  });

  return (
    <div className="limitRateChart" aria-label="Target rate picker">
      <div className="limitRateChartHeader">
        <div>
          <strong>Target rate picker</strong>
          <span>Tap a point to fill your desired execution rate.</span>
        </div>
        <span className="badge">1 {sellSymbol} / {buySymbol}</span>
      </div>
      <div className="limitRateChartPlot">
        {points.map((point) => (
          <button
            className={`limitRatePoint${point.rate === value.trim() ? " limitRatePointActive" : ""}`}
            type="button"
            key={point.id}
            style={{ "--point-height": `${point.height}px` } as CSSProperties}
            onClick={() => onChange(point.rate)}
            title={`${point.rate} ${buySymbol}`}
          >
            <span className="limitRateStem" aria-hidden="true" />
            <span className="limitRateDot" aria-hidden="true" />
            <span className="limitRateLabel">{point.label}</span>
          </button>
        ))}
      </div>
      <p className="small">This is a target selector, not historical market data.</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="limitOrderSummaryRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function findTokenPickerSelection(tokens: TokenPickerOption[], address: string, networkId: string): TokenPickerOption | null {
  return tokens.find((token) => token.networkId === networkId && sameToken(token.address, address)) ?? null;
}

function formatExpiryLabel(expiryHours: string): string {
  switch (expiryHours) {
    case "1":
      return "1 hour";
    case "6":
      return "6 hours";
    case "24":
      return "1 day";
    case "168":
      return "7 days";
    default:
      return `${expiryHours} hours`;
  }
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRateInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(value >= 100 ? 4 : 8).replace(/\.?0+$/, "");
}

function formatCompactNumber(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (numeric === 0) return "0";
  if (numeric >= 1) return numeric.toLocaleString(undefined, { maximumFractionDigits: 8 });
  return numeric.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function buildOneInchOrder(params: {
  chainId: number;
  maker: string;
  recipient: string;
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  expiresAt: Date;
}): OneInchLimitOrder {
  const expiration = BigInt(Math.floor(params.expiresAt.getTime() / 1000));
  const makerTraits = MakerTraits.default()
    .withExpiration(expiration)
    .withNonce(randBigInt(UINT_40_MAX));
  const orderInfo: ConstructorParameters<typeof OneInchLimitOrder>[0] = {
    makerAsset: new Address(params.sellToken.address),
    takerAsset: new Address(params.buyToken.address),
    makingAmount: BigInt(params.sellAmountRaw),
    takingAmount: BigInt(params.minBuyAmountRaw),
    maker: new Address(params.maker)
  };
  if (!sameToken(params.recipient, params.maker)) {
    orderInfo.receiver = new Address(params.recipient);
  }
  return new OneInchLimitOrder(orderInfo, makerTraits);
}

async function ensureCorrectNetwork(provider: Eip1193Provider, chainId: number) {
  const currentHex = (await provider.request({ method: "eth_chainId" })) as string;
  const current = Number.parseInt(currentHex, 16);
  if (current === chainId) return;

  const desiredHex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: desiredHex }]
    });
  } catch (error: any) {
    if (error?.code !== 4902) throw error;
    const chain = CHAINS[chainId];
    if (!chain?.rpcUrls?.length || !chain.nativeCurrency) throw new Error("This network is not available in your wallet.");
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: desiredHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls
        }
      ]
    });
  }
}

async function signTypedData(
  provider: Eip1193Provider,
  walletAddress: string,
  typedData: unknown,
  providerKind: ProviderKind
): Promise<string> {
  const request = providerKind === "walletconnect"
    ? provider.request(
        { method: "eth_signTypedData_v4", params: [walletAddress, JSON.stringify(typedData, jsonBigIntReplacer)] },
        undefined,
        SIGNING_ATTEMPT_EXPIRY_SECONDS
      )
    : provider.request({ method: "eth_signTypedData_v4", params: [walletAddress, JSON.stringify(typedData, jsonBigIntReplacer)] });
  const signature = await requestWithTimeout(
    request,
    providerKind === "walletconnect" ? WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS : SIGNING_ATTEMPT_TIMEOUT_MS,
    "Your wallet did not return a limit order signature."
  );
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Wallet did not return a valid limit order signature.");
  }
  return signature;
}

async function signMessage(
  provider: Eip1193Provider,
  walletAddress: string,
  message: string,
  providerKind: ProviderKind
): Promise<string> {
  const hexMessage = utf8ToHex(message);
  const attempts = providerKind === "walletconnect"
    ? [[message, walletAddress], [hexMessage, walletAddress]]
    : [[hexMessage, walletAddress], [message, walletAddress]];
  let lastError: unknown = null;
  for (const params of attempts) {
    try {
      const request = providerKind === "walletconnect"
        ? provider.request({ method: "personal_sign", params }, undefined, SIGNING_ATTEMPT_EXPIRY_SECONDS)
        : provider.request({ method: "personal_sign", params });
      const signature = await requestWithTimeout(
        request,
        providerKind === "walletconnect" ? WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS : SIGNING_ATTEMPT_TIMEOUT_MS,
        "Your wallet did not return a sign-in signature."
      );
      if (typeof signature !== "string" || !signature.startsWith("0x")) {
        throw new Error("Wallet did not return a valid sign-in signature.");
      }
      return signature;
    } catch (error) {
      if (isUserRejectedWalletRequest(error)) throw error;
      lastError = error;
    }
  }
  throw new Error(normalizeWalletError(lastError));
}

function readStoredBackendSession(): BackendSession | null {
  try {
    window.localStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
    const raw = window.sessionStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackendSession;
    if (!parsed.walletAddress || !parsed.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now() + 60_000) {
      clearStoredBackendSession();
      return null;
    }
    return parsed;
  } catch {
    clearStoredBackendSession();
    return null;
  }
}

function writeStoredBackendSession(session: BackendSession) {
  try {
    window.localStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
    window.sessionStorage.setItem(BACKEND_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // React state still carries the session while this page is open.
  }
}

function clearStoredBackendSession() {
  try {
    window.localStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
  } catch {
    // Storage access can fail in strict browser privacy modes.
  }
}

function isSessionForWallet(session: BackendSession, walletAddress: string): boolean {
  return session.walletAddress.toLowerCase() === walletAddress.toLowerCase();
}

function isExpiredBackendSessionError(error: unknown): boolean {
  return error instanceof BackendClientError && error.status === 401;
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

function computeTakingAmountRaw(sellAmountHuman: string, targetRateHuman: string, buyDecimals: number): string | null {
  const sell = parseDecimalParts(sellAmountHuman);
  const rate = parseDecimalParts(targetRateHuman);
  if (!sell || !rate || !Number.isInteger(buyDecimals) || buyDecimals < 0 || buyDecimals > 30) return null;
  const numerator = sell.value * rate.value * 10n ** BigInt(buyDecimals);
  const denominator = 10n ** BigInt(sell.scale + rate.scale);
  const result = numerator / denominator;
  return result > 0n ? result.toString() : null;
}

function parseDecimalParts(value: string): { value: bigint; scale: number } | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, fractional = ""] = trimmed.split(".");
  const joined = `${whole}${fractional}`.replace(/^0+(?=\d)/, "");
  const parsed = BigInt(joined || "0");
  return parsed > 0n ? { value: parsed, scale: fractional.length } : null;
}

function jsonBigIntReplacer(_: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function limitOrderStatusMessage(order: LimitOrderRecord): string {
  if (order.executionStatus === "submitted") {
    return "Your signed limit order was submitted. Execution depends on liquidity, allowance, balance, gas, and expiry.";
  }
  if (order.executionStatus === "failed") {
    return order.executionError || "The signed order could not be submitted. Review the details and try again.";
  }
  return "Your signed order was saved, but provider submission is not enabled right now.";
}

function formatOrderTarget(order: LimitOrderRecord): string {
  return `target ${order.targetRate} ${order.buyTokenSymbol} per ${order.sellTokenSymbol}`;
}

function formatOrderStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sameToken(first?: string, second?: string): boolean {
  return Boolean(first && second && first.trim().toLowerCase() === second.trim().toLowerCase());
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getWalletDisplayName(walletName?: string, providerType?: string): string {
  const trimmed = walletName?.trim();
  if (trimmed) return trimmed;
  if (providerType === "WALLET_CONNECT") return "WalletConnect";
  return "Wallet";
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/reject|denied|cancel/i.test(message)) return "Request cancelled in wallet.";
  return message || "The request could not be completed. Please try again.";
}

function isUserRejectedWalletRequest(error: unknown): boolean {
  const item = error as { code?: number; message?: string } | null;
  const message = String(item?.message ?? error ?? "");
  return item?.code === 4001 || /reject|denied|cancel/i.test(message);
}
