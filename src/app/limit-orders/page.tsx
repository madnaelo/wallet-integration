"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { DEFAULT_TOKENS_BY_CHAIN, isNativeBitcoinToken, type TokenInfo } from "@/lib/tokens";
import { listTokens } from "@/lib/tokenClient";
import { parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";

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
  const [tokens, setTokens] = useState<TokenInfo[]>(() => DEFAULT_TOKENS_BY_CHAIN[chains[0]?.chainId ?? 1] ?? []);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [sellTokenAddress, setSellTokenAddress] = useState("");
  const [buyTokenAddress, setBuyTokenAddress] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [capability, setCapability] = useState<LimitOrderCapability | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityError, setCapabilityError] = useState("");
  const [limitOrdersEnabled, setLimitOrdersEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [orders, setOrders] = useState<LimitOrderRecord[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");

  const sellToken = useMemo(
    () => tokens.find((token) => sameToken(token.address, sellTokenAddress)) ?? null,
    [sellTokenAddress, tokens]
  );
  const buyToken = useMemo(
    () => tokens.find((token) => sameToken(token.address, buyTokenAddress)) ?? null,
    [buyTokenAddress, tokens]
  );
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
    const controller = new AbortController();
    setTokensLoading(true);
    listTokens(chainId, controller.signal)
      .then((items) => {
        const nextTokens = items.length ? items : DEFAULT_TOKENS_BY_CHAIN[chainId] ?? [];
        setTokens(nextTokens);
        setSellTokenAddress(nextTokens[0]?.address ?? "");
        setBuyTokenAddress(nextTokens.find((token) => !sameToken(token.address, nextTokens[0]?.address ?? ""))?.address ?? "");
      })
      .catch(() => {
        const fallback = DEFAULT_TOKENS_BY_CHAIN[chainId] ?? [];
        setTokens(fallback);
        setSellTokenAddress(fallback[0]?.address ?? "");
        setBuyTokenAddress(fallback.find((token) => !sameToken(token.address, fallback[0]?.address ?? ""))?.address ?? "");
      })
      .finally(() => setTokensLoading(false));
    return () => controller.abort();
  }, [chainId]);

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
        if (!cancelled) setLimitOrdersEnabled(flags.limitOrdersEnabled);
      })
      .catch(() => {
        if (!cancelled) setLimitOrdersEnabled(true);
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
    let cancelled = false;
    setCapabilityLoading(true);
    setCapabilityError("");
    checkLimitOrderCapability(envPublic.BACKEND_BASE_URL, {
      chainId,
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
  }, [buyToken, chainId, sellToken]);

  const recipientValid = isAddress(recipientAddress);
  const canCreateLimitOrder = Boolean(
    walletProvider &&
    address &&
    capability?.automaticExecutionSupported &&
    termsAccepted &&
    sellToken &&
    buyToken &&
    sellAmountRaw &&
    minBuyAmountRaw &&
    recipientValid
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
      if (!recipientValid) throw new Error("Enter a valid recipient address.");
      if (!capability?.automaticExecutionSupported) throw new Error(capability?.reason || "This pair is not available for limit orders.");
      await ensureCorrectNetwork(walletProvider, chainId);
      const session = await ensureBackendSession();

      const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000);
      const order = buildOneInchOrder({
        chainId,
        maker: address,
        recipient: recipientAddress,
        sellToken,
        buyToken,
        sellAmountRaw,
        minBuyAmountRaw,
        expiresAt
      });
      const typedData = order.getTypedData(chainId);
      setOrderNotice(`Open ${walletName} and sign the limit order terms. This signature is not a fund transfer.`);
      const signature = await signTypedData(walletProvider, address, typedData, providerKind);
      const orderHash = order.getOrderHash(chainId);
      const signedPayloadJson = JSON.stringify(
        {
          version: "1inch-limit-order-v4",
          provider: "1inch_orderbook",
          chainId,
          data: { ...order.build(), extension: order.extension.encode() },
          typedData,
          createdAt: new Date().toISOString()
        },
        jsonBigIntReplacer
      );

      setOrderNotice("Submitting your signed limit order...");
      const saved = await saveLimitOrder(envPublic.BACKEND_BASE_URL, session, {
        chainId,
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

  if (featureFlagsLoaded && !limitOrdersEnabled) {
    return (
      <main className="container limitOrderPage">
        <header className="header">
          <div className="headerTop">
            <div className="headerCopy">
              <h1 className="h1">Limit Orders</h1>
              <div className="subtle">Limit Orders are not available right now.</div>
            </div>
            <div className="walletActions">
              <Link className="btn" href="/swap">Back to Swap</Link>
            </div>
          </div>
        </header>
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
      <header className="header">
        <div className="headerTop">
          <div className="headerCopy">
            <h1 className="h1">Limit Orders</h1>
            <div className="subtle">
              Sign exact order terms once. Supported protocols can execute later only within those signed limits.
            </div>
          </div>
          <div className="walletActions">
            <Link className="btn" href="/swap">Swap</Link>
            <button
              className="btn btnPrimary"
              type="button"
              disabled={!isAppKitConfigured}
              onClick={() => void open({ view: "Connect", namespace: "eip155" })}
            >
              {isConnected && address ? `${walletName} ${shortAddress(address)}` : "Connect Wallet"}
            </button>
          </div>
        </div>
      </header>

      <section className="panel limitOrderWarning" aria-labelledby="limit-risk-title">
        <h2 id="limit-risk-title">Read Before Creating A Limit Order</h2>
        <ul>
          <li>Limit orders are not guaranteed to execute, even when a target price appears to be reached.</li>
          <li>Orders can fail because of liquidity, gas costs, allowance, wallet balance, expiry, or provider downtime.</li>
          <li>Automatic execution is enabled only when the signed order can be verified by a supported protocol.</li>
          <li>Native BTC, native assets, and unsupported routes remain blocked from automatic execution until a safe adapter exists.</li>
        </ul>
      </section>

      <section className="panel limitOrderGrid" aria-label="Limit order form">
        <label className="field">
          <span className="label">Network</span>
          <select className="input" value={chainId} onChange={(event) => setChainId(Number(event.target.value))}>
            {chains.map((chain) => (
              <option key={chain.chainId} value={chain.chainId}>{chain.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Sell token</span>
          <select className="input" value={sellTokenAddress} onChange={(event) => setSellTokenAddress(event.target.value)}>
            {tokens.map((token) => (
              <option key={`sell:${token.address}`} value={token.address}>
                {token.symbol} {isNativeBitcoinToken(token) ? "(Bitcoin)" : token.isNative ? "(native)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Buy token</span>
          <select className="input" value={buyTokenAddress} onChange={(event) => setBuyTokenAddress(event.target.value)}>
            {tokens.map((token) => (
              <option key={`buy:${token.address}`} value={token.address}>
                {token.symbol} {isNativeBitcoinToken(token) ? "(Bitcoin)" : token.isNative ? "(native)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Sell amount</span>
          <input className="input" inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} />
        </label>

        <label className="field">
          <span className="label">Target rate</span>
          <input className="input" inputMode="decimal" value={targetRate} onChange={(event) => setTargetRate(event.target.value)} />
          <span className="small">1 {sellToken?.symbol ?? "sell token"} = target {buyToken?.symbol ?? "buy token"}</span>
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

        <label className="field limitOrderWide">
          <span className="label">Recipient address</span>
          <input
            className="input"
            value={recipientAddress}
            onChange={(event) => setRecipientAddress(event.target.value)}
            placeholder={address || "0x..."}
          />
        </label>

        <div className={`limitOrderCapability ${capability?.automaticExecutionSupported ? "limitOrderCapabilityReady" : ""}`}>
          <strong>{capabilityLoading ? "Checking support..." : capability?.automaticExecutionSupported ? "Limit order path available" : "Limit order not available"}</strong>
          <p>{capabilityError || capability?.reason || "Choose a pair to check execution support."}</p>
          {capability && capability.executionProvider !== "none" ? <span className="badge">{capability.executionProvider}</span> : null}
        </div>

        <label className="limitOrderTerms limitOrderWide">
          <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
          <span>
            I understand execution is not guaranteed, prices and liquidity can change, I remain responsible for approvals
            and balances, and automatic execution is allowed only for the exact signed order terms shown here.
          </span>
        </label>

        <div className="limitOrderWide limitOrderActionRow">
          <button className="btn btnPrimary" type="button" disabled={!canCreateLimitOrder || orderSaving} onClick={() => void createLimitOrder()}>
            {orderSaving ? "Creating..." : "Create Signed Limit Order"}
          </button>
          <button className="btn" type="button" disabled={!address || orderSaving} onClick={() => void loadOrders()}>
            {ordersLoaded ? "Refresh Orders" : "Load Orders"}
          </button>
          <span className="small">
            {canCreateLimitOrder
              ? "Your wallet will show the exact order terms before you sign."
              : "Connect your wallet, complete the fields, choose a supported pair, and accept the terms."}
          </span>
        </div>

        {orderNotice ? <div className="ok limitOrderMessage limitOrderWide">{orderNotice}</div> : null}
        {orderError ? <div className="error limitOrderMessage limitOrderWide">{orderError}</div> : null}
      </section>

      <section className="panel limitOrderAudit">
        <h2>Security Model</h2>
        <p>
          Swap Assistant stores the signed order payload and a hash of the signed terms. If any order parameter is changed,
          the protocol signature no longer matches and the order must not execute.
        </p>
        <p className="small">
          Current safe adapter: 1inch Orderbook / Limit Order Protocol for EVM contract-token pairs that support EIP-712
          signing. Native BTC, native assets, and unsupported pairs stay blocked until a matching signed-intent adapter exists.
        </p>
      </section>

      <section className="panel limitOrderAudit">
        <h2>Your Limit Orders</h2>
        {!ordersLoaded ? (
          <p className="small">Load your signed orders after connecting and signing in.</p>
        ) : orders.length ? (
          <div className="limitOrderList">
            {orders.map((order) => (
              <div className="limitOrderItem" key={order.id}>
                <div>
                  <strong>{order.sellTokenSymbol} to {order.buyTokenSymbol}</strong>
                  <span className="small">{formatOrderTarget(order)} · expires {formatDate(order.expiresAt)}</span>
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
