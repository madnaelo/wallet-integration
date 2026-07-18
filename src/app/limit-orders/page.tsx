"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  WalletBridgeActions,
  WalletBridgeOpenOptions,
  WalletBridgeState
} from "@/components/WalletBridge";
import { isAppKitConfigured } from "@/lib/walletConfig";
import { CHAINS, getAllowedChains } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { createRecipientWalletImport } from "@/lib/recipientWalletImport";
import type { BackendSession, LimitOrder as LimitOrderRecord, LimitOrderCapability } from "@/lib/backendClient";
import {
  BackendClientError,
  cancelLimitOrder as submitLimitOrderCancellation,
  checkLimitOrderCapability,
  getFeatureFlags,
  getLimitOrderCancellationPlan,
  listLimitOrders,
  requestAuthNonce,
  saveLimitOrder,
  verifyAuthSignature
} from "@/lib/backendClient";
import { submitOneInchLimitOrderCancellation } from "@/lib/limitOrderCancellation";
import type { TokenInfo } from "@/lib/tokens";
import { listTokens } from "@/lib/tokenClient";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { ensureExactTokenAllowance } from "@/lib/tokenAllowance";
import {
  clearStoredBackendSession,
  isExpiredBackendSessionError,
  isSessionForWallet,
  readStoredBackendSession,
  writeStoredBackendSession
} from "@/lib/backendSession";
import { isUserRejectedWalletRequest, signPersonalMessage } from "@/lib/walletSigning";
import {
  COW_PROTOCOL_PROVIDER,
  ONEINCH_ORDERBOOK_PROVIDER,
  resolveTrustedLimitOrderSpender
} from "@/lib/limitOrderSpender";
import { TokenPicker, type TokenPickerOption } from "@/components/TokenPicker";
import {
  buildFallbackTokensByChain,
  buildTokenPickerNetworks,
  buildTokenPickerOptions,
  getEvmNetworkId
} from "@/lib/tokenPickerOptions";

const WalletBridge = dynamic(() => import("@/components/WalletBridge"), { ssr: false });

const SIGNING_ATTEMPT_TIMEOUT_MS = 90_000;
const WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS = 300_000;
const SIGNING_ATTEMPT_EXPIRY_SECONDS = 300;
const UINT_40_MAX = (1n << 40n) - 1n;
const ONEINCH_PROVIDER = ONEINCH_ORDERBOOK_PROVIDER;
const COW_SETTLEMENT_CONTRACT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const COW_EMPTY_APP_DATA = "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d";
const RATE_SAMPLE_INTERVAL_MS = 45_000;
const MAX_RATE_SAMPLES = 7;
const ORDER_STATUS_REFRESH_INTERVAL_MS = 30_000;

type ProviderKind = "injected" | "walletconnect" | null;
type LimitOrderLanguage = "simple" | "crypto" | "expert";
type RecipientAddressSource = "connected" | "pasted" | "scanned" | "wallet_import";
type RecipientDialogMode = "paste" | "scan" | "wallet";
type QrDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
type QrDetectorConstructor = new (options?: { formats?: string[] }) => QrDetector;
type RateSample = {
  id: string;
  rate: string;
  numericRate: number;
  providerName: string;
  sampledAt: string;
};
type PreparedLimitOrder = {
  executionProvider: string;
  expiresAt: Date;
  orderHash: string;
  signedPayloadJson: string;
  typedData: unknown;
};

const LIMIT_ORDER_LANGUAGE_COPY: Record<LimitOrderLanguage, {
  label: string;
  heroBody: string;
  formSubheading: string;
  capabilityChecking: string;
  capabilityReady: string;
  capabilityAlertsOnly: string;
  capabilityUnavailable: string;
  capabilityDefault: string;
  readyBody: (provider: string) => string;
  warningTitle: string;
  warnings: string[];
  securityTitle: string;
  securityBody: string;
  securityFootnote: string;
  terms: string;
}> = {
  simple: {
    label: "Simple",
    heroBody:
      "Pick the tokens, choose the price you want, and approve the exact order in your wallet. Your funds stay in your wallet unless the order can be filled at your price.",
    formSubheading: "Like a normal swap, but it waits for your price.",
    capabilityChecking: "Checking this pair...",
    capabilityReady: "This pair can be ordered",
    capabilityAlertsOnly: "Alert only for now",
    capabilityUnavailable: "Order check unavailable",
    capabilityDefault: "Choose two tokens on the same network to see if this can be placed as an order.",
    readyBody: (provider) => `${provider} can watch this order and fill it only at the price you approve.`,
    warningTitle: "Before You Create An Order",
    warnings: [
      "The order may not fill, even if the market briefly touches your price.",
      "It needs enough token balance and approval in your wallet when execution happens.",
      "You can review the exact terms before signing. This signature is not a transfer.",
      "If token approval is needed, your wallet asks separately and the network may charge gas.",
      "If a pair cannot be safely ordered yet, Swap Assistant keeps it as an alert instead."
    ],
    securityTitle: "How We Keep It Safe",
    securityBody:
      "Your wallet signs the exact tokens, amount, price, recipient, and expiry. If anyone changes those terms, the signature no longer works.",
    securityFootnote:
      "Swap Assistant does not hold your funds or private keys. Supported pairs use trusted signed-order protocols.",
    terms:
      "I understand this order may not fill, and it needs enough balance and exact token approval in my wallet. A token approval may cost network gas. Swap Assistant may submit only the exact terms I review and sign."
  },
  crypto: {
    label: "Crypto",
    heroBody:
      "Create a non-custodial signed limit order. You sign fixed order terms once; a supported orderbook can execute only inside those terms.",
    formSubheading: "Set the pair, target rate, recipient, and expiry.",
    capabilityChecking: "Checking order support...",
    capabilityReady: "Signed execution available",
    capabilityAlertsOnly: "Signed execution unavailable",
    capabilityUnavailable: "Support check unavailable",
    capabilityDefault: "Choose a same-network token pair to check signed limit-order support.",
    readyBody: (provider) => `${provider} can accept a wallet-signed order for this pair.`,
    warningTitle: "Limit Order Risks",
    warnings: [
      "Execution is not guaranteed when the target price is reached.",
      "Liquidity, solver availability, allowance, balance, gas, and expiry can prevent fills.",
      "Native coins use their wrapped token form where the order protocol requires ERC-20 assets.",
      "Unsupported routes remain notification-only until a safe signed-order adapter exists."
    ],
    securityTitle: "Signed-Order Security",
    securityBody:
      "Swap Assistant stores the signed payload and a hash of the terms. A changed order cannot pass provider verification.",
    securityFootnote:
      "Current adapters: CoW Protocol first, with 1inch Orderbook fallback where supported.",
    terms:
      "I understand execution is not guaranteed. Prices, liquidity, allowance, balance, gas cost, and expiry can stop execution. Swap Assistant may submit only the exact signed terms shown here."
  },
  expert: {
    label: "Expert",
    heroBody:
      "Create EIP-712 signed limit orders through supported non-custodial orderbooks. The backend stores and submits signed intents, not keys.",
    formSubheading: "Build and sign deterministic EIP-712 order terms.",
    capabilityChecking: "Checking adapter capability...",
    capabilityReady: "Order adapter available",
    capabilityAlertsOnly: "No signed-order adapter",
    capabilityUnavailable: "Adapter check unavailable",
    capabilityDefault: "Select a same-chain contract-token pair to resolve adapter support.",
    readyBody: (provider) => `${provider} is selected for this order.`,
    warningTitle: "Execution Constraints",
    warnings: [
      "Solver/orderbook execution is best-effort and may fail despite a touched reference price.",
      "ERC-20 allowance, balance, validTo, fee model, route liquidity, and gas economics affect fillability.",
      "Native EVM assets are normalized to wrapped ERC-20 equivalents for signed order protocols.",
      "Native BTC and unsupported ecosystems stay alerts-only until a verifiable signed-intent adapter is added."
    ],
    securityTitle: "Verification Model",
    securityBody:
      "The signed order payload is hashed and validated server-side against the requested fields before submission.",
    securityFootnote:
      "Adapters currently validate CoW Protocol GPv2 orders and 1inch Orderbook v4 payloads.",
    terms:
      "I accept signed-order execution risk. I reviewed pair, amounts, receiver, expiry, provider, and wrapped-asset behavior before signing."
  }
};

const WRAPPED_NATIVE_BY_CHAIN: Record<number, TokenInfo> = {
  1: { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, name: "Wrapped Ether" },
  11155111: { symbol: "WETH", address: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9", decimals: 18, name: "Wrapped Ether" },
  137: { symbol: "WPOL", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, name: "Wrapped Polygon Ecosystem Token" },
  8453: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
  42161: { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, name: "Wrapped Ether" },
  10: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
  56: { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, name: "Wrapped BNB" },
  43114: { symbol: "WAVAX", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18, name: "Wrapped AVAX" }
};

export default function LimitOrdersPage() {
  const chains = useMemo(() => getAllowedChains(), []);
  const [walletBridgeState, setWalletBridgeState] = useState<WalletBridgeState>({ evmConnected: false });
  const [walletBridgeActions, setWalletBridgeActions] = useState<WalletBridgeActions | null>(null);
  const address = walletBridgeState.evmAddress;
  const isConnected = walletBridgeState.evmConnected;
  const walletProvider = walletBridgeState.evmProvider;
  const walletProviderType = walletBridgeState.providerType;
  const walletBridgeReady = Boolean(walletBridgeActions);
  const open = useCallback(
    async (options: WalletBridgeOpenOptions) => {
      if (!walletBridgeActions) throw new Error("Wallet options are still loading. Try again in a moment.");
      await walletBridgeActions.open(options);
    },
    [walletBridgeActions]
  );
  const backendSessionRequestRef = useRef<Promise<BackendSession> | null>(null);

  const providerKind: ProviderKind = walletProviderType === "WALLET_CONNECT" ? "walletconnect" : walletProvider ? "injected" : null;
  const walletName = getWalletDisplayName(walletBridgeState.evmWalletName, walletProviderType);
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
  const [languageMode, setLanguageMode] = useState<LimitOrderLanguage>("simple");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressMode, setRecipientAddressMode] = useState<"connected" | "custom">("connected");
  const [recipientAddressSource, setRecipientAddressSource] = useState<RecipientAddressSource>("connected");
  const [recipientImportedWalletName, setRecipientImportedWalletName] = useState("");
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [recipientDialogMode, setRecipientDialogMode] = useState<RecipientDialogMode>("paste");
  const [recipientAddressDraft, setRecipientAddressDraft] = useState("");
  const [recipientDialogError, setRecipientDialogError] = useState("");
  const [recipientQrStatus, setRecipientQrStatus] = useState("");
  const [recipientWalletImportQrDataUrl, setRecipientWalletImportQrDataUrl] = useState("");
  const [recipientWalletImportStatus, setRecipientWalletImportStatus] = useState("");
  const [recipientWalletImportLoading, setRecipientWalletImportLoading] = useState(false);
  const [rateSamples, setRateSamples] = useState<RateSample[]>([]);
  const [rateSampleStatus, setRateSampleStatus] = useState("");
  const [rateSampleError, setRateSampleError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [capability, setCapability] = useState<LimitOrderCapability | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityError, setCapabilityError] = useState("");
  const [featureFlags, setFeatureFlags] = useState({
    priceAlertsEnabled: false,
    limitOrdersEnabled: true
  });
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [orders, setOrders] = useState<LimitOrderRecord[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState("");
  const [orderToCancel, setOrderToCancel] = useState<LimitOrderRecord | null>(null);
  const [orderError, setOrderError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");
  const recipientQrVideoRef = useRef<HTMLVideoElement>(null);
  const recipientQrStreamRef = useRef<MediaStream | null>(null);
  const recipientQrTimerRef = useRef<number | null>(null);
  const recipientWalletImportRunRef = useRef(0);
  const applyRecipientAddressRef = useRef<(rawValue: string, source?: RecipientAddressSource, walletName?: string) => void>(
    () => undefined
  );

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
  const executionSellToken = useMemo(
    () => toLimitOrderExecutionToken(sellToken, chainId),
    [chainId, sellToken]
  );
  const executionBuyToken = useMemo(
    () => toLimitOrderExecutionToken(buyToken, chainId),
    [buyToken, chainId]
  );
  const sameNetworkSelected = Boolean(sellToken && buyToken && sellToken.networkId === buyToken.networkId);
  const selectedChain = useMemo(() => chains.find((chain) => chain.chainId === chainId) ?? chains[0], [chainId, chains]);
  const sellAmountRaw = useMemo(() => {
    if (!executionSellToken || !sellAmount.trim()) return "";
    return parseUnitsSafe(sellAmount, executionSellToken.decimals) ?? "";
  }, [executionSellToken, sellAmount]);
  const minBuyAmountRaw = useMemo(() => {
    if (!executionSellToken || !executionBuyToken || !sellAmount.trim() || !targetRate.trim()) return "";
    if (!parseUnitsSafe(sellAmount, executionSellToken.decimals)) return "";
    return computeTakingAmountRaw(sellAmount, targetRate, executionBuyToken.decimals) ?? "";
  }, [executionBuyToken, executionSellToken, sellAmount, targetRate]);
  const hasOrdersNeedingRefresh = useMemo(
    () => orders.some((order) => [
      "stored",
      "pending_submission",
      "submitted",
      "open",
      "partially_filled",
      "cancellation_pending"
    ].includes(order.executionStatus)),
    [orders]
  );

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
    if (!address || !ordersLoaded || !hasOrdersNeedingRefresh) return;
    let disposed = false;
    let refreshInFlight = false;

    const refresh = async () => {
      if (refreshInFlight || document.visibilityState !== "visible") return;
      const session = backendSession ?? readStoredBackendSession();
      if (!session || !isSessionForWallet(session, address)) return;
      refreshInFlight = true;
      try {
        const nextOrders = await listLimitOrders(envPublic.BACKEND_BASE_URL, session);
        if (!disposed) setOrders(nextOrders);
      } catch (error) {
        if (!disposed && isExpiredBackendSessionError(error)) {
          clearStoredBackendSession();
          setBackendSession(null);
        }
      } finally {
        refreshInFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refresh();
    }, ORDER_STATUS_REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [address, backendSession, hasOrdersNeedingRefresh, ordersLoaded]);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags(envPublic.BACKEND_BASE_URL)
      .then((flags) => {
        if (!cancelled) setFeatureFlags(flags);
      })
      .catch(() => {
        if (!cancelled) setFeatureFlags({ priceAlertsEnabled: false, limitOrdersEnabled: true });
      })
      .finally(() => {
        if (!cancelled) setFeatureFlagsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!executionSellToken || !executionBuyToken) {
      setCapability(null);
      return;
    }
    if (!sameNetworkSelected || typeof sellToken?.quoteChainId !== "number") {
      setCapability(null);
      setCapabilityLoading(false);
      setCapabilityError("Choose both tokens on the same supported EVM network.");
      return;
    }
    let cancelled = false;
    setCapability(null);
    setCapabilityLoading(true);
    setCapabilityError("");
    checkLimitOrderCapability(envPublic.BACKEND_BASE_URL, {
      chainId: sellToken.quoteChainId,
      sellTokenAddress: executionSellToken.address,
      sellTokenSymbol: executionSellToken.symbol,
      sellTokenDecimals: executionSellToken.decimals,
      buyTokenAddress: executionBuyToken.address,
      buyTokenSymbol: executionBuyToken.symbol,
      buyTokenDecimals: executionBuyToken.decimals
    })
      .then((result) => {
        if (!cancelled) setCapability(result);
      })
      .catch((error) => {
        if (!cancelled) setCapabilityError(formatCapabilityCheckError(error));
      })
      .finally(() => {
        if (!cancelled) setCapabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [executionBuyToken, executionSellToken, sameNetworkSelected, sellToken]);

  const resetRecipientWalletImportState = useCallback(() => {
    setRecipientWalletImportQrDataUrl("");
    setRecipientWalletImportStatus("");
    setRecipientWalletImportLoading(false);
  }, []);
  const cancelRecipientWalletImport = useCallback(() => {
    recipientWalletImportRunRef.current += 1;
    resetRecipientWalletImportState();
  }, [resetRecipientWalletImportState]);

  useEffect(() => {
    applyRecipientAddressRef.current = applyRecipientAddress;
  });

  useEffect(() => {
    if (recipientAddressMode === "connected") {
      setRecipientAddress(address ?? "");
      setRecipientAddressSource("connected");
      setRecipientImportedWalletName("");
    }
  }, [address, recipientAddressMode]);

  useEffect(() => {
    if (!recipientDialogOpen || recipientDialogMode !== "scan") {
      stopRecipientQrScanner();
      return;
    }

    let cancelled = false;
    const barcodeDetectorCtor = getQrDetectorConstructor();
    if (!barcodeDetectorCtor) {
      setRecipientQrStatus("QR scanning is not available in this browser. Paste the address instead.");
      return () => {
        cancelled = true;
        stopRecipientQrScanner();
      };
    }
    const BarcodeDetectorClass = barcodeDetectorCtor;

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecipientQrStatus("Camera scanning is not available in this browser. Paste the address instead.");
      return () => {
        cancelled = true;
        stopRecipientQrScanner();
      };
    }

    async function startRecipientQrScanner() {
      try {
        setRecipientQrStatus("Starting camera...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        recipientQrStreamRef.current = stream;
        if (recipientQrVideoRef.current) {
          recipientQrVideoRef.current.srcObject = stream;
          await recipientQrVideoRef.current.play();
        }

        const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
        setRecipientQrStatus("Point your camera at the recipient QR code.");
        recipientQrTimerRef.current = window.setInterval(async () => {
          const video = recipientQrVideoRef.current;
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          try {
            const codes = await detector.detect(video);
            const rawValue = codes[0]?.rawValue?.trim();
            if (rawValue) applyRecipientAddressRef.current(rawValue, "scanned");
          } catch {
            setRecipientQrStatus("Could not read that QR code yet.");
          }
        }, 600);
      } catch {
        setRecipientQrStatus("Camera permission was not granted. Paste the address instead.");
      }
    }

    void startRecipientQrScanner();
    return () => {
      cancelled = true;
      stopRecipientQrScanner();
    };
  }, [recipientDialogOpen, recipientDialogMode]);

  useEffect(() => {
    setRateSamples([]);
    setRateSampleError("");
  }, [address, chainId, executionBuyToken?.address, executionSellToken?.address]);

  useEffect(() => {
    if (!address) {
      setRateSampleStatus("Connect your wallet to load live rates.");
      return;
    }
    if (!executionSellToken || !executionBuyToken || !sameNetworkSelected || !isAddress(executionSellToken.address) || !isAddress(executionBuyToken.address)) {
      setRateSampleStatus("Choose a supported same-network pair to load live rates.");
      return;
    }
    const sampleAmountHuman = parsePositiveNumber(sellAmount) ? sellAmount : "1";
    const sampleAmountRaw = parseUnitsSafe(sampleAmountHuman, executionSellToken.decimals);
    if (!sampleAmountRaw) {
      setRateSampleStatus("Enter a valid amount to load live rates.");
      return;
    }

    const walletAddress = address;
    let cancelled = false;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;

    async function fetchRateSample() {
      controller?.abort();
      controller = new AbortController();
      setRateSampleStatus("Loading live rate...");
      setRateSampleError("");
      try {
        const url = buildQuoteUrl({
          chainId,
          sellToken: executionSellToken!.address,
          buyToken: executionBuyToken!.address,
          sellAmount: sampleAmountRaw!,
          takerAddress: walletAddress,
          toAddress: isAddress(recipientAddress) ? recipientAddress : walletAddress
        });
        const res = await fetch(url, { signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Live rate is unavailable right now.");
        const sample = quoteToRateSample(body, executionSellToken!, executionBuyToken!);
        if (!sample || cancelled) return;
        setRateSamples((current) => appendRateSample(current, sample));
        setRateSampleStatus("Live rates updated.");
      } catch (error: any) {
        if (cancelled || error?.name === "AbortError") return;
        setRateSampleError(formatRateSampleError(error));
        setRateSampleStatus("");
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(fetchRateSample, RATE_SAMPLE_INTERVAL_MS);
        }
      }
    }

    void fetchRateSample();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [
    address,
    chainId,
    executionBuyToken,
    executionSellToken,
    recipientAddress,
    sameNetworkSelected,
    sellAmount
  ]);

  const recipientValid = isAddress(recipientAddress);
  const languageCopy = LIMIT_ORDER_LANGUAGE_COPY[languageMode];
  const recipientAddressDisplay = useMemo(
    () =>
      buildRecipientAddressDisplay({
        address: recipientAddress,
        networkName: selectedChain?.name ?? "Network",
        source: recipientAddressMode === "connected" ? "connected" : recipientAddressSource,
        walletName: recipientAddressSource === "wallet_import" ? recipientImportedWalletName : walletName
      }),
    [recipientAddress, recipientAddressMode, recipientAddressSource, recipientImportedWalletName, selectedChain?.name, walletName]
  );
  const executionTokenNotice = buildExecutionTokenNotice(sellToken, buyToken, executionSellToken, executionBuyToken, languageMode);
  const canCreateLimitOrder = Boolean(
    walletProvider &&
    address &&
    capability?.automaticExecutionSupported &&
    termsAccepted &&
    sellToken &&
    buyToken &&
    executionSellToken &&
    executionBuyToken &&
    sameNetworkSelected &&
    sellAmountRaw &&
    minBuyAmountRaw &&
    recipientValid
  );
  const estimatedReceive = executionBuyToken && minBuyAmountRaw ? formatCompactNumber(formatUnitsSafe(minBuyAmountRaw, executionBuyToken.decimals)) : "";
  const targetRateLabel = sellToken && buyToken
    ? `1 ${sellToken.symbol} = ${targetRate.trim() || "-"} ${buyToken.symbol}`
    : "Choose a pair";
  const capabilityTitle = capabilityLoading
    ? languageCopy.capabilityChecking
    : capabilityError
      ? languageCopy.capabilityUnavailable
      : capability?.automaticExecutionSupported
        ? languageCopy.capabilityReady
        : languageCopy.capabilityAlertsOnly;
  const capabilityBody = capability?.automaticExecutionSupported
    ? languageCopy.readyBody(formatExecutionProvider(capability.executionProvider))
    : formatCapabilityReason(capabilityError || capability?.reason || languageCopy.capabilityDefault, languageMode);

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
    <>
      {isAppKitConfigured ? (
        <WalletBridge onState={setWalletBridgeState} onActions={setWalletBridgeActions} />
      ) : null}
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
            disabled={!isAppKitConfigured || !walletBridgeReady}
            onClick={() => void open({ view: isConnected && address ? "Account" : "Connect", namespace: "eip155" })}
          >
            {isConnected && address
              ? `${walletName} ${shortAddress(address)}`
              : !isAppKitConfigured
                ? "Wallet unavailable"
                : walletBridgeReady
                  ? "Connect Wallet"
                  : "Preparing Wallets..."}
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
          {featureFlags.priceAlertsEnabled ? <li><Link className="appMenuLink" href="/swap#alerts">Set Alerts</Link></li> : null}
          <li><Link className="appMenuLink" href="/swap#preferences">Preferences</Link></li>
        </ul>
      </nav>
      </header>
    </>
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
      const signature = await signPersonalMessage({
        provider: walletProvider,
        walletAddress: address,
        message: nonce.message,
        providerKind,
        walletName,
        setNotice: setOrderNotice
      });
      const session = await verifyAuthSignature(envPublic.BACKEND_BASE_URL, address, nonce.nonceId, signature);
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

  async function cancelSavedLimitOrder(order: LimitOrderRecord) {
    setCancellingOrderId(order.id);
    setOrderError("");
    setOrderNotice("");
    try {
      if (!walletProvider || !address) throw new Error("Connect the wallet that created this order first.");
      if (order.walletAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connect the wallet that created this order.");
      }
      const session = await ensureBackendSession();
      const plan = await getLimitOrderCancellationPlan(envPublic.BACKEND_BASE_URL, session, order.id);
      let saved: LimitOrderRecord;

      if (plan.mode === "local") {
        saved = await submitLimitOrderCancellation(envPublic.BACKEND_BASE_URL, session, order.id, {});
      } else if (plan.mode === "cow_signature") {
        if (!plan.typedData) throw new Error("The cancellation request could not be prepared safely.");
        await ensureCorrectNetwork(walletProvider, plan.chainId);
        setOrderNotice(`Open ${walletName} and approve the cancellation. This signature cannot move funds.`);
        const signature = await signTypedData(
          walletProvider,
          address,
          plan.typedData,
          providerKind,
          "Your wallet did not return the cancellation signature."
        );
        setOrderNotice("Sending the signed cancellation...");
        saved = await submitLimitOrderCancellation(
          envPublic.BACKEND_BASE_URL,
          session,
          order.id,
          { signature }
        );
      } else if (plan.mode === "oneinch_transaction") {
        if (!plan.contractAddress || !plan.makerTraits) {
          throw new Error("The cancellation transaction could not be prepared safely.");
        }
        await ensureCorrectNetwork(walletProvider, plan.chainId);
        const transactionHash = await submitOneInchLimitOrderCancellation({
          provider: walletProvider,
          ownerAddress: address,
          expectedChainId: plan.chainId,
          contractAddress: plan.contractAddress,
          makerTraits: plan.makerTraits,
          orderHash: plan.orderHash,
          onWalletRequest: () => {
            setOrderNotice(`Open ${walletName} and confirm the cancellation transaction. Network gas may apply.`);
          },
          onTransactionSubmitted: () => {
            setOrderNotice("Cancellation sent. Waiting for network confirmation...");
          }
        });
        saved = await submitLimitOrderCancellation(
          envPublic.BACKEND_BASE_URL,
          session,
          order.id,
          { transactionHash }
        );
      } else {
        throw new Error(plan.reason || "This order cannot be cancelled right now.");
      }

      setOrders((current) => current.map((item) => item.id === saved.id ? saved : item));
      setOrderNotice(cancellationStatusMessage(saved));
    } catch (error) {
      if (isExpiredBackendSessionError(error)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setOrderError(normalizeWalletError(error));
    } finally {
      setCancellingOrderId("");
    }
  }

  async function createLimitOrder() {
    setOrderSaving(true);
    setOrderError("");
    setOrderNotice("");
    try {
      if (!walletProvider || !address) throw new Error("Connect your wallet before creating a limit order.");
      if (!sellToken || !buyToken || !executionSellToken || !executionBuyToken || !sellAmountRaw || !minBuyAmountRaw) {
        throw new Error("Complete the order details first.");
      }
      if (!sameNetworkSelected || typeof sellToken.quoteChainId !== "number") throw new Error("Choose both tokens on the same supported network.");
      if (!recipientValid) throw new Error("Enter a valid recipient address.");
      if (!capability?.automaticExecutionSupported) throw new Error(capability?.reason || "This pair is not available for limit orders.");
      const executionChainId = sellToken.quoteChainId;
      await ensureCorrectNetwork(walletProvider, executionChainId);
      const session = await ensureBackendSession();

      const expiresAtSeconds = Math.floor((Date.now() + Number(expiryHours) * 60 * 60 * 1000) / 1000);
      const expiresAt = new Date(expiresAtSeconds * 1000);
      const preparedOrder = await prepareLimitOrder({
        executionProvider: capability.executionProvider,
        chainId: executionChainId,
        maker: address,
        recipient: recipientAddress,
        sellToken: executionSellToken,
        buyToken: executionBuyToken,
        sellAmountRaw,
        minBuyAmountRaw,
        expiresAt
      });
      const spenderAddress = await resolveTrustedLimitOrderSpender(preparedOrder.executionProvider, executionChainId);
      await ensureExactTokenAllowance({
        provider: walletProvider,
        ownerAddress: address,
        tokenAddress: executionSellToken.address,
        spenderAddress,
        expectedChainId: executionChainId,
        requiredAmount: BigInt(sellAmountRaw),
        onWalletRequest: (phase) => {
          setOrderNotice(
            phase === "reset"
              ? `Open ${walletName} and confirm clearing the previous ${executionSellToken.symbol} permission.`
              : `Open ${walletName} and approve access to exactly ${formatCompactNumber(sellAmount)} ${executionSellToken.symbol}.`
          );
        },
        onTransactionSubmitted: () => {
          setOrderNotice("Token approval submitted. Waiting for network confirmation.");
        }
      });
      setOrderNotice(`Open ${walletName} and sign the ${formatExecutionProvider(preparedOrder.executionProvider)} terms. This signature is not a fund transfer.`);
      const signature = await signTypedData(walletProvider, address, preparedOrder.typedData, providerKind);

      setOrderNotice("Submitting your signed limit order...");
      const saved = await saveLimitOrder(envPublic.BACKEND_BASE_URL, session, {
        chainId: executionChainId,
        sellTokenAddress: executionSellToken.address,
        sellTokenSymbol: executionSellToken.symbol,
        sellTokenDecimals: executionSellToken.decimals,
        buyTokenAddress: executionBuyToken.address,
        buyTokenSymbol: executionBuyToken.symbol,
        buyTokenDecimals: executionBuyToken.decimals,
        sellAmountRaw,
        minBuyAmountRaw,
        targetRate,
        expiresAt: preparedOrder.expiresAt.toISOString(),
        recipientAddress: recipientAddress.trim(),
        executionProvider: preparedOrder.executionProvider,
        orderHash: preparedOrder.orderHash,
        signature,
        signedPayloadJson: preparedOrder.signedPayloadJson,
        termsVersion: capability.termsVersion,
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

  function openRecipientAddressDialog() {
    setRecipientDialogMode("paste");
    setRecipientAddressDraft(recipientAddress);
    setRecipientDialogError("");
    setRecipientQrStatus("");
    resetRecipientWalletImportState();
    setRecipientDialogOpen(true);
  }

  function closeRecipientAddressDialog() {
    setRecipientDialogOpen(false);
    setRecipientDialogError("");
    setRecipientQrStatus("");
    cancelRecipientWalletImport();
    stopRecipientQrScanner();
  }

  function chooseRecipientDialogMode(mode: RecipientDialogMode) {
    setRecipientDialogMode(mode);
    setRecipientDialogError("");
    setRecipientQrStatus("");
    if (mode !== "wallet") cancelRecipientWalletImport();
    if (mode !== "scan") stopRecipientQrScanner();
  }

  function useConnectedRecipientAddress() {
    if (!address) {
      setRecipientDialogError("Connect your wallet first, or paste a recipient address.");
      return;
    }

    setRecipientAddress(address);
    setRecipientAddressMode("connected");
    setRecipientAddressSource("connected");
    setRecipientImportedWalletName("");
    closeRecipientAddressDialog();
  }

  async function startRecipientWalletImport() {
    chooseRecipientDialogMode("wallet");
    if (!envPublic.WALLETCONNECT_PROJECT_ID) {
      setRecipientDialogError("Wallet import is unavailable right now. Paste or scan the address instead.");
      return;
    }

    const runId = recipientWalletImportRunRef.current + 1;
    recipientWalletImportRunRef.current = runId;
    setRecipientWalletImportLoading(true);
    setRecipientWalletImportQrDataUrl("");
    setRecipientWalletImportStatus("Preparing wallet import...");

    try {
      const recipientImport = await createRecipientWalletImport({
        projectId: envPublic.WALLETCONNECT_PROJECT_ID,
        chainId,
        origin: window.location.origin
      });

      if (recipientWalletImportRunRef.current !== runId) return;
      setRecipientWalletImportQrDataUrl(recipientImport.qrDataUrl);
      setRecipientWalletImportStatus("Scan with the recipient wallet, then approve address sharing.");

      const imported = await recipientImport.waitForAddress();
      if (recipientWalletImportRunRef.current !== runId) {
        await recipientImport.disconnect(imported.topic).catch(() => undefined);
        return;
      }

      await recipientImport.disconnect(imported.topic).catch(() => undefined);
      applyRecipientAddress(imported.address, "wallet_import", imported.walletName);
    } catch (error: any) {
      if (recipientWalletImportRunRef.current !== runId) return;
      setRecipientDialogError(normalizeRecipientImportError(error));
      setRecipientWalletImportStatus("");
    } finally {
      if (recipientWalletImportRunRef.current === runId) setRecipientWalletImportLoading(false);
    }
  }

  function applyRecipientAddress(rawValue: string, source: RecipientAddressSource = "pasted", walletName = "") {
    const parsedAddress = parseEvmAddressInput(rawValue);
    if (!isAddress(parsedAddress)) {
      setRecipientDialogError("Enter a valid recipient address.");
      if (source === "scanned") setRecipientQrStatus("QR code did not contain a valid recipient address.");
      return;
    }

    setRecipientAddress(parsedAddress);
    setRecipientAddressMode("custom");
    setRecipientAddressSource(source);
    setRecipientImportedWalletName(source === "wallet_import" ? walletName.trim() : "");
    closeRecipientAddressDialog();
  }

  function stopRecipientQrScanner() {
    if (recipientQrTimerRef.current) {
      window.clearInterval(recipientQrTimerRef.current);
      recipientQrTimerRef.current = null;
    }
    if (recipientQrStreamRef.current) {
      recipientQrStreamRef.current.getTracks().forEach((track) => track.stop());
      recipientQrStreamRef.current = null;
    }
    if (recipientQrVideoRef.current) {
      recipientQrVideoRef.current.srcObject = null;
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
          <p>{languageCopy.heroBody}</p>
        </div>
        <div className="limitOrderHeroAside">
          <div className="languageSwitch" role="group" aria-label="Limit order explanation level">
            {(Object.keys(LIMIT_ORDER_LANGUAGE_COPY) as LimitOrderLanguage[]).map((mode) => (
              <button
                className={`languageSwitchOption${languageMode === mode ? " languageSwitchOptionActive" : ""}`}
                type="button"
                key={mode}
                onClick={() => setLanguageMode(mode)}
              >
                {LIMIT_ORDER_LANGUAGE_COPY[mode].label}
              </button>
            ))}
          </div>
          <div className="limitOrderHeroFacts" aria-label="Limit order safeguards">
            <span>Wallet approval required</span>
            <span>Exact signed terms</span>
            <span>No custody of funds</span>
          </div>
        </div>
      </section>

      {tokenListNotice ? <div className="small limitOrderTokenNotice">{tokenListNotice}</div> : null}

      <div className="limitOrderShell">
        <section className="panel limitOrderFormPanel" aria-label="Limit order form">
          <div className="limitOrderFormHeader">
            <div>
              <h2>Create Limit Order</h2>
              <p>{languageCopy.formSubheading}</p>
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
            samples={rateSamples}
            status={rateSampleStatus}
            error={rateSampleError}
            onChange={setTargetRate}
          />

          {executionTokenNotice ? <div className="walletSupportNotice">{executionTokenNotice}</div> : null}

          <div className="recipientPanel">
            <div className="recipientHeader">
              <div className="label">Recipient address</div>
              <div
                className={`recipientSourcePill${recipientAddress.trim() ? "" : " recipientSourcePillEmpty"}`}
                title={recipientAddressDisplay.title}
                aria-label={recipientAddressDisplay.title}
              >
                <span className="recipientSourceDot" aria-hidden="true" />
                <span className="recipientSourceLabel">{recipientAddressDisplay.label}</span>
              </div>
            </div>
            <div className="recipientRow" title={recipientAddressDisplay.title} aria-label={recipientAddressDisplay.title}>
              <input
                className="input recipientAddressInput"
                value={recipientAddress}
                readOnly
                placeholder={address || "0x..."}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="recipientEditButton"
                type="button"
                title="Edit recipient address"
                aria-label="Edit recipient address"
                onClick={openRecipientAddressDialog}
              >
                <span aria-hidden="true">&#9998;</span>
              </button>
            </div>
            {!recipientValid && recipientAddress.trim() ? <div className="fieldError">Enter a valid recipient address.</div> : null}
          </div>

          {recipientDialogOpen ? (
            <div className="recipientDialogOverlay" role="presentation">
              <div className="recipientDialog" role="dialog" aria-modal="true" aria-labelledby="limit-recipient-dialog-title">
                <div className="recipientDialogHeader">
                  <h2 id="limit-recipient-dialog-title">Recipient address</h2>
                  <button
                    className="recipientDialogClose"
                    type="button"
                    aria-label="Close recipient address options"
                    onClick={closeRecipientAddressDialog}
                  >
                    &times;
                  </button>
                </div>

                <div className="recipientMethodGrid" role="group" aria-label="Recipient address options">
                  <button
                    className={`recipientMethodButton${recipientDialogMode === "paste" ? " recipientMethodButtonActive" : ""}`}
                    type="button"
                    onClick={() => chooseRecipientDialogMode("paste")}
                  >
                    Paste address
                  </button>
                  <button
                    className={`recipientMethodButton${recipientDialogMode === "scan" ? " recipientMethodButtonActive" : ""}`}
                    type="button"
                    onClick={() => chooseRecipientDialogMode("scan")}
                  >
                    Scan QR
                  </button>
                  <button
                    className={`recipientMethodButton${recipientDialogMode === "wallet" ? " recipientMethodButtonActive" : ""}`}
                    type="button"
                    onClick={() => {
                      void startRecipientWalletImport();
                    }}
                  >
                    Import wallet
                  </button>
                  <button className="recipientMethodButton" type="button" onClick={useConnectedRecipientAddress} disabled={!address}>
                    Current wallet
                  </button>
                </div>

                {recipientDialogMode === "paste" ? (
                  <form
                    className="recipientDialogBody"
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyRecipientAddress(recipientAddressDraft);
                    }}
                  >
                    <input
                      className="input"
                      value={recipientAddressDraft}
                      onChange={(event) => {
                        setRecipientAddressDraft(event.target.value);
                        setRecipientDialogError("");
                      }}
                      placeholder="0x..."
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {recipientDialogError ? <div className="fieldError">{recipientDialogError}</div> : null}
                    <div className="recipientDialogActions">
                      <button className="btn" type="button" onClick={closeRecipientAddressDialog}>
                        Cancel
                      </button>
                      <button className="btn btnPrimary" type="submit" disabled={!recipientAddressDraft.trim()}>
                        Save
                      </button>
                    </div>
                  </form>
                ) : recipientDialogMode === "scan" ? (
                  <div className="recipientDialogBody">
                    <div className="qrScannerFrame">
                      <video ref={recipientQrVideoRef} className="qrScannerVideo" muted playsInline />
                    </div>
                    {recipientQrStatus ? <div className="small">{recipientQrStatus}</div> : null}
                    {recipientDialogError ? <div className="fieldError">{recipientDialogError}</div> : null}
                    <div className="recipientDialogActions">
                      <button className="btn" type="button" onClick={closeRecipientAddressDialog}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="recipientDialogBody">
                    <div className="recipientWalletImportPanel">
                      {recipientWalletImportQrDataUrl ? (
                        <Image
                          className="recipientWalletImportQr"
                          src={recipientWalletImportQrDataUrl}
                          alt="Recipient wallet import QR"
                          width={260}
                          height={260}
                          unoptimized
                        />
                      ) : (
                        <div className="recipientWalletImportPlaceholder">
                          {recipientWalletImportLoading ? "Preparing..." : "Ready"}
                        </div>
                      )}
                    </div>
                    {recipientWalletImportStatus ? <div className="small">{recipientWalletImportStatus}</div> : null}
                    {recipientDialogError ? <div className="fieldError">{recipientDialogError}</div> : null}
                    <div className="recipientDialogActions">
                      <button className="btn" type="button" onClick={closeRecipientAddressDialog}>
                        Cancel
                      </button>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={() => {
                          void startRecipientWalletImport();
                        }}
                        disabled={recipientWalletImportLoading}
                      >
                        {recipientWalletImportQrDataUrl ? "Restart" : "Start"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <label className="limitOrderTerms">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>
              {languageCopy.terms}{" "}
              <Link href="/terms#limit-orders" target="_blank" rel="noreferrer">
                Read the Limit Order Terms
              </Link>
              {capability?.termsVersion ? (
                <small className="limitOrderTermsVersion">Version {capability.termsVersion}</small>
              ) : null}
            </span>
          </label>

          {orderNotice ? <div className="ok limitOrderMessage">{orderNotice}</div> : null}
          {orderError ? <div className="error limitOrderMessage">{orderError}</div> : null}
        </section>

        <aside className="panel limitOrderSummaryPanel" aria-label="Limit order summary">
          <div className={`limitOrderCapability ${capability?.automaticExecutionSupported ? "limitOrderCapabilityReady" : ""}`}>
            <strong>{capabilityTitle}</strong>
            <p>{capabilityBody}</p>
            {capability && capability.executionProvider !== "none" ? <span className="badge">{formatExecutionProvider(capability.executionProvider)}</span> : null}
          </div>

          <div className="limitOrderSummaryList">
            <SummaryRow label="You sell" value={sellAmount && sellToken ? `${sellAmount} ${sellToken.symbol}` : "-"} />
            <SummaryRow label="Target" value={targetRateLabel} />
            <SummaryRow
              label="Receive at target"
              value={estimatedReceive && executionBuyToken ? `${estimatedReceive} ${executionBuyToken.symbol}` : "-"}
            />
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
        <h2 id="limit-risk-title">{languageCopy.warningTitle}</h2>
        <ul>
          {languageCopy.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>

      <section className="panel limitOrderAudit">
        <h2>{languageCopy.securityTitle}</h2>
        <p>{languageCopy.securityBody}</p>
        <p className="small">{languageCopy.securityFootnote}</p>
      </section>

      <section className="panel limitOrderAudit">
        <div className="limitOrderSectionHeader">
          <h2>Your Limit Orders</h2>
          <button className="btn" type="button" disabled={!address || orderSaving || Boolean(cancellingOrderId)} onClick={() => void loadOrders()}>
            {ordersLoaded ? "Refresh" : "Load"}
          </button>
        </div>
        {!ordersLoaded ? (
          <p className="small">Load your signed orders after connecting and signing in.</p>
        ) : orders.length ? (
          <div className="limitOrderList">
            {orders.map((order) => (
              <div className="limitOrderItem" key={order.id}>
                <div className="limitOrderItemDetails">
                  <strong>{order.sellTokenSymbol} to {order.buyTokenSymbol}</strong>
                  <span className="small">{formatOrderTarget(order)} - expires {formatDate(order.expiresAt)}</span>
                </div>
                <div className="limitOrderItemActions">
                  <span className="badge">{formatOrderStatus(order.executionStatus)}</span>
                  {canCancelLimitOrder(order) ? (
                    <button
                      className="btn btnDanger limitOrderCancelButton"
                      type="button"
                      disabled={Boolean(cancellingOrderId)}
                      onClick={() => setOrderToCancel(order)}
                    >
                      {cancellingOrderId === order.id ? "Cancelling..." : "Cancel"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="small">No signed limit orders yet.</p>
        )}
      </section>

      {orderToCancel ? (
        <div className="recipientDialogOverlay" role="presentation">
          <div className="recipientDialog" role="dialog" aria-modal="true" aria-labelledby="cancel-order-dialog-title">
            <div className="recipientDialogHeader">
              <h2 id="cancel-order-dialog-title">
                Cancel {orderToCancel.sellTokenSymbol} to {orderToCancel.buyTokenSymbol}?
              </h2>
              <button
                className="recipientDialogClose"
                type="button"
                aria-label="Close cancellation dialog"
                onClick={() => setOrderToCancel(null)}
              >
                &times;
              </button>
            </div>
            <div className="recipientDialogBody">
              <p className="small">
                If this order has already reached the order service, your wallet may ask you to approve the
                cancellation. Network gas may apply. An order already being filled can still complete before
                cancellation takes effect.
              </p>
              <div className="recipientDialogActions">
                <button className="btn" type="button" onClick={() => setOrderToCancel(null)}>
                  Keep Order
                </button>
                <button
                  className="btn btnDanger"
                  type="button"
                  onClick={() => {
                    const selectedOrder = orderToCancel;
                    setOrderToCancel(null);
                    void cancelSavedLimitOrder(selectedOrder);
                  }}
                >
                  Continue Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function TargetRatePicker({
  buySymbol,
  sellSymbol,
  samples,
  status,
  error,
  value,
  onChange
}: {
  buySymbol: string;
  sellSymbol: string;
  samples: RateSample[];
  status: string;
  error: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const points = useMemo(() => buildRateSamplePoints(samples), [samples]);

  return (
    <div className="limitRateChart" aria-label="Target rate picker">
      <div className="limitRateChartHeader">
        <div>
          <strong>Recent live rates</strong>
          <span>Tap a point to use it as your target rate.</span>
        </div>
        <span className="badge">1 {sellSymbol} / {buySymbol}</span>
      </div>
      <div className="limitRateChartPlot">
        {points.length ? (
          points.map((point) => (
            <button
              className={`limitRatePoint${point.rate === value.trim() ? " limitRatePointActive" : ""}`}
              type="button"
              key={point.id}
              style={{ "--point-height": `${point.height}px` } as CSSProperties}
              onClick={() => onChange(point.rate)}
              title={`${point.rate} ${buySymbol} from ${point.providerName}`}
            >
              <span className="limitRateStem" aria-hidden="true" />
              <span className="limitRateDot" aria-hidden="true" />
              <span className="limitRateLabel">{point.label}</span>
              <span className="limitRateValue">{point.rate}</span>
            </button>
          ))
        ) : (
          <div className="limitRateEmpty">Live rate points will appear here.</div>
        )}
      </div>
      {error ? <p className="fieldError">{error}</p> : <p className="small">{status || "Recent quote samples appear after you connect a wallet."}</p>}
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

function toLimitOrderExecutionToken(token: TokenPickerOption | null, chainId: number): TokenInfo | null {
  if (!token) return null;
  if (!token.isNative || token.assetKind === "bitcoin" || token.addressFamily === "bitcoin") return token;
  const wrapped = WRAPPED_NATIVE_BY_CHAIN[chainId];
  if (!wrapped) return token;
  return {
    ...wrapped,
    networkId: token.networkId,
    networkName: token.networkName,
    searchAliases: [...(wrapped.searchAliases ?? []), token.symbol, token.name ?? ""].filter(Boolean)
  };
}

function buildExecutionTokenNotice(
  sellToken: TokenPickerOption | null,
  buyToken: TokenPickerOption | null,
  executionSellToken: TokenInfo | null,
  executionBuyToken: TokenInfo | null,
  languageMode: LimitOrderLanguage
): string {
  const changes = [
    sellToken?.isNative && executionSellToken && sellToken.symbol !== executionSellToken.symbol
      ? `${sellToken.symbol} uses ${executionSellToken.symbol}`
      : "",
    buyToken?.isNative && executionBuyToken && buyToken.symbol !== executionBuyToken.symbol
      ? `${buyToken.symbol} uses ${executionBuyToken.symbol}`
      : ""
  ].filter(Boolean);
  if (!changes.length) return "";
  if (languageMode === "simple") {
    return `${changes.join(" and ")} for limit orders. You may need enough wrapped token and approval in your wallet before it can fill.`;
  }
  if (languageMode === "crypto") {
    return `${changes.join(" and ")} because signed limit orders execute against wrapped ERC-20 tokens.`;
  }
  return `Native asset normalization: ${changes.join("; ")}. Signed orders use ERC-20 contract addresses.`;
}

function quoteToRateSample(body: any, sellToken: TokenInfo, buyToken: TokenInfo): RateSample | null {
  const buyAmountRaw = stringValue(body?.netBuyAmount) || stringValue(body?.buyAmount);
  const sellAmountRaw = stringValue(body?.sellAmount);
  if (!buyAmountRaw || !sellAmountRaw) return null;
  const buyAmount = Number(formatUnitsSafe(buyAmountRaw, buyToken.decimals));
  const sellAmount = Number(formatUnitsSafe(sellAmountRaw, sellToken.decimals));
  if (!Number.isFinite(buyAmount) || !Number.isFinite(sellAmount) || sellAmount <= 0 || buyAmount <= 0) return null;
  const numericRate = buyAmount / sellAmount;
  return {
    id: `${Date.now()}:${numericRate}`,
    rate: formatRateInput(numericRate),
    numericRate,
    providerName: stringValue(body?.providerName) || "Live quote",
    sampledAt: new Date().toISOString()
  };
}

function appendRateSample(current: RateSample[], sample: RateSample): RateSample[] {
  const previous = current[current.length - 1];
  const next = previous && previous.rate === sample.rate && previous.providerName === sample.providerName
    ? [...current.slice(0, -1), sample]
    : [...current, sample];
  return next.slice(-MAX_RATE_SAMPLES);
}

function buildRateSamplePoints(samples: RateSample[]) {
  if (!samples.length) return [];
  const rates = samples.map((sample) => sample.numericRate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const spread = max - min || Math.max(max * 0.01, 0.000001);
  return samples.map((sample, index) => ({
    ...sample,
    label: formatSampleTime(sample.sampledAt, index === samples.length - 1),
    height: 34 + ((sample.numericRate - min) / spread) * 82
  }));
}

function formatSampleTime(value: string, isLatest: boolean): string {
  if (isLatest) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseEvmAddressInput(value: string): string {
  const addressMatch = value.trim().match(/0x[a-fA-F0-9]{40}/);
  return addressMatch?.[0] ?? value.trim();
}

function buildRecipientAddressDisplay(params: {
  address: string;
  networkName: string;
  source: RecipientAddressSource;
  walletName?: string;
}): { label: string; title: string } {
  if (!params.address.trim()) {
    return {
      label: "No wallet selected",
      title: "No recipient address selected"
    };
  }
  const sourceLabel = getRecipientAddressSourceLabel(params.source);
  const label = [sourceLabel, params.walletName?.trim(), params.networkName].filter(Boolean).join(" - ");
  return {
    label,
    title: `${label}: ${params.address}`
  };
}

function getRecipientAddressSourceLabel(source: RecipientAddressSource): string {
  switch (source) {
    case "connected":
      return "Current wallet";
    case "pasted":
      return "Pasted address";
    case "scanned":
      return "Scanned QR";
    case "wallet_import":
      return "Imported wallet";
    default:
      return "Recipient";
  }
}

function getQrDetectorConstructor(): QrDetectorConstructor | null {
  const barcodeWindow = window as Window & { BarcodeDetector?: QrDetectorConstructor };
  return barcodeWindow.BarcodeDetector ?? null;
}

function formatCapabilityReason(reason: string, languageMode: LimitOrderLanguage): string {
  if (languageMode !== "simple") return reason;
  if (/native|contract|EVM/i.test(reason)) {
    return "This pair can be saved as an alert, but safe automatic execution is not available for it yet.";
  }
  if (/network/i.test(reason)) {
    return "Choose two tokens on the same supported network.";
  }
  return reason;
}

function formatCapabilityCheckError(error: unknown): string {
  if (error instanceof BackendClientError && error.status < 500 && error.message) return error.message;
  return "Could not check this pair right now. Try again in a moment.";
}

function formatRateSampleError(error: unknown): string {
  const message = normalizeWalletError(error);
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "Live rates are not available right now. Try again in a moment.";
  }
  if (/rate limit/i.test(message)) {
    return "Live rates are busy right now. Try again shortly.";
  }
  return message || "Live rates are not available right now.";
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

async function prepareLimitOrder(params: {
  executionProvider: string;
  chainId: number;
  maker: string;
  recipient: string;
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  expiresAt: Date;
}): Promise<PreparedLimitOrder> {
  if (params.executionProvider === COW_PROTOCOL_PROVIDER) {
    return buildCowOrder(params);
  }
  if (params.executionProvider === ONEINCH_PROVIDER) {
    const order = await buildOneInchOrder(params);
    const typedData = order.getTypedData(params.chainId);
    return {
      executionProvider: ONEINCH_PROVIDER,
      expiresAt: params.expiresAt,
      orderHash: order.getOrderHash(params.chainId),
      typedData,
      signedPayloadJson: JSON.stringify(
        {
          version: "1inch-limit-order-v4",
          provider: ONEINCH_PROVIDER,
          chainId: params.chainId,
          data: { ...order.build(), extension: order.extension.encode() },
          typedData,
          createdAt: new Date().toISOString()
        },
        jsonBigIntReplacer
      )
    };
  }
  throw new Error("This limit order provider is not supported yet.");
}

async function buildOneInchOrder(params: {
  chainId: number;
  maker: string;
  recipient: string;
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  expiresAt: Date;
}) {
  const { Address, LimitOrder: OneInchLimitOrder, MakerTraits, randBigInt } = await import("@1inch/limit-order-sdk");
  const expiration = BigInt(Math.floor(params.expiresAt.getTime() / 1000));
  const makerTraits = MakerTraits.default()
    .disablePartialFills()
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

async function buildCowOrder(params: {
  chainId: number;
  maker: string;
  recipient: string;
  sellToken: TokenInfo;
  buyToken: TokenInfo;
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  expiresAt: Date;
}): Promise<PreparedLimitOrder> {
  const { TypedDataEncoder } = await import("ethers");
  const validTo = Math.floor(params.expiresAt.getTime() / 1000);
  const message = {
    sellToken: params.sellToken.address,
    buyToken: params.buyToken.address,
    receiver: params.recipient.trim(),
    sellAmount: params.sellAmountRaw,
    buyAmount: params.minBuyAmountRaw,
    validTo,
    appData: COW_EMPTY_APP_DATA,
    feeAmount: "0",
    kind: "sell",
    partiallyFillable: false,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20"
  };
  const domain = {
    name: "Gnosis Protocol",
    version: "v2",
    chainId: params.chainId,
    verifyingContract: COW_SETTLEMENT_CONTRACT
  };
  const orderTypes = [
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "receiver", type: "address" },
    { name: "sellAmount", type: "uint256" },
    { name: "buyAmount", type: "uint256" },
    { name: "validTo", type: "uint32" },
    { name: "appData", type: "bytes32" },
    { name: "feeAmount", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "partiallyFillable", type: "bool" },
    { name: "sellTokenBalance", type: "string" },
    { name: "buyTokenBalance", type: "string" }
  ];
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      Order: orderTypes
    },
    primaryType: "Order",
    domain,
    message
  };
  const orderHash = TypedDataEncoder.hash(domain, { Order: orderTypes }, message);
  const data = {
    ...message,
    from: params.maker,
    signingScheme: "eip712"
  };

  return {
    executionProvider: COW_PROTOCOL_PROVIDER,
    expiresAt: params.expiresAt,
    orderHash,
    typedData,
    signedPayloadJson: JSON.stringify(
      {
        version: "cow-protocol-order-v1",
        provider: COW_PROTOCOL_PROVIDER,
        chainId: params.chainId,
        data,
        typedData,
        createdAt: new Date().toISOString()
      },
      jsonBigIntReplacer
    )
  };
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
  providerKind: ProviderKind,
  timeoutMessage = "Your wallet did not return a limit order signature."
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
    timeoutMessage
  );
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Wallet did not return a valid limit order signature.");
  }
  return signature;
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
    return order.executionError || "The order could not be accepted. Review the details and create a new order.";
  }
  if (order.executionStatus === "pending_submission") {
    return "Your signed order is saved and is being sent securely.";
  }
  if (order.executionError) return order.executionError;
  return "Your signed order is saved and will be submitted automatically when the order service is available.";
}

function cancellationStatusMessage(order: LimitOrderRecord): string {
  if (order.executionStatus === "cancelled") {
    return "Your limit order is cancelled.";
  }
  if (order.executionStatus === "cancellation_pending") {
    return "Cancellation was sent and is being confirmed. The order can still fill until the provider confirms it.";
  }
  if (order.executionStatus === "filled") {
    return "This order filled before cancellation took effect.";
  }
  return "The order changed while cancellation was being processed. Review its latest status.";
}

function canCancelLimitOrder(order: LimitOrderRecord): boolean {
  if (order.executionStatus === "failed") return !order.providerOrderId;
  return [
    "stored",
    "pending_submission",
    "submitted",
    "open",
    "partially_filled"
  ].includes(order.executionStatus);
}

function formatOrderTarget(order: LimitOrderRecord): string {
  return `target ${order.targetRate} ${order.buyTokenSymbol} per ${order.sellTokenSymbol}`;
}

function formatOrderStatus(status: string): string {
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatExecutionProvider(provider: string): string {
  if (provider === COW_PROTOCOL_PROVIDER) return "CoW Protocol";
  if (provider === ONEINCH_PROVIDER) return "1inch Limit Orders";
  return provider.replaceAll("_", " ");
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

function normalizeWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/reject|denied|cancel/i.test(message)) return "Request cancelled in wallet.";
  return message || "The request could not be completed. Please try again.";
}

function normalizeRecipientImportError(error: unknown): string {
  if (isUserRejectedWalletRequest(error)) return "Wallet import was cancelled.";
  const message = normalizeWalletError(error);
  if (/wallet import is unavailable/i.test(message)) return message;
  if (/valid address/i.test(message)) return message;
  if (/proposal|pairing|session/i.test(message)) {
    return "Could not complete wallet import. Try again, or paste the address.";
  }
  return message || "Could not import the wallet address.";
}
