"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { QuoteResponse } from "@/lib/types";
import { CHAINS, getAllowedChains, getChainById } from "@/lib/chains";
import {
  DEFAULT_TOKENS_BY_CHAIN,
  NATIVE_BITCOIN_CHAIN_ID,
  isNativeBitcoinToken,
  type TokenInfo
} from "@/lib/tokens";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress, isBitcoinMainnetAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { ensureExactTokenAllowance } from "@/lib/tokenAllowance";
import { validateSwapTransaction } from "@/lib/swapTransaction";
import {
  clearStoredBackendSession,
  isExpiredBackendSessionError,
  isSessionForWallet,
  readStoredBackendSession,
  writeStoredBackendSession
} from "@/lib/backendSession";
import { isUserRejectedWalletRequest, signPersonalMessage } from "@/lib/walletSigning";
import type {
  WalletBridgeActions,
  WalletBridgeOpenOptions,
  WalletBridgeState
} from "@/components/WalletBridge";
import { isAppKitConfigured } from "@/lib/walletConfig";
import { envPublic } from "@/lib/envPublic";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { createRecipientWalletImport } from "@/lib/recipientWalletImport";
import { swapLog } from "@/lib/swapLog";
import { listTokens } from "@/lib/tokenClient";
import {
  type PreparedPushSubscription,
  preparePushSubscription,
  pushSubscriptionToPayload,
  subscribeToPreparedPush,
  withPushSubscription
} from "@/lib/pushNotifications";
import { TokenPicker, type TokenPickerOption } from "@/components/TokenPicker";
import {
  buildFallbackTokensByChain,
  buildTokenPickerNetworks,
  buildTokenPickerOptions
} from "@/lib/tokenPickerOptions";
import {
  type PriceAlertRule,
  type FavoritePair,
  type BackendSession,
  type NotificationPreference,
  type SavePriceAlertRuleRequest,
  type SaveFavoritePairRequest,
  type SaveSwapHistoryRequest,
  type TelegramLinkStart,
  type SwapHistoryRecord,
  completeTelegramLink,
  deletePriceAlertRule,
  deleteFavoritePair,
  disablePushSubscriptions,
  getPushSubscriptionStatus,
  getFeatureFlags,
  getNotificationPreferences,
  getPushNotificationConfig,
  listPriceAlertRules,
  listFavoritePairs,
  listSwapHistory,
  logoutBackendSession,
  requestAuthNonce,
  savePriceAlertRule,
  saveFavoritePair,
  saveNotificationPreferences,
  savePushSubscription,
  saveSwapHistory,
  startTelegramLink,
  verifyAuthSignature
} from "@/lib/backendClient";

const WalletBridge = dynamic(() => import("@/components/WalletBridge"), { ssr: false });

type TxStatus = "idle" | "pending" | "submitted" | "confirmed" | "failed";
type ActiveView = "swap" | "alerts" | "favorites" | "preferences";
const QUOTE_TTL_SECONDS = 20;
const SWAP_TOUR_STORAGE_KEY = "wallet.swapAssistant.swapTour.v1";
const ACTIVE_VIEWS: ActiveView[] = ["swap", "alerts", "favorites", "preferences"];
const PUSH_DENIED_MESSAGE =
  "Push notifications are blocked for this site. Open your device or site settings, allow notifications, then try again.";

type DisplayToken = { address: string; symbol: string; decimals: number };
type QuoteValidationErrors = {
  amount?: string;
  sellToken?: string;
  buyToken?: string;
  recipientAddress?: string;
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
type WalletNamespace = "eip155" | "bip122";
type AddressFamily = NonNullable<TokenInfo["addressFamily"]> | "evm";
type RecipientAddressMode = "connected" | "custom";
type RecipientAddressSource = "connected" | "pasted" | "scanned" | "wallet_import";
type RecipientDialogMode = "paste" | "scan" | "wallet";
type WalletApprovalAction = "signIn" | "tokenApproval" | "swap";
type WalletApprovalNoticeTarget = "history" | "preferences" | "favorites";
type WalletSignPromptState = {
  target: WalletApprovalNoticeTarget;
  walletName: string;
  isMobile: boolean;
};
type PushDeviceState = "unknown" | "checking" | "linked" | "not-linked" | "not-supported";
type QrDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
type QrDetectorConstructor = new (options?: { formats?: string[] }) => QrDetector;
type AddressFamilyConfig = {
  walletNamespace: WalletNamespace;
  walletLabel: string;
  recipientLabel: string;
  placeholder: string;
  parse: (value: string) => string;
  isValid: (value: string) => boolean;
};
type PendingSwapLink = {
  chainId: number;
  toChainId: number;
  sellToken: string;
  buyToken: string;
  sellAmountRaw: string;
  autoQuote: boolean;
};
type TourAnchor = { left: number; top: number; width: number; height: number };
type TourStep = {
  target: string;
  title: string;
  body: string;
  mobileAnchor?: "tokenControls";
};

const SWAP_TOUR_STEPS: TourStep[] = [
  {
    target: "wallet",
    title: "Connect Wallet",
    body: "Connect your wallet so Swap Assistant can read your public address, prepare quotes, and save history for you. This is harmless: funds cannot move until you approve a later transaction inside your wallet app."
  },
  {
    target: "amount",
    title: "Start with the amount",
    body: "Enter how much you want to sell. Swap Assistant formats the amount for the selected token."
  },
  {
    target: "tokens",
    title: "Choose the pair",
    body: "Pick the token you sell and the token you receive. Each dropdown includes a network filter and search.",
    mobileAnchor: "tokenControls"
  },
  {
    target: "recipient",
    title: "Check the recipient",
    body: "This address receives the output token. Use your current wallet, paste an address, scan a QR code, or import an address."
  },
  {
    target: "quote",
    title: "Get a quote",
    body: "Swap Assistant compares available routes and shows the best quote it can find. This does not move funds."
  },
  {
    target: "summary",
    title: "Review before signing",
    body: "Confirm rate, service fee, network cost, and minimum received. Your wallet still asks before any transaction is approved."
  },
  {
    target: "favorite",
    title: "Save alerts",
    body: "Add the pair as a favorite to receive alerts when your target price is reached."
  }
];

const ADDRESS_FAMILY_CONFIG: Record<AddressFamily, AddressFamilyConfig> = {
  evm: {
    walletNamespace: "eip155",
    walletLabel: "wallet",
    recipientLabel: "recipient address",
    placeholder: "0x...",
    parse: parseEvmAddressInput,
    isValid: isAddress
  },
  bitcoin: {
    walletNamespace: "bip122",
    walletLabel: "Bitcoin wallet",
    recipientLabel: "Bitcoin recipient address",
    placeholder: "bc1...",
    parse: parseBitcoinAddressInput,
    isValid: isBitcoinMainnetAddress
  }
};

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const allowedChainIds = useMemo(
    () => new Set(allowedChains.map((allowedChain) => allowedChain.chainId)),
    [allowedChains]
  );
  const [walletBridgeState, setWalletBridgeState] = useState<WalletBridgeState>({ evmConnected: false });
  const [walletBridgeActions, setWalletBridgeActions] = useState<WalletBridgeActions | null>(null);
  const appKitAddress = walletBridgeState.evmAddress;
  const appKitConnected = walletBridgeState.evmConnected;
  const bitcoinAccountAddress = walletBridgeState.bitcoinAddress;
  const appKitProvider = walletBridgeState.evmProvider;
  const walletProviderType = walletBridgeState.providerType;
  const walletBridgeReady = Boolean(walletBridgeActions);
  const openAppKit = useCallback(
    async (options: WalletBridgeOpenOptions) => {
      if (!walletBridgeActions) throw new Error("Wallet options are still loading. Try again in a moment.");
      await walletBridgeActions.open(options);
    },
    [walletBridgeActions]
  );
  const disconnectAppKit = useCallback(
    async (options: Parameters<WalletBridgeActions["disconnect"]>[0]) => {
      if (!walletBridgeActions) return;
      await walletBridgeActions.disconnect(options);
    },
    [walletBridgeActions]
  );
  const isDryRun = envPublic.DISALLOW_MAINNET;
  const [activeView, setActiveView] = useState<ActiveView>("swap");
  const [featureFlags, setFeatureFlags] = useState({
    priceAlertsEnabled: false,
    limitOrdersEnabled: false
  });
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState<boolean>(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);
  const [buyChainId, setBuyChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);

  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletKind, setWalletKind] = useState<"injected" | "walletconnect" | null>(null);

  const [sellToken, setSellToken] = useState<string>("");
  const [buyToken, setBuyToken] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [recipientAddressMode, setRecipientAddressMode] = useState<RecipientAddressMode>("connected");
  const [recipientAddressSource, setRecipientAddressSource] = useState<RecipientAddressSource>("connected");
  const [recipientImportedWalletName, setRecipientImportedWalletName] = useState<string>("");
  const [recipientDialogOpen, setRecipientDialogOpen] = useState<boolean>(false);
  const [recipientDialogMode, setRecipientDialogMode] = useState<RecipientDialogMode>("paste");
  const [recipientAddressDraft, setRecipientAddressDraft] = useState<string>("");
  const [recipientDialogError, setRecipientDialogError] = useState<string>("");
  const [recipientQrStatus, setRecipientQrStatus] = useState<string>("");
  const [recipientWalletImportQrDataUrl, setRecipientWalletImportQrDataUrl] = useState<string>("");
  const [recipientWalletImportStatus, setRecipientWalletImportStatus] = useState<string>("");
  const [recipientWalletImportLoading, setRecipientWalletImportLoading] = useState<boolean>(false);
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
  const [walletRequestNotice, setWalletRequestNotice] = useState<string>("");
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
  const [preferencesAuthNotice, setPreferencesAuthNotice] = useState<string>("");
  const [walletSignPrompt, setWalletSignPrompt] = useState<WalletSignPromptState | null>(null);
  const historyRequestInFlightRef = useRef<boolean>(false);
  const backendSessionRequestRef = useRef<Promise<BackendSession> | null>(null);
  const walletSignPromptResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference | null>(null);
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState<boolean>(false);
  const [notificationPreferenceLoading, setNotificationPreferenceLoading] = useState<boolean>(false);
  const [notificationPreferenceSaving, setNotificationPreferenceSaving] = useState<boolean>(false);
  const [notificationPreferenceError, setNotificationPreferenceError] = useState<string>("");
  const [notificationPreferenceNotice, setNotificationPreferenceNotice] = useState<string>("");
  const [telegramEnabledDraft, setTelegramEnabledDraft] = useState<boolean>(false);
  const [pushEnabledDraft, setPushEnabledDraft] = useState<boolean>(false);
  const [pushPreferenceLoading, setPushPreferenceLoading] = useState<boolean>(false);
  const [pushPublicKey, setPushPublicKey] = useState<string>(() => envPublic.VAPID_PUBLIC_KEY);
  const [pushSupportMessage, setPushSupportMessage] = useState<string>("");
  const [pushDeviceState, setPushDeviceState] = useState<PushDeviceState>("unknown");
  const [currentPushEndpoint, setCurrentPushEndpoint] = useState<string>("");
  const [pushPreparationReady, setPushPreparationReady] = useState<boolean>(false);
  const preparedPushSubscriptionRef = useRef<PreparedPushSubscription | null>(null);
  const [reverseProfitThresholdPctDraft, setReverseProfitThresholdPctDraft] = useState<string>("1");
  const [reverseLossEnabledDraft, setReverseLossEnabledDraft] = useState<boolean>(false);
  const [reverseLossThresholdPctDraft, setReverseLossThresholdPctDraft] = useState<string>("5");
  const [telegramLink, setTelegramLink] = useState<TelegramLinkStart | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState<boolean>(false);
  const [telegramLinkChecking, setTelegramLinkChecking] = useState<boolean>(false);
  const notificationPreferenceRequestInFlightRef = useRef<boolean>(false);
  const [favoritePairs, setFavoritePairs] = useState<FavoritePair[]>([]);
  const [favoritePairsLoaded, setFavoritePairsLoaded] = useState<boolean>(false);
  const [favoritePairsLoading, setFavoritePairsLoading] = useState<boolean>(false);
  const [favoritePairSaving, setFavoritePairSaving] = useState<boolean>(false);
  const [favoritePairDeletingId, setFavoritePairDeletingId] = useState<string>("");
  const [favoritePairError, setFavoritePairError] = useState<string>("");
  const [favoritePairNotice, setFavoritePairNotice] = useState<string>("");
  const [favoriteAuthNotice, setFavoriteAuthNotice] = useState<string>("");
  const [favoriteAlertEnabledDraft, setFavoriteAlertEnabledDraft] = useState<boolean>(true);
  const [favoriteAlertDirectionDraft, setFavoriteAlertDirectionDraft] = useState<"above" | "below">("above");
  const [favoriteTargetRateDraft, setFavoriteTargetRateDraft] = useState<string>("");
  const [favoritePopoverOpen, setFavoritePopoverOpen] = useState<boolean>(false);
  const [favoritePopoverPosition, setFavoritePopoverPosition] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const favoritePairsRequestInFlightRef = useRef<boolean>(false);
  const [priceAlertRules, setPriceAlertRules] = useState<PriceAlertRule[]>([]);
  const [priceAlertRulesLoaded, setPriceAlertRulesLoaded] = useState<boolean>(false);
  const [priceAlertRulesLoading, setPriceAlertRulesLoading] = useState<boolean>(false);
  const [priceAlertRuleSaving, setPriceAlertRuleSaving] = useState<boolean>(false);
  const [priceAlertRuleDeletingId, setPriceAlertRuleDeletingId] = useState<string>("");
  const [priceAlertRuleError, setPriceAlertRuleError] = useState<string>("");
  const [priceAlertRuleNotice, setPriceAlertRuleNotice] = useState<string>("");
  const [priceAlertDirectionDraft, setPriceAlertDirectionDraft] = useState<"above" | "below">("above");
  const [priceAlertThresholdRateDraft, setPriceAlertThresholdRateDraft] = useState<string>("");
  const [priceAlertSlippagePctDraft, setPriceAlertSlippagePctDraft] = useState<string>("1");
  const priceAlertRulesRequestInFlightRef = useRef<boolean>(false);
  const [pendingSwapLink, setPendingSwapLink] = useState<PendingSwapLink | null>(null);
  const [pendingAutoQuoteLink, setPendingAutoQuoteLink] = useState<PendingSwapLink | null>(null);
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);
  const [tourAnchor, setTourAnchor] = useState<TourAnchor | null>(null);
  const quoteActionRef = useRef<HTMLDivElement>(null);
  const quoteDetailsRef = useRef<HTMLDivElement>(null);
  const quoteScrollPendingRef = useRef<boolean>(false);
  const autoQuoteNoticeShownRef = useRef<boolean>(false);
  const previousBuyTokenAddressRef = useRef<string>("");
  const recipientQrVideoRef = useRef<HTMLVideoElement>(null);
  const recipientQrStreamRef = useRef<MediaStream | null>(null);
  const recipientQrTimerRef = useRef<number | null>(null);
  const recipientWalletImportRunRef = useRef<number>(0);
  const applyRecipientAddressRef = useRef<(rawValue: string, source?: RecipientAddressSource, walletName?: string) => void>(
    () => undefined
  );

  const chain = useMemo(() => getChainById(selectedChainId), [selectedChainId]);
  const buyChain = useMemo(() => getChainById(buyChainId), [buyChainId]);
  const connectedWalletName = useMemo(
    () => getWalletDisplayName(walletBridgeState.evmWalletName, walletProviderType),
    [walletBridgeState.evmWalletName, walletProviderType]
  );
  const connectedWalletDisplay = useMemo(
    () =>
      buildConnectedWalletDisplay({
        address: walletAddress,
        accountLabel: getEmbeddedAccountLabel(walletBridgeState.embeddedUser),
        networkName: getWalletNetworkLabel(walletChainId, chain?.name),
        providerType: walletProviderType,
        walletName: connectedWalletName
      }),
    [
      chain?.name,
      connectedWalletName,
      walletAddress,
      walletBridgeState.embeddedUser,
      walletChainId,
      walletProviderType
    ]
  );
  const [tokensByChain, setTokensByChain] = useState<Record<number, TokenInfo[]>>(() =>
    buildFallbackTokensByChain(allowedChains.map((allowedChain) => allowedChain.chainId))
  );
  const [tokensLoadingByChain, setTokensLoadingByChain] = useState<Record<number, boolean>>({});
  const [tokenListNotice, setTokenListNotice] = useState<string>("");
  const loadedTokenChainsRef = useRef<Set<number>>(new Set());
  const tokenLoadControllersRef = useRef<Map<number, AbortController>>(new Map());
  const tokens = useMemo(
    () => tokensByChain[selectedChainId] ?? DEFAULT_TOKENS_BY_CHAIN[selectedChainId] ?? [],
    [selectedChainId, tokensByChain]
  );
  const buyTokens = useMemo(
    () => tokensByChain[buyChainId] ?? DEFAULT_TOKENS_BY_CHAIN[buyChainId] ?? [],
    [buyChainId, tokensByChain]
  );
  const tokensLoading = useMemo(
    () => allowedChains.some((allowedChain) => tokensLoadingByChain[allowedChain.chainId]),
    [allowedChains, tokensLoadingByChain]
  );
  const tokenPickerTokens = useMemo(
    () => buildTokenPickerOptions(allowedChains, tokensByChain),
    [allowedChains, tokensByChain]
  );
  const tokenPickerNetworks = useMemo(
    () => buildTokenPickerNetworks(allowedChains, tokenPickerTokens),
    [allowedChains, tokenPickerTokens]
  );

  const loadTokensForChain = useCallback((chainId: number) => {
    if (
      !allowedChainIds.has(chainId) ||
      loadedTokenChainsRef.current.has(chainId) ||
      tokenLoadControllersRef.current.has(chainId)
    ) return;

    const controller = new AbortController();
    tokenLoadControllersRef.current.set(chainId, controller);
    setTokensLoadingByChain((current) => ({ ...current, [chainId]: true }));
    void listTokens(chainId, controller.signal)
      .then((availableTokens) => {
        loadedTokenChainsRef.current.add(chainId);
        if (!availableTokens.length) return;
        setTokensByChain((current) => ({ ...current, [chainId]: availableTokens }));
      })
      .catch((error: any) => {
        if (error?.name === "AbortError") return;
        setTokenListNotice("Showing popular tokens while the full list is unavailable.");
      })
      .finally(() => {
        if (tokenLoadControllersRef.current.get(chainId) !== controller) return;
        tokenLoadControllersRef.current.delete(chainId);
        if (controller.signal.aborted) return;
        setTokensLoadingByChain((current) => ({ ...current, [chainId]: false }));
      });
  }, [allowedChainIds]);

  const handleTokenPickerNetworkChange = useCallback((networkId: string | "all") => {
    const chainId = parseEvmNetworkId(networkId);
    if (chainId) loadTokensForChain(chainId);
  }, [loadTokensForChain]);

  useEffect(() => {
    setTokensByChain((current) => {
      const next = { ...current };
      for (const allowedChain of allowedChains) {
        next[allowedChain.chainId] = next[allowedChain.chainId] ?? DEFAULT_TOKENS_BY_CHAIN[allowedChain.chainId] ?? [];
      }
      return next;
    });
  }, [allowedChains]);

  useEffect(() => {
    loadTokensForChain(selectedChainId);
    loadTokensForChain(buyChainId);
  }, [buyChainId, loadTokensForChain, selectedChainId]);

  useEffect(() => () => {
    tokenLoadControllersRef.current.forEach((controller) => controller.abort());
    tokenLoadControllersRef.current.clear();
  }, []);

  useEffect(() => {
    const parsedSwapLink = parseSwapLinkParams(window.location.search);
    const swapLink = parsedSwapLink ? resolveSwapLinkForUi(parsedSwapLink, allowedChains) : null;
    if (!swapLink) return;

    setPendingSwapLink(swapLink);
    setPendingAutoQuoteLink(swapLink.autoQuote ? swapLink : null);
    autoQuoteNoticeShownRef.current = false;
    setActiveView("swap");
    if (window.location.pathname !== "/swap") {
      window.history.replaceState(null, "", `/swap${window.location.search}`);
    }
    setSelectedChainId(swapLink.chainId);
    setBuyChainId(swapLink.toChainId);
    setSellToken(swapLink.sellToken);
    setBuyToken(swapLink.buyToken);
    setQuoteValidationVisible(false);
    clearQuoteState();
    setActionError("");
  }, [allowedChains]);

  useEffect(() => {
    if (pendingSwapLink) return;

    const sellTokenAvailable = tokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken));
    if (!sellTokenAvailable && tokens.length > 0) setSellToken(tokens[0]!.address);
  }, [tokens, sellToken, pendingSwapLink]);

  useEffect(() => {
    if (pendingSwapLink) return;

    const buyTokenAvailable = buyTokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken));
    const duplicatesSource =
      buyChainId === selectedChainId && normalizeTokenKey(buyToken) === normalizeTokenKey(sellToken);
    if ((!buyTokenAvailable || duplicatesSource) && buyTokens.length > 0) {
      const fallbackBuyToken = buyTokens.find(
        (token) => buyChainId !== selectedChainId || normalizeTokenKey(token.address) !== normalizeTokenKey(sellToken)
      );
      if (fallbackBuyToken) setBuyToken(fallbackBuyToken.address);
    }
  }, [buyChainId, buyToken, buyTokens, pendingSwapLink, selectedChainId, sellToken]);

  useEffect(() => {
    if (!allowedChains.some((allowedChain) => allowedChain.chainId === selectedChainId)) {
      setSelectedChainId(allowedChains[0]?.chainId ?? 11155111);
      setSellToken("");
      clearQuoteState();
      setActionError("");
      return;
    }
  }, [allowedChains, selectedChainId]);

  useEffect(() => {
    if (!allowedChains.some((allowedChain) => allowedChain.chainId === buyChainId)) {
      setBuyChainId(allowedChains[0]?.chainId ?? 11155111);
      setBuyToken("");
      clearQuoteState();
      setActionError("");
    }
  }, [allowedChains, buyChainId]);

  useEffect(() => {
    if (!walletChainId || !allowedChains.some((allowedChain) => allowedChain.chainId === walletChainId)) return;

    setSelectedChainId(walletChainId);
    setSellToken("");
    setQuote(null);
    setSelectedQuoteId("");
    setQuoteFetchedAtMs(null);
    setQuoteError("");
    setApprovalTxHash("");
    setSwapTxHash("");
    setSwapStatus("idle");
    setWalletRequestNotice("");
    setActionError("");
  }, [allowedChains, walletChainId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!quote || !quoteScrollPendingRef.current) return;

    quoteScrollPendingRef.current = false;
    window.requestAnimationFrame(() => {
      scrollQuoteIntoViewOnMobile(quoteActionRef.current, quoteDetailsRef.current);
    });
  }, [quote, quoteFetchedAtMs]);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags(envPublic.BACKEND_BASE_URL)
      .then((flags) => {
        if (!cancelled) setFeatureFlags(flags);
      })
      .catch(() => {
        if (!cancelled) setFeatureFlags({ priceAlertsEnabled: false, limitOrdersEnabled: false });
      })
      .finally(() => {
        if (!cancelled) setFeatureFlagsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const hashView = window.location.hash.replace("#", "");
      const view = (hashView === "auto-swap" ? "alerts" : hashView) as ActiveView;
      setActiveView(ACTIVE_VIEWS.includes(view) ? view : "swap");
    }

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (!featureFlagsLoaded || featureFlags.priceAlertsEnabled || activeView !== "alerts") return;
    setActiveView("swap");
    if (window.location.hash === "#auto-swap" || window.location.hash === "#alerts") {
      window.history.replaceState(null, "", "/swap");
    }
  }, [activeView, featureFlags.priceAlertsEnabled, featureFlagsLoaded]);

  useEffect(() => {
    if (activeView !== "swap") return;
    try {
      if (window.localStorage.getItem(SWAP_TOUR_STORAGE_KEY) === "done") return;
      const timer = window.setTimeout(() => setTourOpen(true), 650);
      return () => window.clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, [activeView]);

  useEffect(() => {
    if (!tourOpen) return;

    function updateTourAnchor() {
      const step = SWAP_TOUR_STEPS[tourStepIndex];
      const element = step ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      if (!element) {
        setTourAnchor(null);
        return;
      }

      element.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      window.setTimeout(() => {
        const rect = getTourAnchorRect(element, step);
        setTourAnchor({
          left: Math.max(8, rect.left),
          top: Math.max(8, rect.top),
          width: Math.max(1, Math.min(rect.width, window.innerWidth - 16)),
          height: Math.max(1, Math.min(rect.height, window.innerHeight - 16))
        });
      }, prefersReducedMotion() ? 0 : 220);
    }

    updateTourAnchor();
    window.addEventListener("resize", updateTourAnchor);
    window.addEventListener("scroll", updateTourAnchor, true);
    return () => {
      window.removeEventListener("resize", updateTourAnchor);
      window.removeEventListener("scroll", updateTourAnchor, true);
    };
  }, [tourOpen, tourStepIndex]);

  useEffect(() => {
    if (activeView !== "preferences" || !walletAddress || notificationPreferenceLoaded) return;
    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      void refreshNotificationPreferences();
    }
    // Load exactly when the Preferences view becomes active with an existing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, backendSession, notificationPreferenceLoaded, walletAddress]);

  useEffect(() => {
    if (activeView !== "preferences") return;
    let cancelled = false;

    async function preparePushNotifications() {
      let publicKey = envPublic.VAPID_PUBLIC_KEY;
      try {
        const config = await getPushNotificationConfig(envPublic.BACKEND_BASE_URL);
        publicKey = config.enabled ? config.vapidPublicKey.trim() : "";
      } catch {
        publicKey = envPublic.VAPID_PUBLIC_KEY;
      }

      if (cancelled) return;
      setPushPublicKey(publicKey);
      const supportMessage = getPushSupportMessage(publicKey);
      setPushSupportMessage(supportMessage);
      if (supportMessage) {
        setPushPreparationReady(false);
        preparedPushSubscriptionRef.current = null;
        return;
      }

      try {
        const prepared = await preparePushSubscription(publicKey);
        if (cancelled) return;
        preparedPushSubscriptionRef.current = prepared;
        setPushPreparationReady(true);
      } catch (error) {
        if (cancelled) return;
        preparedPushSubscriptionRef.current = null;
        setPushPreparationReady(false);
        setPushSupportMessage(normalizePushNotificationError(error));
      }
    }

    setPushPreparationReady(false);
    void preparePushNotifications();
    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "alerts" || !featureFlags.priceAlertsEnabled || !walletAddress || priceAlertRulesLoaded) return;
    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      void refreshPriceAlertRules();
    }
    // Load exactly when the Set Alerts view becomes active with an existing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, priceAlertRulesLoaded, backendSession, featureFlags.priceAlertsEnabled, walletAddress]);

  useEffect(() => {
    if (activeView !== "favorites" || !walletAddress || favoritePairsLoaded) return;
    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      void refreshFavoritePairs();
    }
    // Load exactly when the Favorites view becomes active with an existing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, backendSession, favoritePairsLoaded, walletAddress]);

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
      clearStoredBackendSession();
      setBackendSession(null);
      setWalletAddress(accounts?.[0] ?? "");
      if (accounts?.[0]) setConnectPromptVisible(false);
    };

    const onChainChanged = (hexChainId: string) => {
      const cid = Number.parseInt(hexChainId, 16);
      setWalletChainId(Number.isFinite(cid) ? cid : null);
    };

    const onDisconnect = () => {
      clearStoredBackendSession();
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
      setWalletKind(null);
      setBackendSession(null);
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
      resetNotificationPreferenceState();
      resetFavoritePairsState();
      resetPriceAlertRulesState();
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
      resetNotificationPreferenceState();
      resetFavoritePairsState();
      resetPriceAlertRulesState();
      return;
    }

    setBackendSession(stored);
    setDbSwapHistory([]);
    setHistoryLoaded(false);
    setHistoryError("");
    setHistoryNotice("");
    resetNotificationPreferenceState();
    resetFavoritePairsState();
    resetPriceAlertRulesState();
  }, [walletAddress, provider]);

  const sellTokenInfo = useMemo(
    () => tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken)),
    [tokens, sellToken]
  );
  const buyTokenInfo = useMemo(
    () => buyTokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken)),
    [buyTokens, buyToken]
  );

  useEffect(() => {
    if (
      !pendingSwapLink ||
      selectedChainId !== pendingSwapLink.chainId ||
      buyChainId !== pendingSwapLink.toChainId
    ) return;

    if (sellTokenInfo && buyTokenInfo) {
      if (pendingSwapLink.sellAmountRaw) {
        setAmountHuman(formatUnitsSafe(pendingSwapLink.sellAmountRaw, sellTokenInfo.decimals));
      }
      setPendingSwapLink(null);
      return;
    }

    const sourceLoadingKnown = Object.prototype.hasOwnProperty.call(tokensLoadingByChain, selectedChainId);
    const destinationLoadingKnown = Object.prototype.hasOwnProperty.call(tokensLoadingByChain, buyChainId);
    if (
      sourceLoadingKnown &&
      destinationLoadingKnown &&
      !tokensLoadingByChain[selectedChainId] &&
      !tokensLoadingByChain[buyChainId]
    ) {
      setPendingSwapLink(null);
    }
  }, [buyChainId, buyTokenInfo, pendingSwapLink, selectedChainId, sellTokenInfo, tokensLoadingByChain]);

  const sellTokenNetworkId = getTokenNetworkId(sellTokenInfo, selectedChainId);
  const buyTokenNetworkId = getTokenNetworkId(buyTokenInfo, buyChainId);
  const sameSwapNetwork = sellTokenNetworkId === buyTokenNetworkId;
  const connectedWallets = useMemo<Partial<Record<WalletNamespace, string>>>(
    () => ({
      eip155: walletAddress,
      bip122: bitcoinAccountAddress ?? ""
    }),
    [bitcoinAccountAddress, walletAddress]
  );
  const sourceWalletAddress = getTokenWalletAddress(sellTokenInfo, connectedWallets);
  const destinationWalletAddress = getTokenWalletAddress(buyTokenInfo, connectedWallets);
  const recipientConnectedWalletName = useMemo(() => {
    if (recipientAddressMode !== "connected" || !recipientAddress.trim()) return "";
    const walletNamespace = getTokenWalletNamespace(buyTokenInfo);
    return walletNamespace === "bip122"
      ? getWalletDisplayName(walletBridgeState.bitcoinWalletName, walletBridgeState.bitcoinWalletType)
      : getWalletDisplayName(walletBridgeState.evmWalletName, walletProviderType);
  }, [
    buyTokenInfo,
    recipientAddress,
    recipientAddressMode,
    walletBridgeState.bitcoinWalletName,
    walletBridgeState.bitcoinWalletType,
    walletBridgeState.evmWalletName,
    walletProviderType
  ]);
  const recipientAddressDisplay = useMemo(
    () =>
      buildRecipientAddressDisplay({
        address: recipientAddress,
        networkName: getTokenNetworkName(buyTokenInfo, buyChain?.name),
        source: recipientAddressMode === "connected" ? "connected" : recipientAddressSource,
        walletName: recipientAddressSource === "wallet_import" ? recipientImportedWalletName : recipientConnectedWalletName
      }),
    [
      buyTokenInfo,
      buyChain?.name,
      recipientAddress,
      recipientAddressMode,
      recipientAddressSource,
      recipientConnectedWalletName,
      recipientImportedWalletName
    ]
  );
  const hasAnyWalletAddress = Object.values(connectedWallets).some(Boolean);
  const sourceWalletNotice = getWalletSupportNotice({
    token: sellTokenInfo,
    side: "sell",
    networkName: getTokenNetworkName(sellTokenInfo, chain?.name),
    hasAnyWalletAddress,
    connectedWallets
  });
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
        sellTokenNetworkId,
        buyTokenNetworkId,
        sourceWalletAddress,
        recipientAddress,
        slippageBps
      }),
    [
      amountHuman,
      sellTokenInfo,
      buyTokenInfo,
      sellTokenNetworkId,
      buyTokenNetworkId,
      sourceWalletAddress,
      recipientAddress,
      slippageBps
    ]
  );
  const hasQuoteValidationErrors = useMemo(
    () => Object.values(quoteValidationErrors).some(Boolean),
    [quoteValidationErrors]
  );

  const canQuote = !!sourceWalletAddress && !hasQuoteValidationErrors;
  const quoteAgeSeconds = quoteFetchedAtMs ? Math.floor((nowMs - quoteFetchedAtMs) / 1000) : 0;
  const quoteSecondsRemaining = quote ? Math.max(0, QUOTE_TTL_SECONDS - quoteAgeSeconds) : 0;
  const isQuoteExpired = !!quote && quoteSecondsRemaining <= 0;
  const availableQuotes = useMemo(() => quote?.availableQuotes ?? (quote ? [quote] : []), [quote]);
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
      setRecipientAddress(destinationWalletAddress);
      setRecipientAddressSource("connected");
      setRecipientImportedWalletName("");
    }
  }, [destinationWalletAddress, recipientAddressMode]);

  useEffect(() => {
    const buyTokenAddress = `${buyTokenNetworkId}:${buyTokenInfo?.address ?? ""}`;
    if (previousBuyTokenAddressRef.current === buyTokenAddress) return;

    previousBuyTokenAddressRef.current = buyTokenAddress;
    setRecipientAddressMode("connected");
    setRecipientAddressSource("connected");
    setRecipientImportedWalletName("");
    setRecipientAddress(destinationWalletAddress);
    setRecipientDialogOpen(false);
    setRecipientDialogError("");
    cancelRecipientWalletImport();
  }, [buyTokenInfo?.address, buyTokenNetworkId, cancelRecipientWalletImport, destinationWalletAddress]);

  useEffect(() => {
    if (!recipientDialogOpen || recipientDialogMode !== "scan") {
      stopRecipientQrScanner();
      return;
    }

    let cancelled = false;
    const barcodeDetector = getQrDetectorConstructor();

    if (!barcodeDetector) {
      setRecipientQrStatus("QR scanning is not available in this browser. Paste the address instead.");
      return () => {
        cancelled = true;
        stopRecipientQrScanner();
      };
    }
    const BarcodeDetector = barcodeDetector;

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

        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        setRecipientQrStatus("Point your camera at the recipient QR code.");
        recipientQrTimerRef.current = window.setInterval(async () => {
          const video = recipientQrVideoRef.current;
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

          try {
            const codes = await detector.detect(video);
            const rawValue = codes[0]?.rawValue?.trim();
            if (!rawValue) return;

            applyRecipientAddressRef.current(rawValue, "scanned");
          } catch {
            setRecipientQrStatus("Could not read that QR code yet.");
          }
        }, 600);
      } catch {
        setRecipientQrStatus("Camera permission was not granted. Paste the address instead.");
      }
    }

    startRecipientQrScanner();
    return () => {
      cancelled = true;
      stopRecipientQrScanner();
    };
  }, [recipientDialogOpen, recipientDialogMode, buyTokenInfo]);

  function requireWalletForForm() {
    if (sourceWalletAddress) return true;

    const sourceNamespace = getTokenWalletNamespace(sellTokenInfo);
    if (sourceNamespace === "eip155") {
      setConnectPromptVisible(true);
    } else {
      setQuoteValidationVisible(true);
    }

    setQuoteError("");
    setActionError("");
    return false;
  }

  function revealQuoteValidation() {
    if (!sourceWalletAddress) requireWalletForForm();
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
    setWalletRequestNotice("");
  }

  function selectTokenForSide(side: "sell" | "buy", token: TokenPickerOption) {
    if (side === "sell") {
      const nextChainId = getQuoteChainIdForTokenSelection(token, selectedChainId);
      if (typeof nextChainId === "number" && nextChainId !== selectedChainId) {
        setSelectedChainId(nextChainId);
      }
      setSellToken(token.address);
      if (getTokenWalletNamespace(token) !== "eip155" || getTokenWalletAddress(token, connectedWallets)) {
        setConnectPromptVisible(false);
      }
    } else {
      const nextChainId = getQuoteChainIdForTokenSelection(token, buyChainId);
      if (typeof nextChainId === "number" && nextChainId !== buyChainId) {
        setBuyChainId(nextChainId);
      }
      setBuyToken(token.address);
      setRecipientAddressMode("connected");
      setRecipientAddressSource("connected");
      setRecipientImportedWalletName("");
    }
    clearQuoteState();
    setActionError("");
  }

  function swapSelectedTokens() {
    if (!requireWalletForForm()) return;

    const nextSellToken = buyTokenInfo;
    const nextBuyToken = sellTokenInfo;
    const nextSourceChainId = getTokenWalletNamespace(nextSellToken) === "eip155" ? buyChainId : selectedChainId;
    const nextDestinationChainId = getTokenWalletNamespace(nextBuyToken) === "eip155" ? selectedChainId : buyChainId;

    setSelectedChainId(nextSourceChainId);
    setBuyChainId(nextDestinationChainId);
    setSellToken(nextSellToken?.address ?? "");
    setBuyToken(nextBuyToken?.address ?? "");

    setRecipientAddressMode("connected");
    setRecipientAddressSource("connected");
    setRecipientImportedWalletName("");
    clearQuoteState();
    setActionError("");
  }

  async function openWalletForNamespace(namespace: WalletNamespace) {
    setActionError("");
    if (!isAppKitConfigured) {
      setActionError("Wallet connection is unavailable right now. Please try again later.");
      return;
    }
    if (!walletBridgeReady) {
      setActionError("Wallet options are loading. Try again in a moment.");
      return;
    }

    const connectedNamespaces: WalletNamespace[] = [
      ...(walletAddress ? (["eip155"] as const) : []),
      ...(bitcoinAccountAddress ? (["bip122"] as const) : [])
    ];

    if (connectedNamespaces.length > 0) {
      const shouldClearBackendSession = connectedNamespaces.includes("eip155");
      const sessionToLogout = shouldClearBackendSession ? backendSession ?? readStoredBackendSession() : null;
      if (sessionToLogout) {
        await logoutBackendSession(envPublic.BACKEND_BASE_URL, sessionToLogout).catch(() => undefined);
      }

      for (const connectedNamespace of connectedNamespaces) {
        try {
          await disconnectAppKit({ namespace: connectedNamespace });
        } catch {
          // Continue to the chooser; Reown may already have dropped the session.
        }
      }

      if (shouldClearBackendSession) {
        clearStoredBackendSession();
        setWalletAddress("");
        setWalletChainId(null);
        setProvider(null);
        setWalletKind(null);
        setBackendSession(null);
        setDbSwapHistory([]);
      }
      await waitMs(250);
    }

    await openAppKit({ view: "Connect", namespace });
  }

  async function openWalletChooser() {
    await openWalletForNamespace("eip155");
  }

  async function openBitcoinWalletChooser() {
    await openWalletForNamespace("bip122");
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
    if (!destinationWalletAddress) {
      setRecipientDialogError("Connect a compatible wallet first, or paste a recipient address.");
      return;
    }

    setRecipientAddress(destinationWalletAddress);
    setRecipientAddressMode("connected");
    setRecipientAddressSource("connected");
    setRecipientImportedWalletName("");
    setQuoteValidationVisible(false);
    closeRecipientAddressDialog();
    clearQuoteState();
  }

  async function startRecipientWalletImport() {
    chooseRecipientDialogMode("wallet");

    if (getTokenAddressFamily(buyTokenInfo) !== "evm") {
      setRecipientDialogError("Wallet import is available for Ethereum-compatible wallets. Paste or scan this address instead.");
      return;
    }

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
        chainId: buyChainId,
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
    } catch (e: any) {
      if (recipientWalletImportRunRef.current !== runId) return;
      setRecipientDialogError(normalizeRecipientImportError(e));
      setRecipientWalletImportStatus("");
    } finally {
      if (recipientWalletImportRunRef.current === runId) setRecipientWalletImportLoading(false);
    }
  }

  function applyRecipientAddress(rawValue: string, source: RecipientAddressSource = "pasted", walletName = "") {
    const parsedAddress = parseRecipientAddressInput(rawValue, buyTokenInfo);
    const validationError = validateRecipientAddress(parsedAddress, buyTokenInfo);
    if (validationError) {
      setRecipientDialogError(validationError);
      if (source === "scanned") setRecipientQrStatus("QR code did not contain a valid recipient address.");
      return;
    }

    setRecipientAddress(parsedAddress);
    setRecipientAddressMode("custom");
    setRecipientAddressSource(source);
    setRecipientImportedWalletName(source === "wallet_import" ? walletName.trim() : "");
    setQuoteValidationVisible(false);
    closeRecipientAddressDialog();
    clearQuoteState();
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

  async function onDisconnectWallet() {
    setActionError("");
    setHistoryError("");
    setHistoryNotice("");
    const sessionToLogout = backendSession ?? readStoredBackendSession();
    try {
      if (sessionToLogout) {
        await logoutBackendSession(envPublic.BACKEND_BASE_URL, sessionToLogout).catch(() => undefined);
      }
      await disconnectAppKit({ namespace: "eip155" });
    } catch {
      // Best-effort local cleanup still happens below.
    } finally {
      clearStoredBackendSession();
      setWalletAddress("");
      setWalletChainId(null);
      setProvider(null);
      setWalletKind(null);
      setBackendSession(null);
      setDbSwapHistory([]);
      resetNotificationPreferenceState();
      resetFavoritePairsState();
      clearQuoteState();
    }
  }

  function getProviderOrThrow(): Eip1193Provider {
    const p = provider;
    if (!p) throw new Error("Connect your wallet first.");
    return p;
  }

  async function confirmWalletSignIn(target: WalletApprovalNoticeTarget): Promise<void> {
    if (walletSignPromptResolverRef.current) {
      walletSignPromptResolverRef.current(false);
    }

    setWalletSignPrompt({
      target,
      walletName: connectedWalletName,
      isMobile: isMobileBrowser()
    });

    const approved = await new Promise<boolean>((resolve) => {
      walletSignPromptResolverRef.current = resolve;
    });
    walletSignPromptResolverRef.current = null;
    setWalletSignPrompt(null);
    if (!approved) throw new Error("Wallet sign-in was cancelled.");
  }

  function approveWalletSignPrompt() {
    walletSignPromptResolverRef.current?.(true);
  }

  function cancelWalletSignPrompt() {
    walletSignPromptResolverRef.current?.(false);
  }

  async function ensureBackendSession(noticeTarget: WalletApprovalNoticeTarget = "history"): Promise<BackendSession> {
    if (!walletAddress) throw new Error("Connect your wallet before saving swap history.");

    const stored = readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      setBackendSession(stored);
      return stored;
    }

    if (backendSessionRequestRef.current) return backendSessionRequestRef.current;

    const request = (async () => {
      const p = getProviderOrThrow();
      const setAuthNotice = getBackendAuthNoticeSetter(noticeTarget);
      const nonce = await requestAuthNonce(envPublic.BACKEND_BASE_URL, walletAddress);
      await confirmWalletSignIn(noticeTarget);
      try {
        setAuthNotice(buildWalletApprovalNotice(connectedWalletName, "signIn"));
        const signature = await signPersonalMessage({
          provider: p,
          walletAddress,
          message: nonce.message,
          providerKind: walletKind,
          setNotice: setAuthNotice,
          walletName: connectedWalletName
        });
        setAuthNotice("Thanks. Loading your saved data...");
        const session = await verifyAuthSignature(
          envPublic.BACKEND_BASE_URL,
          walletAddress,
          nonce.nonceId,
          signature
        );
        writeStoredBackendSession(session);
        setBackendSession(session);
        return session;
      } finally {
        setAuthNotice("");
      }
    })();

    backendSessionRequestRef.current = request;
    try {
      return await request;
    } finally {
      backendSessionRequestRef.current = null;
    }
  }

  function getBackendAuthNoticeSetter(target: WalletApprovalNoticeTarget): (message: string) => void {
    if (target === "preferences") return setPreferencesAuthNotice;
    if (target === "favorites") return setFavoriteAuthNotice;
    return setHistoryNotice;
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

  function resetNotificationPreferenceState() {
    setNotificationPreference(null);
    setNotificationPreferenceLoaded(false);
    setNotificationPreferenceLoading(false);
    setNotificationPreferenceSaving(false);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    setTelegramEnabledDraft(false);
    setPushEnabledDraft(false);
    setPushPreferenceLoading(false);
    setPushDeviceState("unknown");
    setCurrentPushEndpoint("");
    setReverseProfitThresholdPctDraft("1");
    setReverseLossEnabledDraft(false);
    setReverseLossThresholdPctDraft("5");
    setTelegramLink(null);
    setTelegramLinkLoading(false);
    setTelegramLinkChecking(false);
    notificationPreferenceRequestInFlightRef.current = false;
  }

  function resetFavoritePairsState() {
    setFavoritePairs([]);
    setFavoritePairsLoaded(false);
    setFavoritePairsLoading(false);
    setFavoritePairSaving(false);
    setFavoritePairDeletingId("");
    setFavoritePairError("");
    setFavoritePairNotice("");
    setFavoriteAuthNotice("");
    setFavoriteAlertEnabledDraft(true);
    setFavoriteAlertDirectionDraft("above");
    setFavoriteTargetRateDraft("");
    setFavoritePopoverOpen(false);
    favoritePairsRequestInFlightRef.current = false;
  }

  function resetPriceAlertRulesState() {
    setPriceAlertRules([]);
    setPriceAlertRulesLoaded(false);
    setPriceAlertRulesLoading(false);
    setPriceAlertRuleSaving(false);
    setPriceAlertRuleDeletingId("");
    setPriceAlertRuleError("");
    setPriceAlertRuleNotice("");
    setPriceAlertDirectionDraft("above");
    setPriceAlertThresholdRateDraft("");
    setPriceAlertSlippagePctDraft("1");
    priceAlertRulesRequestInFlightRef.current = false;
  }

  async function refreshNotificationPreferences() {
    if (notificationPreferenceRequestInFlightRef.current) return;
    notificationPreferenceRequestInFlightRef.current = true;
    setNotificationPreferenceLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = await ensureBackendSession("preferences");
      const preference = await getNotificationPreferences(envPublic.BACKEND_BASE_URL, session);
      applyNotificationPreference(preference);
      await refreshCurrentPushDeviceStatus(session);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setNotificationPreferenceLoading(false);
      setPreferencesAuthNotice("");
      notificationPreferenceRequestInFlightRef.current = false;
    }
  }

  function applyNotificationPreference(preference: NotificationPreference) {
    setNotificationPreference(preference);
    setNotificationPreferenceLoaded(true);
    setTelegramEnabledDraft(preference.telegramEnabled);
    setPushEnabledDraft(preference.pushEnabled);
    setReverseProfitThresholdPctDraft(formatSlippageBpsAsPercent(preference.reverseProfitThresholdBps));
    setReverseLossEnabledDraft(preference.reverseLossEnabled);
    setReverseLossThresholdPctDraft(formatSlippageBpsAsPercent(preference.reverseLossThresholdBps));
    if (preference.telegramChatId) setTelegramLink(null);
  }

  function getCurrentBackendSessionForWallet(): BackendSession | null {
    if (!walletAddress) return null;
    const session = backendSession ?? readStoredBackendSession();
    if (!session || !isSessionForWallet(session, walletAddress)) return null;
    if (!backendSession) setBackendSession(session);
    return session;
  }

  function getSignedInBackendSessionOrThrow(): BackendSession {
    const session = getCurrentBackendSessionForWallet();
    if (!session) {
      throw new Error("Sign in with your wallet before changing saved settings.");
    }
    return session;
  }

  async function getCurrentPushSubscriptionEndpoint(): Promise<string> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "";
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? "";
  }

  async function refreshCurrentPushDeviceStatus(session = getCurrentBackendSessionForWallet()) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushDeviceState("not-supported");
      setCurrentPushEndpoint("");
      return;
    }

    if (!session) {
      setPushDeviceState("unknown");
      setCurrentPushEndpoint("");
      return;
    }

    setPushDeviceState("checking");
    try {
      const endpoint = await getCurrentPushSubscriptionEndpoint();
      setCurrentPushEndpoint(endpoint);
      const status = await getPushSubscriptionStatus(envPublic.BACKEND_BASE_URL, session, endpoint);
      setPushDeviceState(endpoint && status.linked ? "linked" : "not-linked");
      setNotificationPreference((current) =>
        current
          ? {
              ...current,
              pushEnabled: status.walletSubscriptionCount > 0,
              pushSubscriptionCount: status.walletSubscriptionCount
            }
          : current
      );
      setPushEnabledDraft(status.walletSubscriptionCount > 0);
    } catch {
      setPushDeviceState("unknown");
    }
  }

  async function saveNotificationPreferenceSettings() {
    setNotificationPreferenceSaving(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      if (telegramEnabledDraft && !notificationPreference?.telegramChatId) {
        throw new Error("Connect Telegram before enabling Telegram alerts.");
      }
      if (pushEnabledDraft && !notificationPreference?.pushSubscriptionCount) {
        throw new Error("Enable push notifications on this device first.");
      }
      const profitThresholdBps = parseThresholdPctToBps(reverseProfitThresholdPctDraft);
      if (profitThresholdBps === null) throw new Error("Enter a profit alert threshold from 0% to 1000%.");
      const lossThresholdBps = parseThresholdPctToBps(reverseLossThresholdPctDraft);
      if (lossThresholdBps === null) throw new Error("Enter a loss alert threshold from 0% to 1000%.");
      const session = getSignedInBackendSessionOrThrow();
      const preference = await saveNotificationPreferences(envPublic.BACKEND_BASE_URL, session, {
        emailAddress: notificationPreference?.emailAddress ?? null,
        emailEnabled: notificationPreference?.emailEnabled ?? false,
        telegramEnabled: telegramEnabledDraft,
        pushEnabled: pushEnabledDraft,
        reverseProfitThresholdBps: profitThresholdBps,
        reverseLossEnabled: reverseLossEnabledDraft,
        reverseLossThresholdBps: lossThresholdBps,
        cooldownMinutes: notificationPreference?.cooldownMinutes ?? 360
      });
      applyNotificationPreference(preference);
      setNotificationPreferenceNotice("Notification preferences saved.");
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setNotificationPreferenceSaving(false);
      setPreferencesAuthNotice("");
    }
  }

  async function startTelegramConnection() {
    setTelegramLinkLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();
      const link = await startTelegramLink(envPublic.BACKEND_BASE_URL, session);
      setTelegramLink(link);
      setNotificationPreferenceNotice("Telegram opened with a one-time connection code. Tap Start, then return here.");
      if (link.deepLink) window.open(link.deepLink, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setTelegramLinkLoading(false);
      setPreferencesAuthNotice("");
    }
  }

  async function checkTelegramConnection() {
    setTelegramLinkChecking(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();
      const preference = await completeTelegramLink(envPublic.BACKEND_BASE_URL, session);
      applyNotificationPreference(preference);
      setNotificationPreferenceNotice("Telegram connected. Alerts are enabled for this wallet.");
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setTelegramLinkChecking(false);
      setPreferencesAuthNotice("");
    }
  }

  async function enablePushNotifications() {
    setPushPreferenceLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();

      const browserSupportMessage = getPushSupportMessage(pushPublicKey || envPublic.VAPID_PUBLIC_KEY || "configured");
      setPushSupportMessage(browserSupportMessage);
      if (browserSupportMessage) {
        throw new Error(browserSupportMessage);
      }

      const publicKey = pushPublicKey.trim();
      const supportMessage = getPushSupportMessage(publicKey);
      setPushSupportMessage(supportMessage);
      if (supportMessage) {
        throw new Error(supportMessage);
      }

      const prepared = preparedPushSubscriptionRef.current;
      if (!prepared || prepared.vapidPublicKey !== publicKey) {
        throw new Error("Push notifications are still getting ready. Please try again.");
      }

      setNotificationPreferenceNotice(
        Notification.permission === "default"
          ? "Choose Allow when your browser asks, then keep this page open for a moment."
          : "Connecting this device to push notifications..."
      );
      const subscription = await subscribeToPreparedPush(prepared);
      const payload = pushSubscriptionToPayload(subscription);
      const preference = await savePushSubscription(
        envPublic.BACKEND_BASE_URL,
        session,
        payload
      );
      applyNotificationPreference(preference);
      preparedPushSubscriptionRef.current = withPushSubscription(prepared, subscription);
      setCurrentPushEndpoint(subscription.endpoint);
      setPushDeviceState("linked");
      setNotificationPreferenceNotice("Push notifications enabled on this device.");
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setPushSupportMessage(getPushSupportMessage(pushPublicKey || envPublic.VAPID_PUBLIC_KEY));
      await refreshCurrentPushDeviceStatus(getCurrentBackendSessionForWallet());
      setNotificationPreferenceError(normalizePushNotificationError(e));
    } finally {
      setPushPreferenceLoading(false);
      setPreferencesAuthNotice("");
    }
  }

  async function disablePushNotifications(scope: "device" | "all" = "device") {
    setPushPreferenceLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();
      const registration = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration("/")
        : undefined;
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? currentPushEndpoint;
      if (scope === "device" && !endpoint) {
        await refreshCurrentPushDeviceStatus(session);
        setNotificationPreferenceNotice(
          "This device is not connected to push notifications for this wallet."
        );
        return;
      }
      const preference = await disablePushSubscriptions(
        envPublic.BACKEND_BASE_URL,
        session,
        scope === "device" ? endpoint : undefined
      );
      if (scope === "all" || (scope === "device" && endpoint === subscription?.endpoint)) {
        await subscription?.unsubscribe().catch(() => false);
        if (preparedPushSubscriptionRef.current) {
          preparedPushSubscriptionRef.current = withPushSubscription(
            preparedPushSubscriptionRef.current,
            null
          );
        }
      }
      applyNotificationPreference(preference);
      await refreshCurrentPushDeviceStatus(session);
      setNotificationPreferenceNotice(
        scope === "all"
          ? "Push notifications disabled for this wallet on all devices."
          : "Push notifications disabled on this device."
      );
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setPushPreferenceLoading(false);
      setPreferencesAuthNotice("");
    }
  }

  async function refreshPriceAlertRules() {
    if (priceAlertRulesRequestInFlightRef.current) return;
    priceAlertRulesRequestInFlightRef.current = true;
    setPriceAlertRulesLoading(true);
    setPriceAlertRuleError("");
    setPriceAlertRuleNotice("");
    try {
      const session = await ensureBackendSession();
      const rules = await listPriceAlertRules(envPublic.BACKEND_BASE_URL, session);
      setPriceAlertRules(rules);
      setPriceAlertRulesLoaded(true);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setPriceAlertRuleError(normalizeWalletError(e));
    } finally {
      setPriceAlertRulesLoading(false);
      priceAlertRulesRequestInFlightRef.current = false;
    }
  }

  async function saveCurrentPriceAlertRule() {
    setPriceAlertRuleSaving(true);
    setPriceAlertRuleError("");
    setPriceAlertRuleNotice("");
    try {
      const request = buildPriceAlertRuleRequest();
      const session = await ensureBackendSession();
      const saved = await savePriceAlertRule(envPublic.BACKEND_BASE_URL, session, request);
      setPriceAlertRules((rules) => [saved, ...rules.filter((rule) => rule.id !== saved.id)]);
      setPriceAlertRulesLoaded(true);
      setPriceAlertRuleNotice(`${saved.sellTokenSymbol} to ${saved.buyTokenSymbol} alert saved.`);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setPriceAlertRuleError(normalizeWalletError(e));
    } finally {
      setPriceAlertRuleSaving(false);
    }
  }

  async function removePriceAlertRule(rule: PriceAlertRule) {
    setPriceAlertRuleDeletingId(rule.id);
    setPriceAlertRuleError("");
    setPriceAlertRuleNotice("");
    try {
      const session = await ensureBackendSession();
      await deletePriceAlertRule(envPublic.BACKEND_BASE_URL, session, rule.id);
      setPriceAlertRules((rules) => rules.filter((item) => item.id !== rule.id));
      setPriceAlertRuleNotice(`${rule.sellTokenSymbol} to ${rule.buyTokenSymbol} alert removed.`);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setPriceAlertRuleError(normalizeWalletError(e));
    } finally {
      setPriceAlertRuleDeletingId("");
    }
  }

  function buildPriceAlertRuleRequest(): SavePriceAlertRuleRequest {
    if (!featureFlags.priceAlertsEnabled) throw new Error("Set Alerts is not available.");
    if (!sellTokenInfo || !buyTokenInfo) throw new Error("Select a pair before saving an alert.");
    if (!sameSwapNetwork) throw new Error("Alerts currently support token pairs on the same network.");
    if (normalizeTokenKey(sellTokenInfo.address) === normalizeTokenKey(buyTokenInfo.address)) {
      throw new Error("Choose two different tokens before saving an alert.");
    }

    const sellAmountRaw = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
    if (!sellAmountRaw) throw new Error("Enter an amount before saving an alert.");
    const thresholdRate = normalizePositiveDecimal(priceAlertThresholdRateDraft);
    if (!thresholdRate) throw new Error("Set a target rate before saving an alert.");
    const alertSlippageBps = parseSlippagePctToBps(priceAlertSlippagePctDraft);
    if (alertSlippageBps === null) throw new Error("Enter a slippage tolerance from 0% to 10%.");
    const recipientAddressConfig = getAddressFamilyConfig(buyTokenInfo);
    if (!recipientAddressConfig.isValid(recipientAddress)) {
      throw new Error(`Enter a valid ${recipientAddressConfig.recipientLabel}.`);
    }

    return {
      chainId: selectedChainId,
      sellTokenAddress: sellTokenInfo.address,
      sellTokenSymbol: sellTokenInfo.symbol,
      sellTokenDecimals: sellTokenInfo.decimals,
      buyTokenAddress: buyTokenInfo.address,
      buyTokenSymbol: buyTokenInfo.symbol,
      buyTokenDecimals: buyTokenInfo.decimals,
      sellAmountRaw,
      thresholdRate,
      alertDirection: priceAlertDirectionDraft,
      slippageBps: alertSlippageBps,
      recipientAddress: recipientAddress.trim(),
      executionMode: "notify_to_confirm"
    };
  }

  async function refreshFavoritePairs() {
    if (favoritePairsRequestInFlightRef.current) return;
    favoritePairsRequestInFlightRef.current = true;
    setFavoritePairsLoading(true);
    setFavoritePairError("");
    setFavoritePairNotice("");
    setFavoriteAuthNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();
      const pairs = await listFavoritePairs(envPublic.BACKEND_BASE_URL, session);
      setFavoritePairs(pairs);
      setFavoritePairsLoaded(true);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setFavoritePairError(normalizeWalletError(e));
    } finally {
      setFavoritePairsLoading(false);
      favoritePairsRequestInFlightRef.current = false;
    }
  }

  async function signInAndRefreshFavoritePairs() {
    if (favoritePairsRequestInFlightRef.current) return;
    favoritePairsRequestInFlightRef.current = true;
    setFavoritePairsLoading(true);
    setFavoritePairError("");
    setFavoritePairNotice("");
    setFavoriteAuthNotice("");
    try {
      const session = await ensureBackendSession("favorites");
      const pairs = await listFavoritePairs(envPublic.BACKEND_BASE_URL, session);
      setFavoritePairs(pairs);
      setFavoritePairsLoaded(true);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setFavoritePairError(normalizeWalletError(e));
    } finally {
      setFavoritePairsLoading(false);
      setFavoriteAuthNotice("");
      favoritePairsRequestInFlightRef.current = false;
    }
  }

  async function saveCurrentFavoritePair(): Promise<boolean> {
    setFavoritePairSaving(true);
    setFavoritePairError("");
    setFavoritePairNotice("");
    try {
      const request = buildFavoritePairRequest();
      const session = await ensureBackendSession("favorites");
      const saved = await saveFavoritePair(envPublic.BACKEND_BASE_URL, session, request);
      setFavoritePairs((pairs) => [saved, ...pairs.filter((pair) => pair.id !== saved.id)]);
      setFavoritePairsLoaded(true);
      setFavoritePairNotice(`${saved.sellTokenSymbol} to ${saved.buyTokenSymbol} favorite added.`);
      return true;
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setFavoritePairError(normalizeWalletError(e));
      return false;
    } finally {
      setFavoritePairSaving(false);
    }
  }

  async function removeFavoritePair(pair: FavoritePair) {
    setFavoritePairDeletingId(pair.id);
    setFavoritePairError("");
    setFavoritePairNotice("");
    try {
      const session = getSignedInBackendSessionOrThrow();
      await deleteFavoritePair(envPublic.BACKEND_BASE_URL, session, pair.id);
      setFavoritePairs((pairs) => pairs.filter((item) => item.id !== pair.id));
      setFavoritePairNotice(`${pair.sellTokenSymbol} to ${pair.buyTokenSymbol} removed.`);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setFavoritePairError(normalizeWalletError(e));
    } finally {
      setFavoritePairDeletingId("");
    }
  }

  function openFavoritePair(pair: FavoritePair, direction: "saved" | "reverse" = "saved") {
    const swapLink: PendingSwapLink = {
      chainId: pair.chainId,
      toChainId: pair.chainId,
      sellToken: direction === "reverse" ? pair.buyTokenAddress : pair.sellTokenAddress,
      buyToken: direction === "reverse" ? pair.sellTokenAddress : pair.buyTokenAddress,
      sellAmountRaw: "",
      autoQuote: false
    };

    setPendingSwapLink(swapLink);
    setPendingAutoQuoteLink(null);
    autoQuoteNoticeShownRef.current = false;
    setActiveView("swap");
    setSelectedChainId(swapLink.chainId);
    setBuyChainId(swapLink.toChainId);
    setSellToken(swapLink.sellToken);
    setBuyToken(swapLink.buyToken);
    setAmountHuman("");
    setQuoteValidationVisible(false);
    clearQuoteState();
    setActionError("");
    setFavoritePairNotice("");
    window.history.pushState(null, "", buildSwapLinkHref(swapLink));
  }

  function buildFavoritePairRequest(): SaveFavoritePairRequest {
    if (!sellTokenInfo || !buyTokenInfo) throw new Error("Select a pair before saving it.");
    if (!sameSwapNetwork) throw new Error("Favorites currently support token pairs on the same network.");
    if (normalizeTokenKey(sellTokenInfo.address) === normalizeTokenKey(buyTokenInfo.address)) {
      throw new Error("Choose two different tokens before saving a favorite pair.");
    }

    const targetRate = normalizePositiveDecimal(favoriteTargetRateDraft);
    if (favoriteAlertEnabledDraft && !targetRate) {
      throw new Error("Set a target rate before enabling favorite-pair alerts.");
    }

    return {
      chainId: selectedChainId,
      sellTokenAddress: sellTokenInfo.address,
      sellTokenSymbol: sellTokenInfo.symbol,
      sellTokenDecimals: sellTokenInfo.decimals,
      buyTokenAddress: buyTokenInfo.address,
      buyTokenSymbol: buyTokenInfo.symbol,
      buyTokenDecimals: buyTokenInfo.decimals,
      targetRate,
      alertDirection: favoriteAlertDirectionDraft,
      alertsEnabled: favoriteAlertEnabledDraft
    };
  }

  function openFavoritePopover(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!sellTokenInfo || !buyTokenInfo) return;
    const margin = 16;
    const gap = 10;
    const popoverWidth = Math.min(360, window.innerWidth - margin * 2);
    const popoverHeight = Math.min(360, window.innerHeight - margin * 2);
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(margin, Math.min(buttonRect.right - popoverWidth, window.innerWidth - popoverWidth - margin));
    const preferredBelowY = buttonRect.bottom + gap;
    const preferredAboveY = buttonRect.top - popoverHeight - gap;
    const unclampedY =
      preferredBelowY + popoverHeight <= window.innerHeight - margin ? preferredBelowY : preferredAboveY;
    const y = Math.max(margin, Math.min(unclampedY, window.innerHeight - popoverHeight - margin));
    if (currentFavoriteRate && !favoriteTargetRateDraft.trim()) {
      setFavoriteTargetRateDraft(currentFavoriteRate);
    }
    setFavoritePairError("");
    setFavoritePairNotice("");
    setFavoritePopoverPosition({ x, y });
    setFavoritePopoverOpen(true);
  }

  function closeFavoritePopover() {
    setFavoritePopoverOpen(false);
  }

  async function saveFavoriteFromPopover() {
    const saved = await saveCurrentFavoritePair();
    if (saved) closeFavoritePopover();
  }

  async function persistCurrentSwap(status: SaveSwapHistoryRequest["status"], txHash?: string) {
    if (!quote || !sellTokenInfo || !buyTokenInfo) return;

    let session = await ensureBackendSession();
    const request: SaveSwapHistoryRequest = {
      chainId: getTokenExecutionChainId(sellTokenInfo, selectedChainId),
      buyChainId: getTokenExecutionChainId(buyTokenInfo, buyChainId),
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
    if (!c?.rpcUrls?.length || !c.nativeCurrency) throw new Error("This network is not available in your wallet.");
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
    setWalletRequestNotice("");

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
        fromChainId: getTokenExecutionChainId(sellTokenInfo, selectedChainId),
        toChainId: getTokenExecutionChainId(buyTokenInfo, buyChainId),
        sellToken: sellTokenInfo.address,
        buyToken: buyTokenInfo.address,
        sellAmount,
        takerAddress: sourceWalletAddress,
        toAddress: recipientAddress.trim(),
        slippageBps
      });

      const res = await fetch(url, { method: "GET" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error ?? body?.message ?? "A quote is unavailable right now. Try again in a moment.";
        throw new Error(msg);
      }
      const fetchedQuote = body as QuoteResponse;
      quoteScrollPendingRef.current = true;
      setQuote(fetchedQuote);
      setSelectedQuoteId(fetchedQuote.quoteId ?? "");
      setQuoteFetchedAtMs(Date.now());
    } catch (e: any) {
      setQuoteError(normalizeWalletError(e));
    } finally {
      setQuoteLoading(false);
    }
  }

  useEffect(() => {
    if (!pendingAutoQuoteLink) return;
    if (activeView !== "swap") {
      setActiveView("swap");
      return;
    }
    if (!pendingAutoQuoteLink.sellAmountRaw) {
      setPendingAutoQuoteLink(null);
      return;
    }
    if (selectedChainId !== pendingAutoQuoteLink.chainId) {
      setSelectedChainId(pendingAutoQuoteLink.chainId);
      return;
    }
    if (buyChainId !== pendingAutoQuoteLink.toChainId) {
      setBuyChainId(pendingAutoQuoteLink.toChainId);
      return;
    }
    if (normalizeTokenKey(sellToken) !== normalizeTokenKey(pendingAutoQuoteLink.sellToken)) {
      setSellToken(pendingAutoQuoteLink.sellToken);
      return;
    }
    if (normalizeTokenKey(buyToken) !== normalizeTokenKey(pendingAutoQuoteLink.buyToken)) {
      setBuyToken(pendingAutoQuoteLink.buyToken);
      return;
    }
    if (!sellTokenInfo || !buyTokenInfo) return;

    const linkedAmountHuman = formatUnitsSafe(pendingAutoQuoteLink.sellAmountRaw, sellTokenInfo.decimals);
    if (linkedAmountHuman && amountHuman !== linkedAmountHuman) {
      setAmountHuman(linkedAmountHuman);
      return;
    }

    if (!sourceWalletAddress) {
      if (!autoQuoteNoticeShownRef.current) {
        if (getTokenWalletNamespace(sellTokenInfo) === "eip155") setConnectPromptVisible(true);
        setQuoteValidationVisible(true);
        setQuoteError("Connect your wallet to refresh this alert quote.");
        autoQuoteNoticeShownRef.current = true;
      }
      return;
    }

    if (hasQuoteValidationErrors) {
      if (!autoQuoteNoticeShownRef.current) {
        setQuoteValidationVisible(true);
        setQuoteError(
          quoteValidationErrors.recipientAddress
            ? "Add a recipient address to refresh this alert quote."
            : "Review the highlighted fields to refresh this alert quote."
        );
        autoQuoteNoticeShownRef.current = true;
      }
      return;
    }

    if (!canQuote || quoteLoading) return;

    autoQuoteNoticeShownRef.current = false;
    setPendingAutoQuoteLink(null);
    void fetchQuote();
    // fetchQuote intentionally stays outside the dependency list; this effect is
    // keyed by the alert-link state and should fire once when the form is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    amountHuman,
    buyChainId,
    buyToken,
    buyTokenInfo,
    canQuote,
    hasQuoteValidationErrors,
    pendingAutoQuoteLink,
    quoteLoading,
    quoteValidationErrors.recipientAddress,
    selectedChainId,
    sellToken,
    sellTokenInfo,
    sourceWalletAddress
  ]);

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
    if (!quote) throw new Error("Get a quote first.");
    if (!sellTokenInfo) throw new Error("Sell token not selected.");
    if (!walletAddress) throw new Error("Wallet not connected.");

    if (sellTokenInfo.isNative) return;

    const p = getProviderOrThrow();
    const spender = (quote.allowanceTarget as string | undefined) ?? quote.to;
    if (!spender || !isAddress(spender)) throw new Error("This quote cannot be approved safely. Refresh and try another route.");
    const needed = BigInt(quote.sellAmount);
    await ensureExactTokenAllowance({
      provider: p,
      ownerAddress: walletAddress,
      tokenAddress: sellTokenInfo.address,
      spenderAddress: spender,
      expectedChainId: selectedChainId,
      requiredAmount: needed,
      onWalletRequest: (phase) => {
        setWalletRequestNotice(
          phase === "reset"
            ? `Open ${normalizeWalletApprovalName(connectedWalletName)} and confirm clearing the previous token permission.`
            : buildWalletApprovalNotice(connectedWalletName, "tokenApproval")
        );
      },
      onTransactionSubmitted: (_phase, transactionHash) => {
        setApprovalTxHash(transactionHash);
        setWalletRequestNotice("Token approval submitted. Waiting for network confirmation.");
      }
    });
    setWalletRequestNotice("");
  }

  async function executeSwap() {
    setActionError("");
    setWalletRequestNotice("");
    if (!quote) {
      setActionError("Fetch a quote first.");
      return;
    }
    if (isQuoteExpired) {
      setActionError("Quote expired. Refresh the quote before continuing.");
      return;
    }
    if (quote.executionKind === "bitcoin-to-evm") {
      setActionError("BTC sell quotes are available now. Sending from Bitcoin is not available yet.");
      return;
    }

    try {
      const expectedFromChainId = getTokenExecutionChainId(sellTokenInfo, selectedChainId);
      const expectedToChainId = getTokenExecutionChainId(buyTokenInfo, buyChainId);
      if (
        quote.fromChainId !== expectedFromChainId ||
        quote.toChainId !== expectedToChainId
      ) {
        throw new Error("The selected networks changed. Refresh the quote before continuing.");
      }
      await ensureCorrectNetwork();

      if (isDryRun) {
        setSwapStatus("confirmed");
        setSwapTxHash("Preview saved. No transaction submitted.");
        try {
          await persistCurrentSwap("dry_run", "dry-run");
        } catch (historySaveError: any) {
          setHistoryError(normalizeWalletError(historySaveError));
        }
        return;
      }

      if (!walletAddress || !sellTokenInfo) {
        throw new Error("Reconnect your wallet and refresh the quote before continuing.");
      }
      const expectedSellAmountRaw = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
      if (!expectedSellAmountRaw) throw new Error("Enter a valid swap amount and refresh the quote.");
      const p = getProviderOrThrow();
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(p);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      const transaction = validateSwapTransaction({
        quote,
        expectedSellAmountRaw,
        sellTokenIsNative: Boolean(sellTokenInfo.isNative),
        expectedWalletAddress: walletAddress,
        signerAddress
      });

      await ensureAllowanceAndApproveIfNeeded();

      try {
        await provider.call({
          from: signerAddress,
          ...transaction
        });
      } catch (e: any) {
        throw new Error(`This swap could not be prepared safely: ${normalizeWalletError(e)}`);
      }

      let gasLimit: bigint | null = null;
      try {
        const estimated = await signer.estimateGas(transaction);
        gasLimit = (estimated * 120n) / 100n;
      } catch {
        if (quote.gas) gasLimit = (BigInt(quote.gas) * 120n) / 100n;
      }

      setSwapStatus("pending");
      setWalletRequestNotice(buildWalletApprovalNotice(connectedWalletName, "swap"));
      const tx = await signer.sendTransaction({
        ...transaction,
        gasLimit: gasLimit ?? undefined
      });

      setWalletRequestNotice("");
      setSwapStatus("submitted");
      setSwapTxHash(tx.hash);
      swapLog.add({ txHash: tx.hash, walletAddress, timestampMs: Date.now() });

      const receipt = await tx.wait();
      if (receipt?.status === 1) {
        const historyStatus = ["evm-cross-chain", "evm-to-bitcoin"].includes(quote.executionKind ?? "")
          ? "submitted"
          : "confirmed";
        setSwapStatus(historyStatus);
        try {
          await persistCurrentSwap(historyStatus, tx.hash);
        } catch (historySaveError: any) {
          setHistoryError(normalizeWalletError(historySaveError));
        }
      } else setSwapStatus("failed");
    } catch (e: any) {
      setWalletRequestNotice("");
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
    const networkFeeToken = quote.networkFeeToken ? tokenMetadataToDisplay(quote.networkFeeToken) : nativeToken;
    const sellDisplayToken = tokenInfoToDisplay(sellTokenInfo);
    const buyDisplayToken = tokenInfoToDisplay(buyTokenInfo);
    const tokenForAddress = (address: string): DisplayToken =>
      resolveDisplayToken(address, [...tokens, ...buyTokens], nativeToken);

    const sellHuman = formatTokenAmount(quote.sellAmount, sellDisplayToken);
    const grossBuyAmount = stringValue(quote.grossBuyAmount) || quote.buyAmount;
    const minBuyAmount = stringValue(quote.minBuyAmount);
    const routeLines = collectRouteLines(quote);
    const gasUnits = stringValue(quote.gas);
    const gasPriceWei = stringValue(quote.gasPrice);
    const networkFeeWei = stringValue(quote.totalNetworkFee) || multiplyIntegerStrings(gasUnits, gasPriceWei);
    const networkFeeLine = networkFeeWei
      ? {
          label: "Network fee",
          amount: networkFeeWei,
          token: networkFeeToken,
          display: formatTokenAmount(networkFeeWei, networkFeeToken)
        }
      : null;
    const swapFeeLines = collectFeeLines(quote, tokenForAddress).map((fee) =>
      withBuyTokenEquivalent(fee, sellDisplayToken, buyDisplayToken, quote.sellAmount, grossBuyAmount)
    );
    const buyTokenFeesDeducted = sumFeesChargedInToken(swapFeeLines, buyDisplayToken);
    const netBuyAmount = stringValue(quote.netBuyAmount) || subtractIntegerStrings(grossBuyAmount, buyTokenFeesDeducted);
    const netMinBuyAmount = minBuyAmount;
    const networkCost = networkFeeLine?.display ?? "Not provided";
    const platformFeeBps = numberValue(quote.platformFeeBps);
    const platformFeeLabel = platformFeeBps > 0 ? formatFeeBps(platformFeeBps) : "";
    const swapFeeTotal = swapFeeLines.length ? formatConvertedFeeTotal(swapFeeLines, buyDisplayToken) : platformFeeLabel || "None";
    const warnings = buildQuoteWarnings({
      quote,
      slippageBps,
      buyTokenFeesDeducted,
      grossBuyAmount
    });

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
      platformFeeLabel,
      warnings
    };
  }, [quote, sellTokenInfo, buyTokenInfo, chain, tokens, buyTokens, rateInverted, slippageBps]);

  const connectHint = useMemo(() => {
    if (walletAddress) return "";
    return "Choose a browser wallet or connect from your phone.";
  }, [walletAddress]);
  const currentFavoriteRate = useMemo(() => {
    if (!quote || !sellTokenInfo || !buyTokenInfo) return "";
    const buyAmount = stringValue(quote.netBuyAmount) || stringValue(quote.grossBuyAmount) || quote.buyAmount;
    return calculatePairRate(quote.sellAmount, tokenInfoToDisplay(sellTokenInfo), buyAmount, tokenInfoToDisplay(buyTokenInfo));
  }, [buyTokenInfo, quote, sellTokenInfo]);
  const priceAlertCurrentAmount = useMemo(() => {
    if (!sellTokenInfo) return "";
    const amountRaw = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
    if (!amountRaw) return "";
    return `${formatTokenAmount(amountRaw, tokenInfoToDisplay(sellTokenInfo))}`;
  }, [amountHuman, sellTokenInfo]);
  const priceAlertModeHelper = "You will receive an alert with a prefilled swap link when the target is reached.";
  const currentFavoritePairCount = useMemo(
    () =>
      favoritePairs.filter(
        (pair) =>
          sameSwapNetwork &&
          pair.chainId === selectedChainId &&
          normalizeTokenKey(pair.sellTokenAddress) === normalizeTokenKey(sellToken) &&
          normalizeTokenKey(pair.buyTokenAddress) === normalizeTokenKey(buyToken)
      ).length,
    [buyToken, favoritePairs, sameSwapNetwork, selectedChainId, sellToken]
  );
  const favoritePairSelected = useMemo(
    () =>
      !!sellTokenInfo &&
      !!buyTokenInfo &&
      sameSwapNetwork &&
      normalizeTokenKey(sellTokenInfo.address) !== normalizeTokenKey(buyTokenInfo.address),
    [buyTokenInfo, sameSwapNetwork, sellTokenInfo]
  );
  const favoriteTargetHelper = useMemo(() => {
    if (!sellTokenInfo || !buyTokenInfo) return "";
    if (currentFavoriteRate) {
      return `Current quoted rate: ${formatDecimal(currentFavoriteRate, 8)} ${buyTokenInfo.symbol} per ${sellTokenInfo.symbol}`;
    }
    return `1 ${sellTokenInfo.symbol} in ${buyTokenInfo.symbol}`;
  }, [buyTokenInfo, currentFavoriteRate, sellTokenInfo]);

  useEffect(() => {
    setFavoriteTargetRateDraft("");
    setFavoriteAlertDirectionDraft("above");
    setFavoriteAlertEnabledDraft(true);
    setFavoritePairError("");
    setFavoritePairNotice("");
    setFavoritePopoverOpen(false);
    setPriceAlertThresholdRateDraft("");
    setPriceAlertDirectionDraft("above");
    setPriceAlertRuleError("");
    setPriceAlertRuleNotice("");
  }, [buyChainId, selectedChainId, sellToken, buyToken]);

  useEffect(() => {
    if (currentFavoriteRate && !favoriteTargetRateDraft.trim()) {
      setFavoriteTargetRateDraft(currentFavoriteRate);
    }
    if (currentFavoriteRate && !priceAlertThresholdRateDraft.trim()) {
      setPriceAlertThresholdRateDraft(currentFavoriteRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFavoriteRate, favoriteTargetRateDraft]);

  useEffect(() => {
    if (slippageBps !== null) setPriceAlertSlippagePctDraft(formatSlippageBpsAsPercent(slippageBps));
  }, [slippageBps]);

  function startSwapTour() {
    setActiveView("swap");
    setTourStepIndex(0);
    setTourOpen(true);
  }

  function closeSwapTour(markDone = true) {
    setTourOpen(false);
    setTourAnchor(null);
    if (markDone) {
      try {
        window.localStorage.setItem(SWAP_TOUR_STORAGE_KEY, "done");
      } catch {
        // The tour can still close when storage is unavailable.
      }
    }
  }

  function goToNextTourStep() {
    if (tourStepIndex >= SWAP_TOUR_STEPS.length - 1) {
      closeSwapTour(true);
      return;
    }
    setTourStepIndex((current) => Math.min(current + 1, SWAP_TOUR_STEPS.length - 1));
  }

  function goToPreviousTourStep() {
    setTourStepIndex((current) => Math.max(0, current - 1));
  }

  const historySigning = historyLoading && !backendSession;
  const historySignWalletName = connectedWalletName || connectedWalletDisplay.primary || "your wallet";
  const historySignNotice =
    historyNotice || buildWalletApprovalNotice(historySignWalletName, "signIn");
  const preferencesBusy =
    notificationPreferenceLoading ||
    notificationPreferenceSaving ||
    telegramLinkLoading ||
    telegramLinkChecking ||
    pushPreferenceLoading;
  const signedInBackendSession =
    walletAddress && backendSession && isSessionForWallet(backendSession, walletAddress) ? backendSession : null;
  const preferencesSignedIn = Boolean(signedInBackendSession);
  const favoritesSignedIn = Boolean(signedInBackendSession);
  const preferencesSigning = preferencesBusy && !preferencesSignedIn && Boolean(preferencesAuthNotice);
  const preferencesSignNotice =
    preferencesAuthNotice || buildWalletApprovalNotice(historySignWalletName, "signIn");
  const favoriteBusy = favoritePairsLoading || favoritePairSaving || Boolean(favoritePairDeletingId);
  const favoriteSigning = favoriteBusy && !favoritesSignedIn && Boolean(favoriteAuthNotice);
  const favoriteSignNotice = favoriteAuthNotice || buildWalletApprovalNotice(historySignWalletName, "signIn");
  const pushWalletSubscriptionCount = notificationPreference?.pushSubscriptionCount ?? 0;
  const pushWalletEnabled = Boolean(notificationPreference?.pushEnabled && pushWalletSubscriptionCount > 0);
  const pushDeviceLinked = pushDeviceState === "linked";
  const pushStatusText = getPushDeviceStatusText(pushSupportMessage, pushDeviceState, pushWalletSubscriptionCount);
  const swapBusy = swapStatus === "pending" || swapStatus === "submitted" || Boolean(walletRequestNotice);

  return (
    <div className="container">
      {isAppKitConfigured ? (
        <WalletBridge onState={setWalletBridgeState} onActions={setWalletBridgeActions} />
      ) : null}
      <div className="header">
        <div className="headerTop">
          <div className="headerCopy">
            <h1 className="h1">Swap Assistant</h1>
            <div className="subtle">Your Personal Swap Assistant. Get the best price for your swaps.</div>
          </div>
          <div className="walletActions" data-tour="wallet">
            {walletAddress ? (
              <div className="connectedWalletShell">
                <button
                  className="connectedWalletButton"
                  type="button"
                  onClick={() => {
                    void openAppKit({ view: "Account", namespace: "eip155" });
                  }}
                  title={connectedWalletDisplay.title}
                  aria-label={connectedWalletDisplay.title}
                >
                  <span className="walletStatusDot" aria-hidden="true" />
                  <span className="connectedWalletText">
                    <span className="connectedWalletName">{connectedWalletDisplay.primary}</span>
                    <span className="connectedWalletMeta">{connectedWalletDisplay.secondary}</span>
                  </span>
                </button>
                <button className="btn walletDisconnectButton" onClick={onDisconnectWallet}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btnPrimary" onClick={openWalletChooser} disabled={!walletBridgeReady}>
                {!isAppKitConfigured
                  ? "Wallet unavailable"
                  : walletBridgeReady
                    ? "Connect Wallet"
                    : "Preparing Wallets..."}
              </button>
            )}
            {connectPromptVisible && !walletAddress ? (
              <div className="connectNudge">
                <strong>Connect wallet first</strong>
                <span>Connect your wallet to get a quote or change swap details.</span>
              </div>
            ) : null}
          </div>
        </div>
        <nav className="appNav" aria-label="Main navigation">
          <ul className="appMenu">
            <li>
              <Link className="appMenuLink" href="/">
                Intro
              </Link>
            </li>
            <li>
              <a
                className={`appMenuLink${activeView === "swap" ? " appMenuLinkActive" : ""}`}
                href="/swap"
                aria-current={activeView === "swap" ? "page" : undefined}
                onClick={() => setActiveView("swap")}
              >
                Swap
              </a>
            </li>
            <li>
              <a
                className={`appMenuLink${activeView === "favorites" ? " appMenuLinkActive" : ""}`}
                href="#favorites"
                aria-current={activeView === "favorites" ? "page" : undefined}
                onClick={() => setActiveView("favorites")}
              >
                Favorites
              </a>
            </li>
            <li>
              {featureFlags.limitOrdersEnabled ? (
                <Link className="appMenuLink" href="/limit-orders">
                  Limit Orders
                </Link>
              ) : null}
            </li>
            {featureFlags.priceAlertsEnabled ? (
              <li>
                <a
                  className={`appMenuLink${activeView === "alerts" ? " appMenuLinkActive" : ""}`}
                  href="#alerts"
                  aria-current={activeView === "alerts" ? "page" : undefined}
                  onClick={() => setActiveView("alerts")}
                >
                  Set Alerts
                </a>
              </li>
            ) : null}
            <li>
              <a
                className={`appMenuLink${activeView === "preferences" ? " appMenuLinkActive" : ""}`}
                href="#preferences"
                aria-current={activeView === "preferences" ? "page" : undefined}
                onClick={() => setActiveView("preferences")}
              >
                Preferences
              </a>
            </li>
            <li>
              <button className="appMenuLink appMenuButton" type="button" onClick={startSwapTour}>
                Guide
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {!walletAddress ? <div className="small" style={{ marginBottom: 12 }}>{connectHint}</div> : null}

      {activeView === "swap" ? (
        <>
      <div className="grid">
        <div className="panel">
          <div data-tour="amount">
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

          <div className="tokenPairRow" style={{ marginTop: 12 }} data-tour="tokens">
            <div>
              <TokenPicker
                label="Sell token"
                value={sellToken}
                selectedNetworkId={sellTokenNetworkId}
                networks={tokenPickerNetworks}
                tokens={tokenPickerTokens}
                loading={tokensLoading}
                onNetworkChange={handleTokenPickerNetworkChange}
                onChange={(token) => {
                  selectTokenForSide("sell", token);
                }}
                invalid={quoteValidationVisible && !!quoteValidationErrors.sellToken}
                describedBy="sell-token-error"
              />
              {quoteValidationVisible && quoteValidationErrors.sellToken ? (
                <div className="fieldError" id="sell-token-error">
                  {quoteValidationErrors.sellToken}
                </div>
              ) : null}
              {sourceWalletNotice ? (
                <WalletSupportNotice
                  message={sourceWalletNotice.message}
                  actionLabel={sourceWalletNotice.actionLabel}
                  onAction={sourceWalletNotice.walletNamespace === "bip122" ? openBitcoinWalletChooser : openWalletChooser}
                />
              ) : null}
            </div>

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

            <div>
              <TokenPicker
                label="Buy token"
                value={buyToken}
                selectedNetworkId={buyTokenNetworkId}
                networks={tokenPickerNetworks}
                tokens={tokenPickerTokens}
                loading={tokensLoading}
                onNetworkChange={handleTokenPickerNetworkChange}
                onChange={(token) => {
                  selectTokenForSide("buy", token);
                }}
                invalid={quoteValidationVisible && !!quoteValidationErrors.buyToken}
                describedBy="buy-token-error"
              />
              {quoteValidationVisible && quoteValidationErrors.buyToken ? (
                <div className="fieldError" id="buy-token-error">
                  {quoteValidationErrors.buyToken}
                </div>
              ) : null}
            </div>
          </div>
          {favoritePairSelected && sellTokenInfo && buyTokenInfo ? (
            <div className="favoritePairActionRow" data-tour="favorite">
              <div className="favoritePairSummary">
                <span>{sellTokenInfo.symbol}</span>
                <span aria-hidden="true">to</span>
                <span>{buyTokenInfo.symbol}</span>
                {currentFavoritePairCount ? <span className="favoriteSavedCount">{currentFavoritePairCount} saved</span> : null}
              </div>
              <button
                className={`favoriteIconButton${currentFavoritePairCount ? " favoriteIconButtonActive" : ""}`}
                type="button"
                aria-label={`Add ${sellTokenInfo.symbol} to ${buyTokenInfo.symbol} favorite`}
                title="Add favorite"
                onClick={openFavoritePopover}
              >
                <svg className="favoriteIcon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9L6.6 20l1-6.1-4.4-4.3 6.1-.9L12 3.2z" />
                </svg>
              </button>
            </div>
          ) : null}
          <div className="recipientPanel" data-tour="recipient">
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
                aria-invalid={quoteValidationVisible && !!quoteValidationErrors.recipientAddress}
                aria-describedby="recipient-address-error"
                placeholder={getRecipientAddressPlaceholder(buyTokenInfo)}
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
            {quoteValidationVisible && quoteValidationErrors.recipientAddress ? (
              <div className="fieldError" id="recipient-address-error">
                {quoteValidationErrors.recipientAddress}
              </div>
            ) : null}
          </div>
          {recipientDialogOpen ? (
            <div className="recipientDialogOverlay" role="presentation">
              <div
                className="recipientDialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="recipient-dialog-title"
              >
                <div className="recipientDialogHeader">
                  <h2 id="recipient-dialog-title">Recipient address</h2>
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
                  <button
                    className="recipientMethodButton"
                    type="button"
                    onClick={useConnectedRecipientAddress}
                    disabled={!destinationWalletAddress}
                  >
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
                      placeholder={getRecipientAddressPlaceholder(buyTokenInfo)}
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
                        disabled={recipientWalletImportLoading || getTokenAddressFamily(buyTokenInfo) !== "evm"}
                      >
                        {recipientWalletImportQrDataUrl ? "Restart" : "Start"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {tokenListNotice ? <div className="small" style={{ marginTop: 8 }}>{tokenListNotice}</div> : null}

          <div style={{ marginTop: 12 }}>
            <div className="label">Slippage tolerance</div>
            <div className="slippageControlRow">
              <select
                className="select slippageSelect"
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
                  className="input slippageInput"
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

          <div className="quoteActionRow" ref={quoteActionRef} data-tour="quote">
            <span className="quoteButtonWrap" onMouseEnter={revealQuoteValidation} onClick={revealQuoteValidation}>
              <button className="btn" onClick={fetchQuote} disabled={(!!walletAddress && !canQuote) || quoteLoading}>
                <span className="quoteButtonContent">
                  {quoteLoading ? <span className="buttonSpinner" aria-hidden="true" /> : null}
                  <span>{quoteLoading ? "Fetching quote..." : quote ? "Refresh Quote" : "Get Quote"}</span>
                </span>
              </button>
            </span>
            <button
              className="btn btnPrimary"
              onClick={executeSwap}
              disabled={!quote || !walletAddress || isQuoteExpired || quote.executionKind === "bitcoin-to-evm" || swapBusy}
            >
              {quote?.executionKind === "bitcoin-to-evm" ? "BTC Sell Quote Only" : isDryRun ? "Preview Swap" : "Swap"}
            </button>
            {quote?.executionKind === "bitcoin-to-evm" ? (
              <div className="small" style={{ marginTop: 8 }}>
                BTC sell quotes are available now. Sending from Bitcoin is not available yet.
              </div>
            ) : null}
          </div>

          {favoritePopoverOpen && sellTokenInfo && buyTokenInfo ? (
            <div className="favoritePopoverLayer" role="presentation" onClick={closeFavoritePopover}>
              <div
                className="favoritePopover"
                role="dialog"
                aria-label="Add favorite pair"
                style={{ left: favoritePopoverPosition.x, top: favoritePopoverPosition.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="favoritePopoverHeader">
                  <div>
                    <div className="favoritePopoverTitle">Add favorite</div>
                    <div className="favoritePopoverPair">
                      {sellTokenInfo.symbol} to {buyTokenInfo.symbol}
                    </div>
                  </div>
                  <button className="favoritePopoverClose" type="button" aria-label="Close favorite form" onClick={closeFavoritePopover}>
                    &times;
                  </button>
                </div>
                <label className="miniToggleRow favoriteAlertToggle">
                  <input
                    type="checkbox"
                    checked={favoriteAlertEnabledDraft}
                    onChange={(event) => setFavoriteAlertEnabledDraft(event.target.checked)}
                    disabled={!walletAddress}
                  />
                  <span>Alert me</span>
                </label>
                <div className="targetRateRow favoritePopoverRateRow">
                  <select
                    className="select"
                    value={favoriteAlertDirectionDraft}
                    onChange={(event) => setFavoriteAlertDirectionDraft(event.target.value as "above" | "below")}
                    disabled={!walletAddress}
                  >
                    <option value="above">At or above</option>
                    <option value="below">At or below</option>
                  </select>
                  <input
                    className="input"
                    value={favoriteTargetRateDraft}
                    onChange={(event) => setFavoriteTargetRateDraft(event.target.value)}
                    placeholder={currentFavoriteRate || "Target rate"}
                    inputMode="decimal"
                    disabled={!walletAddress}
                  />
                </div>
                {favoriteTargetHelper ? <div className="small favoritePopoverHint">{favoriteTargetHelper}</div> : null}
                <div className="small favoritePopoverHint">Targets for the same pair need at least a 1% gap.</div>
                {!walletAddress ? <div className="small favoritePopoverHint">Connect your wallet to save favorites.</div> : null}
                {favoritePairError ? <div className="error favoritePopoverMessage">{favoritePairError}</div> : null}
                <div className="favoritePopoverActions">
                  <button className="btn" type="button" onClick={closeFavoritePopover}>
                    Cancel
                  </button>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => {
                      void saveFavoriteFromPopover();
                    }}
                    disabled={!walletAddress || favoritePairSaving}
                  >
                    {favoritePairSaving ? "Saving..." : "Save Favorite"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {quoteError ? <div className="error" style={{ marginTop: 12 }}>{quoteError}</div> : null}
          {actionError ? <div className="error" style={{ marginTop: 12 }}>{actionError}</div> : null}
          {walletRequestNotice ? (
            <div className="walletSignNotice swapWalletNotice" role="status" aria-live="polite">
              <span className="walletSignPulse" aria-hidden="true" />
              <span className="walletSignCopy">
                <span className="walletSignTitle">Waiting for wallet approval</span>
                <span className="walletSignText">{walletRequestNotice}</span>
              </span>
            </div>
          ) : null}
          {favoritePairNotice ? <div className="ok" style={{ marginTop: 12 }}>{favoritePairNotice}</div> : null}
          {favoritePairError ? <div className="error" style={{ marginTop: 12 }}>{favoritePairError}</div> : null}

          {approvalTxHash ? (
            <div className="small" style={{ marginTop: 12 }}>
              Approval transaction: <span className="mono">{approvalTxHash}</span>
            </div>
          ) : null}

          {swapTxHash ? (
            <div className="small" style={{ marginTop: 8 }}>
              Swap transaction: <span className="mono">{swapTxHash}</span>
            </div>
          ) : null}

          {swapStatus !== "idle" && !(swapStatus === "pending" && walletRequestNotice) ? (
            <div
              className={swapStatus === "confirmed" ? "ok" : swapStatus === "pending" || swapStatus === "submitted" ? "warn" : "error"}
              style={{ marginTop: 8 }}
            >
              Status: {formatSwapStatus(swapStatus)}
            </div>
          ) : null}
        </div>

        <div className="panel" ref={quoteDetailsRef}>
          <div className="quoteHeader" data-tour="summary">
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
              {quoteSummary?.warnings.length ? (
                <div className="quoteWarnings" role="status" aria-live="polite">
                  {quoteSummary.warnings.map((warning) => (
                    <div className="quoteWarningItem" key={warning}>
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
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
              {quote.executionKind === "evm-to-bitcoin" ? (
                <div className="small" style={{ marginTop: 8 }}>
                  Bitcoin delivery can continue after your wallet confirms the source transaction.
                </div>
              ) : null}
              {quote.executionKind === "evm-cross-chain" ? (
                <div className="small" style={{ marginTop: 8 }}>
                  Delivery continues on the destination network after your wallet confirms the source transaction.
                </div>
              ) : null}
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
              {backendSession ? `Saved for ${shortAddr(backendSession.walletAddress)}` : "Connect your wallet to see saved swaps."}
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
            {historySigning ? (
              <div className="walletSignNotice" role="status" aria-live="polite">
                <span className="walletSignPulse" aria-hidden="true" />
                <span className="walletSignCopy">
                  <span className="walletSignTitle">Waiting for wallet approval</span>
                  <span className="walletSignText">{historySignNotice}</span>
                </span>
              </div>
            ) : (
              <button className="btn" onClick={refreshBackendHistory} disabled={!walletAddress || historyLoading}>
                {historyLoading
                  ? "Loading..."
                  : backendSession
                    ? historyLoaded
                      ? "Refresh History"
                      : "Load History"
                    : "Sign To Load History"}
              </button>
            )}
          </div>
          {historyNotice && !historySigning ? <div className="small" style={{ marginTop: 8 }}>{historyNotice}</div> : null}
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
        </>
      ) : null}

      {activeView === "alerts" && featureFlags.priceAlertsEnabled ? (
        <section className="panel pagePanel priceAlertPanel" aria-labelledby="alerts-title">
          <div className="pageHeader">
            <div>
              <h2 id="alerts-title">Set Alerts</h2>
              <div className="subtle">
                {walletAddress
                  ? "Set target-rate alerts for the pair selected on the swap page."
                  : "Connect your wallet to create price alerts."}
              </div>
            </div>
            <span className="badge">{priceAlertRulesLoading ? "Loading alerts" : "Alerts"}</span>
          </div>

          <div className="settingsContent">
            <div className="quoteHeader">
              <div className="subtle">
                {sellTokenInfo && buyTokenInfo
                  ? `${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}${priceAlertCurrentAmount ? ` - ${priceAlertCurrentAmount}` : ""}`
                  : "Select a pair in the swap form, then save an alert here."}
              </div>
              <button className="btn" type="button" onClick={refreshPriceAlertRules} disabled={!walletAddress || priceAlertRulesLoading}>
                {priceAlertRulesLoading ? "Loading..." : priceAlertRulesLoaded ? "Refresh" : "Load Alerts"}
              </button>
            </div>

            <div className="priceAlertComposer">
              <div className="priceAlertSummary">
                <div className="label">Selected pair</div>
                <strong>
                  {sellTokenInfo && buyTokenInfo ? `${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}` : "No pair selected"}
                </strong>
                <span className="subtle">
                  {priceAlertCurrentAmount || "Enter an amount on the swap page."}
                </span>
                <span className="priceAlertModePill">
                  Confirm in wallet
                </span>
              </div>

              <div>
                <div className="label">Target</div>
                <div className="targetRateRow">
                  <select
                    className="select"
                    value={priceAlertDirectionDraft}
                    onChange={(event) => setPriceAlertDirectionDraft(event.target.value as "above" | "below")}
                    disabled={!walletAddress}
                  >
                    <option value="above">At or above</option>
                    <option value="below">At or below</option>
                  </select>
                  <input
                    className="input"
                    value={priceAlertThresholdRateDraft}
                    onChange={(event) => setPriceAlertThresholdRateDraft(event.target.value)}
                    placeholder={currentFavoriteRate || "Target rate"}
                    inputMode="decimal"
                    disabled={!walletAddress}
                  />
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  {currentFavoriteRate && sellTokenInfo && buyTokenInfo
                    ? `Current quoted rate: ${formatDecimal(currentFavoriteRate, 8)} ${buyTokenInfo.symbol} per ${sellTokenInfo.symbol}`
                    : "Targets for the same pair need at least a 1% gap."}
                </div>
              </div>

              <div>
                <div className="label">Slippage tolerance</div>
                <input
                  className="input"
                  value={priceAlertSlippagePctDraft}
                  onChange={(event) => setPriceAlertSlippagePctDraft(event.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                  disabled={!walletAddress}
                />
                <div className="small" style={{ marginTop: 6 }}>Percent, from 0 to 10.</div>
              </div>

              <div>
                <div className="label">Execution</div>
                <div className="priceAlertModePill">Wallet confirmation required</div>
                <div className="small" style={{ marginTop: 6 }}>{priceAlertModeHelper}</div>
              </div>

              <div className="settingsActions">
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={() => {
                    void saveCurrentPriceAlertRule();
                  }}
                  disabled={!walletAddress || !sellTokenInfo || !buyTokenInfo || priceAlertRuleSaving}
                >
                  {priceAlertRuleSaving ? "Saving..." : "Save Alert"}
                </button>
              </div>
            </div>

            {priceAlertRuleNotice ? <div className="ok" style={{ marginTop: 10 }}>{priceAlertRuleNotice}</div> : null}
            {priceAlertRuleError ? <div className="error" style={{ marginTop: 10 }}>{priceAlertRuleError}</div> : null}

            {!priceAlertRulesLoaded && priceAlertRules.length === 0 ? (
              <div className="small">Alerts have not been loaded yet.</div>
            ) : priceAlertRules.length === 0 ? (
              <div className="small">No alerts yet.</div>
            ) : (
              <div className="historyTableWrap">
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>Pair</th>
                      <th>Amount</th>
                      <th>Target</th>
                      <th>Slippage</th>
                      <th>Execution</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceAlertRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div>{rule.sellTokenSymbol} to {rule.buyTokenSymbol}</div>
                          <div className="small">{getChainById(rule.chainId)?.name ?? `Chain ${rule.chainId}`}</div>
                        </td>
                        <td>{formatPriceAlertAmount(rule)}</td>
                        <td>{formatPriceAlertTarget(rule)}</td>
                        <td>{formatSlippageBps(rule.slippageBps)}</td>
                        <td>{formatPriceAlertExecution()}</td>
                        <td>{formatPriceAlertStatus(rule.status)}</td>
                        <td>
                          <button
                            className="tableActionButton"
                            type="button"
                            onClick={() => {
                              void removePriceAlertRule(rule);
                            }}
                            disabled={priceAlertRuleDeletingId === rule.id}
                          >
                            {priceAlertRuleDeletingId === rule.id ? "Removing..." : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeView === "preferences" ? (
        <section className="panel pagePanel settingsPanel" aria-labelledby="preferences-title">
          <div className="pageHeader">
            <div>
              <h2 id="preferences-title">Preferences</h2>
              <div className="subtle">Telegram, alerts, and notification settings for this wallet.</div>
            </div>
            <span className="badge">
              {!walletAddress
                ? "Wallet needed"
                : !preferencesSignedIn
                  ? "Sign in needed"
                  : notificationPreferenceLoading
                ? "Loading settings"
                : notificationPreference?.telegramEnabled || notificationPreference?.pushEnabled
                  ? "Alerts on"
                  : "Alerts off"}
            </span>
          </div>
          <div className="settingsContent">
            {!walletAddress ? (
              <div className="preferencesAuthGate">
                <div>
                  <strong>Connect your wallet to manage alerts</strong>
                  <p>
                    Swap Assistant uses your public wallet address to keep your history, favorite pairs, and notification
                    settings separate from other users. Connecting does not allow the app to move funds.
                  </p>
                </div>
                <button className="btn btnPrimary" type="button" onClick={openWalletChooser}>
                  Connect Wallet
                </button>
              </div>
            ) : !preferencesSignedIn ? (
              <div className="preferencesAuthGate">
                <div>
                  <strong>Sign in to manage preferences</strong>
                  <p>
                    Sign one message from your wallet so Swap Assistant can load settings for this address. This is not
                    a transaction and cannot move funds.
                  </p>
                </div>
                {preferencesSigning ? (
                  <div className="walletSignNotice preferencesWalletNotice" role="status" aria-live="polite">
                    <span className="walletSignPulse" aria-hidden="true" />
                    <span className="walletSignCopy">
                      <span className="walletSignTitle">Waiting for wallet approval</span>
                      <span className="walletSignText">{preferencesSignNotice}</span>
                    </span>
                  </div>
                ) : null}
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={refreshNotificationPreferences}
                  disabled={notificationPreferenceLoading}
                >
                  {notificationPreferenceLoading ? "Waiting for Wallet..." : "Sign In With Wallet"}
                </button>
              </div>
            ) : (
              <>
                <div className="quoteHeader">
                  <div className="subtle">
                    Telegram and push notifications can alert you when saved swaps or favorite pairs reach your targets.
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={refreshNotificationPreferences}
                    disabled={notificationPreferenceLoading}
                  >
                    {notificationPreferenceLoading ? "Refreshing..." : "Refresh Settings"}
                  </button>
                </div>

                <div className="settingsGrid">
                  <label className="toggleRow">
                    <input
                      type="checkbox"
                      checked={telegramEnabledDraft}
                      onChange={(event) => setTelegramEnabledDraft(event.target.checked)}
                    />
                    <span>
                      <strong>Telegram alerts</strong>
                      <span className="subtle">
                        {notificationPreference?.telegramChatId
                          ? "Receive saved-swap and favorite-pair alerts in Telegram."
                          : "Connect the Telegram bot once, then alerts can be delivered there."}
                      </span>
                    </span>
                  </label>

                  <div className="telegramConnectPanel">
                    <div className="label">Telegram</div>
                    <div className="telegramStatus">
                      {notificationPreference?.telegramChatId ? "Connected" : "Not connected"}
                    </div>
                    {telegramLink ? (
                      <div className="telegramCodeBox">
                        <span className="subtle">Connection code</span>
                        <strong>{telegramLink.code}</strong>
                      </div>
                    ) : null}
                    <div className="telegramActions">
                      <button
                        className="btn"
                        type="button"
                        onClick={startTelegramConnection}
                        disabled={telegramLinkLoading}
                      >
                        {telegramLinkLoading ? "Opening..." : notificationPreference?.telegramChatId ? "Reconnect Telegram" : "Connect Telegram"}
                      </button>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={checkTelegramConnection}
                        disabled={telegramLinkChecking || !telegramLink}
                      >
                        {telegramLinkChecking ? "Checking..." : "Check Connection"}
                      </button>
                    </div>
                  </div>

                  <div className="settingsCard pushSettingsCard">
                    <div className="label">Push notifications</div>
                    <strong>Push notifications on this device</strong>
                    <div className="subtle">{pushStatusText}</div>
                    <div className="pushActions">
                      {pushDeviceLinked ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            void disablePushNotifications("device");
                          }}
                          disabled={pushPreferenceLoading}
                        >
                          {pushPreferenceLoading ? "Updating..." : "Disable This Device"}
                        </button>
                      ) : (
                        <button
                          className="btn btnPrimary"
                          type="button"
                          onClick={enablePushNotifications}
                          disabled={
                            Boolean(pushSupportMessage)
                            || !pushPreparationReady
                            || pushPreferenceLoading
                            || pushDeviceState === "checking"
                          }
                        >
                          {pushPreferenceLoading
                            ? "Enabling..."
                            : !pushPreparationReady && !pushSupportMessage
                              ? "Getting Ready..."
                              : "Enable Push Notifications"}
                        </button>
                      )}
                      {pushWalletEnabled && !pushDeviceLinked ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            void disablePushNotifications("all");
                          }}
                          disabled={pushPreferenceLoading || pushDeviceState === "checking"}
                        >
                          Disable All Devices
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="settingsCard">
                    <div className="label">Saved-swap profit alerts</div>
                    <strong>Notify when a saved swap can reverse in profit</strong>
                    <div className="subtle">Alert me when the estimated reverse move reaches this gain.</div>
                    <div className="percentInputRow">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={reverseProfitThresholdPctDraft}
                        onChange={(event) => setReverseProfitThresholdPctDraft(event.target.value)}
                        aria-label="Reverse profit alert threshold percent"
                      />
                      <span>%</span>
                    </div>
                  </div>

                  <div className="settingsCard">
                    <label className="inlineCheck">
                      <input
                        type="checkbox"
                        checked={reverseLossEnabledDraft}
                        onChange={(event) => setReverseLossEnabledDraft(event.target.checked)}
                      />
                      <span>Loss protection alerts</span>
                    </label>
                    <div className="subtle">Notify me when a saved swap has moved against me by this amount.</div>
                    <div className="percentInputRow">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={reverseLossThresholdPctDraft}
                        onChange={(event) => setReverseLossThresholdPctDraft(event.target.value)}
                        disabled={!reverseLossEnabledDraft}
                        aria-label="Loss protection alert threshold percent"
                      />
                      <span>%</span>
                    </div>
                  </div>
                </div>

                <div className="settingsActions">
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={saveNotificationPreferenceSettings}
                    disabled={notificationPreferenceSaving}
                  >
                    {notificationPreferenceSaving ? "Saving..." : "Save Notifications"}
                  </button>
                </div>
              </>
            )}

            {notificationPreferenceNotice ? <div className="ok" style={{ marginTop: 10 }}>{notificationPreferenceNotice}</div> : null}
            {notificationPreferenceError ? <div className="error" style={{ marginTop: 10 }}>{notificationPreferenceError}</div> : null}
          </div>
        </section>
      ) : null}

      {activeView === "favorites" ? (
        <section className="panel pagePanel favoritesPanel" aria-labelledby="favorites-title">
          <div className="pageHeader">
            <div>
              <h2 id="favorites-title">Favorite Pairs</h2>
              <div className="subtle">
                {walletAddress
                  ? favoritePairsLoaded
                    ? `${favoritePairs.length} saved`
                    : "Save pairs and target-rate alerts for this wallet."
                  : "Connect your wallet to save favorite pairs."}
              </div>
            </div>
            <span className="badge">
              {!walletAddress
                ? "Wallet needed"
                : !favoritesSignedIn
                  ? "Sign in needed"
                  : favoritePairsLoading
                    ? "Loading favorites"
                    : "Favorites"}
            </span>
          </div>
        <div className="settingsContent">
          {!walletAddress ? (
            <div className="preferencesAuthGate">
              <div>
                <strong>Connect your wallet to save favorite pairs</strong>
                <p>
                  Swap Assistant uses your public wallet address to keep your favorite pairs and alert targets private
                  to this wallet. Connecting does not allow the app to move funds.
                </p>
              </div>
              <button className="btn btnPrimary" type="button" onClick={openWalletChooser}>
                Connect Wallet
              </button>
            </div>
          ) : !favoritesSignedIn ? (
            <div className="preferencesAuthGate">
              <div>
                <strong>Sign in to manage favorites</strong>
                <p>
                  Sign one message from your wallet so Swap Assistant can load favorites for this address. This is not a
                  transaction and cannot move funds.
                </p>
              </div>
              {favoriteSigning ? (
                <div className="walletSignNotice preferencesWalletNotice" role="status" aria-live="polite">
                  <span className="walletSignPulse" aria-hidden="true" />
                  <span className="walletSignCopy">
                    <span className="walletSignTitle">Waiting for wallet approval</span>
                    <span className="walletSignText">{favoriteSignNotice}</span>
                  </span>
                </div>
              ) : null}
              <button
                className="btn btnPrimary"
                type="button"
                onClick={signInAndRefreshFavoritePairs}
                disabled={favoritePairsLoading}
              >
                {favoritePairsLoading ? "Waiting for Wallet..." : "Sign In With Wallet"}
              </button>
            </div>
          ) : (
            <>
              <div className="quoteHeader">
                <div className="subtle">
                  {sellTokenInfo && buyTokenInfo
                    ? `Add new favorite: ${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}`
                    : "Select a pair in the swap form, then save it here."}
                </div>
                <button className="btn" type="button" onClick={refreshFavoritePairs} disabled={favoritePairsLoading}>
                  {favoritePairsLoading ? "Loading..." : favoritePairsLoaded ? "Refresh" : "Load Favorites"}
                </button>
              </div>

              <div className="favoriteComposer">
                <div>
                  <label className="toggleRow">
                    <input
                      type="checkbox"
                      checked={favoriteAlertEnabledDraft}
                      onChange={(event) => setFavoriteAlertEnabledDraft(event.target.checked)}
                    />
                    <span>
                      <strong>Alert on target rate</strong>
                      <span className="subtle">Notify me when this pair reaches my target. Same-pair targets must be at least 1% apart.</span>
                    </span>
                  </label>
                </div>

                <div>
                  <div className="label">Target</div>
                  <div className="targetRateRow">
                    <select
                      className="select"
                      value={favoriteAlertDirectionDraft}
                      onChange={(event) => setFavoriteAlertDirectionDraft(event.target.value as "above" | "below")}
                    >
                      <option value="above">At or above</option>
                      <option value="below">At or below</option>
                    </select>
                    <input
                      className="input"
                      value={favoriteTargetRateDraft}
                      onChange={(event) => setFavoriteTargetRateDraft(event.target.value)}
                      placeholder={currentFavoriteRate || "2500"}
                      inputMode="decimal"
                    />
                  </div>
                  {favoriteTargetHelper ? <div className="small" style={{ marginTop: 6 }}>{favoriteTargetHelper}</div> : null}
                </div>

                <div className="settingsActions">
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => {
                      void saveCurrentFavoritePair();
                    }}
                    disabled={!sellTokenInfo || !buyTokenInfo || favoritePairSaving}
                  >
                    {favoritePairSaving ? "Saving..." : "Add Favorite"}
                  </button>
                </div>
              </div>

              {!favoritePairsLoaded && favoritePairs.length === 0 ? (
                <div className="small">Favorites have not been loaded yet.</div>
              ) : favoritePairs.length === 0 ? (
                <div className="small">No favorite pairs yet.</div>
              ) : (
                <div className="historyTableWrap">
                  <table className="historyTable">
                    <thead>
                      <tr>
                        <th>Pair</th>
                        <th>Target</th>
                        <th>Alerts</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {favoritePairs.map((pair) => (
                        <tr key={pair.id}>
                          <td>
                            {pair.sellTokenSymbol} to {pair.buyTokenSymbol}
                          </td>
                          <td>{formatFavoriteTarget(pair)}</td>
                          <td>{pair.alertsEnabled ? "On" : "Off"}</td>
                          <td>
                            <div className="tableActionGroup">
                              <button className="tableActionButton" type="button" onClick={() => openFavoritePair(pair)}>
                                Open
                              </button>
                              <button className="tableActionButton" type="button" onClick={() => openFavoritePair(pair, "reverse")}>
                                Reverse
                              </button>
                              <button
                                className="tableActionButton tableActionDanger"
                                type="button"
                                onClick={() => {
                                  void removeFavoritePair(pair);
                                }}
                                disabled={favoritePairDeletingId === pair.id}
                              >
                                {favoritePairDeletingId === pair.id ? "Removing..." : "Remove"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {favoritePairNotice ? <div className="ok" style={{ marginTop: 10 }}>{favoritePairNotice}</div> : null}
          {favoritePairError ? <div className="error" style={{ marginTop: 10 }}>{favoritePairError}</div> : null}
        </div>
        </section>
      ) : null}

      {tourOpen ? (
        <SwapTour
          anchor={tourAnchor}
          currentStep={tourStepIndex}
          steps={SWAP_TOUR_STEPS}
          onBack={goToPreviousTourStep}
          onClose={() => closeSwapTour(true)}
          onNext={goToNextTourStep}
        />
      ) : null}

      {walletSignPrompt ? (
        <div className="walletSignPromptLayer" role="dialog" aria-modal="true" aria-labelledby="wallet-sign-title">
          <button
            className="walletSignPromptBackdrop"
            type="button"
            aria-label="Cancel wallet sign-in"
            onClick={cancelWalletSignPrompt}
          />
          <div className="walletSignPromptCard">
            <div className="walletSignPromptIcon" aria-hidden="true">
              <span className="walletStatusDot" />
            </div>
            <div className="walletSignPromptCopy">
              <div className="label">Wallet sign-in</div>
              <h2 id="wallet-sign-title">Approve a safe sign-in message</h2>
              <p>
                Swap Assistant asks for a message signature to prove this wallet is yours, so it can load
                {getWalletSignPromptResourceLabel(walletSignPrompt.target)} for this public address. This is not a
                transaction and cannot move funds.
              </p>
              <div className="walletSignPromptInstruction">
                {walletSignPrompt.isMobile
                  ? `After you tap Continue, ${normalizeWalletApprovalName(walletSignPrompt.walletName)} may open. Approve the sign-in message there, then return to Swap Assistant.`
                  : `After you click Continue, approve the message in ${normalizeWalletApprovalName(walletSignPrompt.walletName)}. If you connected from your phone, open that wallet app and approve it there.`}
              </div>
            </div>
            <div className="walletSignPromptActions">
              <button className="btn" type="button" onClick={cancelWalletSignPrompt}>
                Cancel
              </button>
              <button className="btn btnPrimary" type="button" onClick={approveWalletSignPrompt}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="siteFooter">
        <span>Swap Assistant is non-custodial. Review every wallet request before signing.</span>
        <div className="footerMeta">
          <span className="versionLabel" title={`Build ${envPublic.APP_VERSION}`}>
            Build {formatBuildVersion(envPublic.APP_VERSION)}
            {envPublic.COMMIT_TIMESTAMP ? ` · ${formatBuildTimestamp(envPublic.COMMIT_TIMESTAMP)}` : ""}
          </span>
          <nav aria-label="Legal links">
            <Link href="/fees">Fees & Risks</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatBuildVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed || trimmed === "local") return "local";
  return trimmed.replace(/^sha-/, "").slice(0, 7);
}

function formatBuildTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ][date.getUTCMonth()];
  const hour = date.getUTCHours().toString().padStart(2, "0");
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  return `${month} ${date.getUTCDate()}, ${hour}:${minute} UTC`;
}

function parseSwapLinkParams(search: string): PendingSwapLink | null {
  const params = new URLSearchParams(search);
  const chainId = Number(params.get("chainId"));
  const requestedToChainId = Number(params.get("toChainId") ?? params.get("chainId"));
  const sellToken = sanitizeTokenQueryParam(params.get("sellToken"));
  const buyToken = sanitizeTokenQueryParam(params.get("buyToken"));
  const sellAmountRaw = sanitizeRawAmountQueryParam(params.get("sellAmountRaw") ?? params.get("sellAmount"));
  const autoQuote = sellAmountRaw ? isTruthyQueryParam(params.get("autoQuote") ?? params.get("quote")) : false;

  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    !Number.isSafeInteger(requestedToChainId) ||
    requestedToChainId <= 0 ||
    !sellToken ||
    !buyToken
  ) return null;

  return {
    chainId,
    toChainId: requestedToChainId,
    sellToken,
    buyToken,
    sellAmountRaw,
    autoQuote
  };
}

function resolveSwapLinkForUi(
  swapLink: PendingSwapLink,
  allowedChains: Array<{ chainId: number }>
): PendingSwapLink | null {
  const allowedChainIds = new Set(allowedChains.map((chain) => chain.chainId));
  const firstAllowedChainId = allowedChains[0]?.chainId;
  const sourceChainId = resolveUiChainId(
    swapLink.chainId,
    swapLink.sellToken,
    swapLink.toChainId,
    allowedChainIds,
    firstAllowedChainId
  );
  if (!sourceChainId) return null;

  const toChainId = resolveUiChainId(
    swapLink.toChainId,
    swapLink.buyToken,
    sourceChainId,
    allowedChainIds,
    firstAllowedChainId
  );
  return toChainId ? { ...swapLink, chainId: sourceChainId, toChainId } : null;
}

function resolveUiChainId(
  requestedChainId: number,
  token: string,
  pairedChainId: number,
  allowedChainIds: ReadonlySet<number>,
  firstAllowedChainId: number | undefined
): number | null {
  if (requestedChainId === NATIVE_BITCOIN_CHAIN_ID && isNativeBitcoinToken(token)) {
    return allowedChainIds.has(pairedChainId) ? pairedChainId : firstAllowedChainId ?? null;
  }
  return allowedChainIds.has(requestedChainId) ? requestedChainId : null;
}

function buildSwapLinkHref(params: PendingSwapLink): string {
  const searchParams = new URLSearchParams({
    chainId: String(params.chainId),
    toChainId: String(params.toChainId),
    sellToken: params.sellToken,
    buyToken: params.buyToken
  });

  if (params.sellAmountRaw) {
    searchParams.set("sellAmountRaw", params.sellAmountRaw);
  }
  if (params.autoQuote && params.sellAmountRaw) {
    searchParams.set("autoQuote", "1");
  }

  return `/swap?${searchParams.toString()}`;
}

function sanitizeTokenQueryParam(value: string | null): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > 128) return "";
  return normalized;
}

function sanitizeRawAmountQueryParam(value: string | null): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > 80 || !/^\d+$/.test(normalized)) return "";
  return normalized;
}

function isTruthyQueryParam(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function buildWalletApprovalNotice(walletName: string, action: WalletApprovalAction): string {
  const walletLabel = normalizeWalletApprovalName(walletName);
  const actionText = getWalletApprovalActionText(action);
  const safetyHint = action === "signIn" ? " This cannot move funds." : "";

  return `${actionText} in ${walletLabel}, then return to Swap Assistant.${safetyHint}`;
}

function getWalletSignPromptResourceLabel(target: WalletApprovalNoticeTarget): string {
  switch (target) {
    case "preferences":
      return " alert settings";
    case "favorites":
      return " favorite pairs";
    case "history":
    default:
      return " saved swap history";
  }
}

function normalizeWalletApprovalName(walletName: string): string {
  const normalized = walletName.trim();
  if (!normalized || /^wallet(connect)?$/i.test(normalized)) return "your wallet";
  return normalized;
}

function getWalletApprovalActionText(action: WalletApprovalAction): string {
  switch (action) {
    case "signIn":
      return "Approve the sign-in message";
    case "tokenApproval":
      return "Approve token spending";
    case "swap":
      return "Sign the swap transaction";
    default:
      return "Approve the request";
  }
}

function buildConnectedWalletDisplay(params: {
  address: string;
  accountLabel?: string;
  networkName: string;
  providerType: string | undefined;
  walletName: string | undefined;
}): { primary: string; secondary: string; title: string } {
  const walletName = getWalletDisplayName(params.walletName, params.providerType);
  const shortAddress = shortAddr(params.address);
  const primary = params.accountLabel || walletName;
  const secondary = params.accountLabel
    ? `${walletName} - ${shortAddress} - ${params.networkName}`
    : `${shortAddress} - ${params.networkName}`;
  const title = params.accountLabel
    ? `${params.accountLabel} connected with ${walletName} on ${params.networkName}: ${params.address}`
    : `${walletName} connected on ${params.networkName}: ${params.address}`;

  return { primary, secondary, title };
}

function getWalletDisplayName(walletName: string | undefined, providerType: string | undefined): string {
  const normalized = walletName?.trim();
  if (normalized) return normalized.replace(/\s+Wallet$/i, " Wallet");
  if (providerType === "WALLET_CONNECT") return "WalletConnect";
  if (providerType === "INJECTED" || providerType === "ANNOUNCED") return "Browser Wallet";
  return "Wallet";
}

function getWalletNetworkLabel(chainId: number | null, fallback: string | undefined): string {
  if (chainId) return getChainById(chainId)?.name ?? `Chain ${chainId}`;
  return fallback ?? "Network";
}

function getEmbeddedAccountLabel(user: { username?: string | null; email?: string | null } | undefined): string {
  return user?.username?.trim() || user?.email?.trim() || "";
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
  const walletName = params.walletName?.trim();
  const label = [sourceLabel, walletName, params.networkName].filter(Boolean).join(" - ");

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

function getEvmNetworkId(chainId: number): string {
  return `eip155:${chainId}`;
}

function parseEvmNetworkId(networkId: string): number | null {
  const match = /^eip155:(\d{1,10})$/.exec(networkId);
  if (!match) return null;
  const chainId = Number(match[1]);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

function getTokenNetworkId(token: TokenInfo | undefined, fallbackChainId: number): string {
  return token?.networkId ?? getEvmNetworkId(fallbackChainId);
}

function getTokenNetworkName(token: TokenInfo | undefined, fallbackNetworkName: string | undefined): string {
  return token?.networkName ?? fallbackNetworkName ?? "this network";
}

function getTokenExecutionChainId(token: TokenInfo | undefined, fallbackChainId: number): number {
  return token && isNativeBitcoinToken(token) ? NATIVE_BITCOIN_CHAIN_ID : fallbackChainId;
}

function getTokenAddressFamily(token: TokenInfo | undefined): AddressFamily {
  return token?.addressFamily ?? "evm";
}

function getAddressFamilyConfig(token: TokenInfo | undefined): AddressFamilyConfig {
  return ADDRESS_FAMILY_CONFIG[getTokenAddressFamily(token)];
}

function getTokenWalletNamespace(token: TokenInfo | undefined): WalletNamespace {
  return token?.walletNamespace ?? getAddressFamilyConfig(token).walletNamespace;
}

function getTokenWalletLabel(token: TokenInfo | undefined): string {
  return getAddressFamilyConfig(token).walletLabel;
}

function getRecipientAddressPlaceholder(token: TokenInfo | undefined): string {
  return getAddressFamilyConfig(token).placeholder;
}

function getTokenWalletAddress(
  token: TokenInfo | undefined,
  connectedWallets: Partial<Record<WalletNamespace, string>>
): string {
  return connectedWallets[getTokenWalletNamespace(token)] ?? "";
}

function getQuoteChainIdForTokenSelection(
  token: Pick<TokenPickerOption, "quoteChainId" | "supportedQuoteChainIds"> | null | undefined,
  currentChainId: number
): number | undefined {
  if (typeof token?.quoteChainId === "number") return token.quoteChainId;
  if (token?.supportedQuoteChainIds?.includes(currentChainId)) return currentChainId;
  return token?.supportedQuoteChainIds?.[0];
}

function WalletSupportNotice({
  message,
  actionLabel,
  onAction
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="walletSupportNotice" role="status">
      <span>{message}</span>
      <button className="noticeLink" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

function SwapTour({
  anchor,
  currentStep,
  steps,
  onBack,
  onClose,
  onNext
}: {
  anchor: TourAnchor | null;
  currentStep: number;
  steps: TourStep[];
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}) {
  const step = steps[currentStep] ?? steps[0]!;
  const isLast = currentStep >= steps.length - 1;
  const cardStyle = tourCardStyle(anchor);

  return (
    <div className="tourLayer" role="dialog" aria-modal="true" aria-labelledby="swap-tour-title">
      <button className="tourBackdrop" type="button" aria-label="Close guide" onClick={onClose} />
      {anchor ? (
        <div
          className="tourSpotlight"
          aria-hidden="true"
          style={{
            left: anchor.left - 6,
            top: anchor.top - 6,
            width: anchor.width + 12,
            height: anchor.height + 12
          }}
        />
      ) : null}
      <div className={`tourCard${anchor ? " tourCardPositioned" : ""}`} style={cardStyle} key={currentStep}>
        <div className="tourProgress">
          Step {currentStep + 1} of {steps.length}
        </div>
        <h2 id="swap-tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tourActions">
          <button className="btn" type="button" onClick={onClose}>
            Skip
          </button>
          <span className="tourActionGroup">
            <button className="btn" type="button" onClick={onBack} disabled={currentStep === 0}>
              Back
            </button>
            <button className="btn btnPrimary" type="button" onClick={onNext}>
              {isLast ? "Finish" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function getTourAnchorRect(element: HTMLElement, step: TourStep): DOMRect {
  if (step.mobileAnchor === "tokenControls" && window.matchMedia("(max-width: 699px)").matches) {
    const controlRects = Array.from(element.querySelectorAll<HTMLElement>(".tokenPickerButton, .tokenFlipButton"))
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const unionRect = unionClientRects(controlRects);
    if (unionRect) return unionRect;
  }

  return element.getBoundingClientRect();
}

function unionClientRects(rects: DOMRect[]): DOMRect | null {
  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function tourCardStyle(anchor: TourAnchor | null): CSSProperties {
  if (!anchor) return {};

  const margin = 14;
  const width = Math.min(360, window.innerWidth - margin * 2);
  const estimatedHeight = 240;
  const sideGap = 18;
  const canFitRight = anchor.left + anchor.width + sideGap + width + margin <= window.innerWidth;
  const canFitLeft = anchor.left - sideGap - width >= margin;
  if (window.innerWidth >= 900 && (canFitRight || canFitLeft)) {
    return {
      bottom: "auto",
      left: canFitRight ? anchor.left + anchor.width + sideGap : anchor.left - width - sideGap,
      top: Math.max(margin, Math.min(anchor.top, window.innerHeight - estimatedHeight - margin)),
      width
    };
  }

  const below = anchor.top + anchor.height + 14;
  const above = anchor.top - estimatedHeight - 14;
  const top = below + estimatedHeight <= window.innerHeight ? below : Math.max(margin, above);
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
  return {
    bottom: "auto",
    left,
    top,
    width
  };
}

function getWalletSupportNotice(params: {
  token: TokenInfo | undefined;
  side: "sell" | "buy";
  networkName: string | undefined;
  hasAnyWalletAddress: boolean;
  connectedWallets: Partial<Record<WalletNamespace, string>>;
}): { message: string; actionLabel: string; walletNamespace: WalletNamespace } | null {
  const { token, side, networkName, hasAnyWalletAddress, connectedWallets } = params;
  if (!token) return null;

  const walletNamespace = getTokenWalletNamespace(token);
  if (connectedWallets[walletNamespace]) return null;
  if (!hasAnyWalletAddress && walletNamespace === "eip155") return null;

  const network = networkName ?? "this network";
  const walletLabel = getTokenWalletLabel(token);
  const actionLabel = hasAnyWalletAddress ? `Switch to ${walletLabel}` : `Connect ${walletLabel}`;
  const message = !hasAnyWalletAddress
    ? side === "sell"
      ? `Connect ${walletLabel} to sell ${token.symbol}.`
      : `Connect ${walletLabel} to receive ${token.symbol}.`
    : side === "sell"
      ? `Connected wallet does not support ${token.symbol} on ${network}.`
      : `Connected wallet does not support receiving ${token.symbol} on ${network}.`;
  return { message, actionLabel, walletNamespace };
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

function formatFavoriteTarget(pair: FavoritePair): string {
  if (!pair.targetRate) return "-";
  const direction = pair.alertDirection === "below" ? "At or below" : "At or above";
  return `${direction} ${formatDecimal(String(pair.targetRate), 8)} ${pair.buyTokenSymbol} per ${pair.sellTokenSymbol}`;
}

function formatPriceAlertAmount(rule: PriceAlertRule): string {
  return formatTokenAmount(rule.sellAmountRaw, {
    address: rule.sellTokenAddress,
    symbol: rule.sellTokenSymbol,
    decimals: rule.sellTokenDecimals
  });
}

function formatPriceAlertTarget(rule: PriceAlertRule): string {
  const direction = rule.alertDirection === "below" ? "At or below" : "At or above";
  return `${direction} ${formatDecimal(String(rule.thresholdRate), 8)} ${rule.buyTokenSymbol} per ${rule.sellTokenSymbol}`;
}

function formatPriceAlertExecution(): string {
  return "Wallet confirmation";
}

function formatPriceAlertStatus(status: PriceAlertRule["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function formatSlippageBps(slippageBps: number): string {
  return `${formatSlippageBpsAsPercent(slippageBps)}%`;
}

function formatSlippageBpsAsPercent(slippageBps: number): string {
  if (!Number.isFinite(slippageBps)) return "1";
  const pct = slippageBps / 100;
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}

function formatSwapStatus(status: TxStatus): string {
  if (status === "idle") return "";
  return `${status[0]!.toUpperCase()}${status.slice(1)}`;
}

function quoteForHistory(quote: QuoteResponse): QuoteResponse {
  const { availableQuotes: _availableQuotes, quoteErrors: _quoteErrors, ...rest } = quote;
  return rest;
}

function buildQuoteWarnings({
  quote,
  slippageBps,
  buyTokenFeesDeducted,
  grossBuyAmount
}: {
  quote: QuoteResponse;
  slippageBps: number | null;
  buyTokenFeesDeducted: string;
  grossBuyAmount: string;
}): string[] {
  const warnings: string[] = [];

  if (slippageBps !== null && slippageBps >= 300) {
    warnings.push(`Slippage is set to ${formatSlippageBps(slippageBps)}. The final amount can move before your wallet rejects the swap.`);
  }

  const effectiveFeeBps = calculateBps(buyTokenFeesDeducted, grossBuyAmount);
  if (effectiveFeeBps >= 100) {
    warnings.push(`Service fee is about ${formatFeeBps(effectiveFeeBps)} of the quoted output.`);
  }

  const quoteErrors = quote.quoteErrors ?? [];
  if (quoteErrors.length > 0) {
    warnings.push(formatProviderWarning(quoteErrors));
  }

  return warnings;
}

function formatQuoteOption(quote: QuoteResponse, buyToken: DisplayToken): string {
  const providerName = stringValue(quote.providerName) || "Route";
  const rankLabel = quote.isBest ? "Best - " : "";
  const amount = stringValue(quote.netBuyAmount) || stringValue(quote.buyAmount);
  const formattedAmount = amount ? formatTokenAmount(amount, buyToken) : "Quote";
  return `${rankLabel}${providerName} - ${formattedAmount}`;
}

function getQuoteValidationErrors(params: {
  amountHuman: string;
  sellTokenInfo: TokenInfo | undefined;
  buyTokenInfo: TokenInfo | undefined;
  sellTokenNetworkId: string;
  buyTokenNetworkId: string;
  sourceWalletAddress: string;
  recipientAddress: string;
  slippageBps: number | null;
}): QuoteValidationErrors {
  const errors: QuoteValidationErrors = {};

  if (!params.sellTokenInfo) {
    errors.sellToken = "Select a token to sell.";
  }

  if (!params.buyTokenInfo) {
    errors.buyToken = "Select a token to buy.";
  }

  if (
    params.sellTokenInfo &&
    params.buyTokenInfo &&
    params.sellTokenNetworkId === params.buyTokenNetworkId &&
    normalizeTokenKey(params.sellTokenInfo.address) === normalizeTokenKey(params.buyTokenInfo.address)
  ) {
    errors.buyToken = "Choose a different token to buy.";
  }

  if (params.sellTokenInfo) {
    const sellAddressConfig = getAddressFamilyConfig(params.sellTokenInfo);
    if (!params.sourceWalletAddress.trim()) {
      errors.sellToken = `Connect ${sellAddressConfig.walletLabel} to sell ${params.sellTokenInfo.symbol}.`;
    } else if (!sellAddressConfig.isValid(params.sourceWalletAddress)) {
      errors.sellToken = `Connect a valid ${sellAddressConfig.walletLabel} to sell ${params.sellTokenInfo.symbol}.`;
    }
  }

  if (params.buyTokenInfo) {
    const recipientAddressConfig = getAddressFamilyConfig(params.buyTokenInfo);
    if (!recipientAddressConfig.isValid(params.recipientAddress)) {
      errors.recipientAddress = `Enter a valid ${recipientAddressConfig.recipientLabel}.`;
    }
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

function parseRecipientAddressInput(value: string, token: TokenInfo | undefined): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return getAddressFamilyConfig(token).parse(trimmed);
}

function parseBitcoinAddressInput(value: string): string {
  const bitcoinUri = value.match(/^bitcoin:([^?]+)/i);
  if (!bitcoinUri) return value;

  try {
    return decodeURIComponent(bitcoinUri[1] ?? "").trim();
  } catch {
    return (bitcoinUri[1] ?? "").trim();
  }
}

function parseEvmAddressInput(value: string): string {
  const addressMatch = value.match(/0x[a-fA-F0-9]{40}/);
  return addressMatch?.[0] ?? value;
}

function validateRecipientAddress(address: string, token: TokenInfo | undefined): string {
  if (!address.trim()) return "Enter a recipient address.";
  const config = getAddressFamilyConfig(token);
  return config.isValid(address) ? "" : `Enter a valid ${config.recipientLabel}.`;
}

function getQrDetectorConstructor(): QrDetectorConstructor | null {
  const barcodeWindow = window as Window & { BarcodeDetector?: QrDetectorConstructor };
  return barcodeWindow.BarcodeDetector ?? null;
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
  return normalized === "eth"
    || normalized === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    || normalized === "0x0000000000000000000000000000000000000000";
}

function tokenMetadataToDisplay(token: DisplayToken): DisplayToken {
  return {
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals
  };
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || window.matchMedia("(max-width: 699px)").matches;
}

function getPushDeviceStatusText(
  supportMessage: string,
  deviceState: PushDeviceState,
  walletSubscriptionCount: number
): string {
  if (supportMessage) return supportMessage;
  if (deviceState === "checking") return "Checking push notifications on this device...";
  if (deviceState === "linked") {
    return `This device is connected. ${formatPushDeviceCount(walletSubscriptionCount)} will receive alerts for this wallet.`;
  }
  if (walletSubscriptionCount > 0) {
    return `Push alerts are active on ${formatPushDeviceCount(walletSubscriptionCount)}. This device is not connected.`;
  }
  if (deviceState === "not-supported") return "This browser does not support push notifications.";
  return "Receive the same alerts as push notifications on this device.";
}

function formatPushDeviceCount(count: number): string {
  const safeCount = Math.max(0, count);
  return `${safeCount} device${safeCount === 1 ? "" : "s"}`;
}

function getPushSupportMessage(vapidPublicKey: string): string {
  if (typeof window === "undefined") return "";
  if (!vapidPublicKey.trim()) return "Push notifications are not available right now.";
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    return "Push notifications need a secure connection.";
  }
  const mobileSupportMessage = getMobilePushSupportMessage();
  if (mobileSupportMessage) return mobileSupportMessage;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "This browser does not support push notifications.";
  }
  if (Notification.permission === "denied") {
    return PUSH_DENIED_MESSAGE;
  }
  return "";
}

function getMobilePushSupportMessage(): string {
  const userAgent = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent);
  if (!isMobile) return "";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  if (isIos && !isStandalone) {
    return "Install Swap Assistant on this device first, then enable push notifications from the installed app.";
  }

  if (isLikelyEmbeddedMobileBrowser(userAgent)) {
    return "Push notifications usually do not work inside wallet app web views. Open Swap Assistant in Chrome, Edge, Safari, or the installed app, then enable push notifications.";
  }

  return "";
}

function isLikelyEmbeddedMobileBrowser(userAgent: string): boolean {
  return /; wv\)|\bwv\b|MetaMaskMobile|Binance|Trust|CoinbaseWallet|OKApp|Phantom|Rainbow|TokenPocket|imToken/i.test(userAgent);
}

function scrollQuoteIntoViewOnMobile(actionElement: HTMLElement | null, detailsElement: HTMLElement | null) {
  if (!window.matchMedia("(max-width: 859px)").matches) return;

  const detailsRect = detailsElement?.getBoundingClientRect();
  if (detailsRect && detailsRect.top >= 0 && detailsRect.top < window.innerHeight * 0.68) return;

  const target = actionElement ?? detailsElement;
  if (!target) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion ? "auto" : "smooth"
  });
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

function calculatePairRate(
  sellAmount: string,
  sellToken: DisplayToken,
  buyAmount: string,
  buyToken: DisplayToken
): string {
  const sell = Number(formatUnitsSafe(sellAmount, sellToken.decimals));
  const buy = Number(formatUnitsSafe(buyAmount, buyToken.decimals));
  if (!Number.isFinite(sell) || !Number.isFinite(buy) || sell <= 0 || buy <= 0) return "";
  return formatDecimal(String(buy / sell), 8);
}

function normalizePositiveDecimal(value: string): string | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a valid target rate.");
  if (Number(normalized) <= 0) throw new Error("Target rate must be greater than zero.");
  return normalized;
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

function parseSlippagePctToBps(value: string): number | null {
  const pct = Number(value.trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 10) return null;
  return Math.round(pct * 100);
}

function parseThresholdPctToBps(value: string): number | null {
  const pct = Number(value.trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) return null;
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

function collectRouteLines(quote: QuoteResponse): RouteLine[] {
  if (Array.isArray(quote.routeLines) && quote.routeLines.length) {
    return quote.routeLines.map((line) => ({
      source: stringValue(line.source) || "Liquidity source",
      share: stringValue(line.share) || "Best route"
    }));
  }
  return [];
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
      .map((fee) => {
        const amount = stringValue(fee.amount);
        const tokenAddress = stringValue(fee.token);
        if (!amount || !tokenAddress) return null;
        const token = tokenForAddress(tokenAddress);
        return {
          label: stringValue(fee.label) || "Service fee",
          amount,
          token,
          display: formatTokenAmount(amount, token)
        };
      })
      .filter((fee): fee is FeeLine => !!fee);
  }

  return [];
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

function calculateBps(numerator: string, denominator: string): number {
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator)) return 0;
  const denominatorBigInt = BigInt(denominator);
  if (denominatorBigInt === 0n) return 0;
  const bps = (BigInt(numerator) * 10_000n) / denominatorBigInt;
  return bps > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bps);
}

function formatProviderWarning(errors: QuoteResponse["quoteErrors"]): string {
  const providerNames = (errors ?? [])
    .map((error) => error.providerName || error.providerId)
    .filter((name): name is string => Boolean(name));
  const uniqueNames = Array.from(new Set(providerNames)).slice(0, 3);
  const suffix = uniqueNames.length ? `: ${uniqueNames.join(", ")}` : "";
  return `Some routes were unavailable${suffix}. The selected quote is still from a responding route.`;
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

function normalizeRecipientImportError(e: any): string {
  if (isUserRejectedWalletRequest(e)) return "Wallet import was cancelled.";

  const message = normalizeWalletError(e);
  if (/wallet import is unavailable/i.test(message)) return message;
  if (/valid address/i.test(message)) return message;
  if (/proposal|pairing|session/i.test(message)) {
    return "Could not complete wallet import. Try again, or paste the address.";
  }
  return message || "Could not import the wallet address.";
}

function normalizePushNotificationError(e: any): string {
  const message = normalizeWalletError(e);
  if (e?.name === "NotAllowedError" || e?.cause?.name === "NotAllowedError") {
    return PUSH_DENIED_MESSAGE;
  }
  if (e?.name === "PushSubscriptionUnavailableError" || e?.cause?.name === "PushSubscriptionUnavailableError") {
    return "Your browser allowed notifications, but did not create a push endpoint for this device. Try the installed app or another browser; Telegram alerts will keep working meanwhile.";
  }
  if (e?.name === "PushSubscriptionSetupError") {
    return "Your browser could not connect this device to its push service. Telegram alerts remain available; try push notifications again later or on another device.";
  }
  if (/push service|registration failed|aborterror/i.test(message)) {
    return "Your browser could not connect this device to its push service. Telegram alerts remain available; try push notifications again later or on another device.";
  }
  if (/configuration is invalid/i.test(message)) return "Push notifications are not available right now.";
  if (/permission|blocked|denied|not enabled/i.test(message)) return PUSH_DENIED_MESSAGE;
  if (/not available/i.test(message)) return "Push notifications are not available right now.";
  if (/not support/i.test(message)) return "This browser does not support push notifications.";
  return message || "Push notifications could not be enabled. Please try again.";
}

function normalizeWalletError(e: any): string {
  if (e?.code === 4001) return "You cancelled this request in your wallet.";

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
