"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ethers } from "ethers";
import type { QuoteResponse } from "@/lib/types";
import { CHAINS, getAllowedChains, getChainById } from "@/lib/chains";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { formatUnitsSafe, parseUnitsSafe } from "@/lib/units";
import { isAddress } from "@/lib/validation";
import type { Eip1193Provider } from "@/lib/wallet";
import { ERC20_ABI } from "@/lib/erc20";
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect, useWalletInfo } from "@reown/appkit/react";
import { isAppKitConfigured } from "@/context/appkit";
import { envPublic } from "@/lib/envPublic";
import { buildQuoteUrl } from "@/lib/quoteClient";
import { createRecipientWalletImport } from "@/lib/recipientWalletImport";
import { swapLog } from "@/lib/swapLog";
import { listTokens } from "@/lib/tokenClient";
import { TokenPicker, type TokenPickerNetwork, type TokenPickerOption } from "@/components/TokenPicker";
import {
  type AutoSwapRule,
  BackendClientError,
  type FavoritePair,
  type BackendSession,
  type NotificationPreference,
  type SaveAutoSwapRuleRequest,
  type SaveFavoritePairRequest,
  type SaveSwapHistoryRequest,
  type TelegramLinkStart,
  type SwapHistoryRecord,
  completeTelegramLink,
  deleteAutoSwapRule,
  deleteFavoritePair,
  getFeatureFlags,
  getNotificationPreferences,
  listAutoSwapRules,
  listFavoritePairs,
  listSwapHistory,
  requestAuthNonce,
  saveAutoSwapRule,
  saveFavoritePair,
  saveNotificationPreferences,
  saveSwapHistory,
  startTelegramLink,
  verifyAuthSignature
} from "@/lib/backendClient";

type TxStatus = "idle" | "pending" | "submitted" | "confirmed" | "failed";
type ActiveView = "swap" | "auto-swap" | "favorites" | "preferences";
const QUOTE_TTL_SECONDS = 20;
const BACKEND_SESSION_STORAGE_KEY = "wallet.swapAssistant.backendSession.v1";
const SIGNING_ATTEMPT_TIMEOUT_MS = 90_000;
const ACTIVE_VIEWS: ActiveView[] = ["swap", "auto-swap", "favorites", "preferences"];
const WALLETCONNECT_SIGNING_ATTEMPT_TIMEOUT_MS = 300_000;
const SIGNING_ATTEMPT_EXPIRY_SECONDS = 300;

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
  sellToken: string;
  buyToken: string;
  sellAmountRaw: string;
};

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
    isValid: isBitcoinAddressInput
  }
};

export default function Page() {
  const allowedChains = useMemo(() => getAllowedChains(), []);
  const { open: openAppKit } = useAppKit();
  const evmAccount = useAppKitAccount({ namespace: "eip155" });
  const { address: appKitAddress, isConnected: appKitConnected } = evmAccount;
  const { address: bitcoinAccountAddress } = useAppKitAccount({ namespace: "bip122" });
  const { walletProvider: appKitProvider, walletProviderType } = useAppKitProvider<Eip1193Provider>("eip155");
  const { walletInfo } = useWalletInfo("eip155");
  const { walletInfo: bitcoinWalletInfo } = useWalletInfo("bip122");
  const { disconnect: disconnectAppKit } = useDisconnect();
  const isDryRun = envPublic.DISALLOW_MAINNET;
  const [activeView, setActiveView] = useState<ActiveView>("swap");
  const [featureFlags, setFeatureFlags] = useState({ autoSwapEnabled: false });
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState<boolean>(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(allowedChains[0]?.chainId ?? 11155111);

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
  const historyRequestInFlightRef = useRef<boolean>(false);
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference | null>(null);
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState<boolean>(false);
  const [notificationPreferenceLoading, setNotificationPreferenceLoading] = useState<boolean>(false);
  const [notificationPreferenceSaving, setNotificationPreferenceSaving] = useState<boolean>(false);
  const [notificationPreferenceError, setNotificationPreferenceError] = useState<string>("");
  const [notificationPreferenceNotice, setNotificationPreferenceNotice] = useState<string>("");
  const [telegramEnabledDraft, setTelegramEnabledDraft] = useState<boolean>(false);
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
  const [favoriteAlertEnabledDraft, setFavoriteAlertEnabledDraft] = useState<boolean>(true);
  const [favoriteAlertDirectionDraft, setFavoriteAlertDirectionDraft] = useState<"above" | "below">("above");
  const [favoriteTargetRateDraft, setFavoriteTargetRateDraft] = useState<string>("");
  const [favoritePopoverOpen, setFavoritePopoverOpen] = useState<boolean>(false);
  const [favoritePopoverPosition, setFavoritePopoverPosition] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const favoritePairsRequestInFlightRef = useRef<boolean>(false);
  const [autoSwapRules, setAutoSwapRules] = useState<AutoSwapRule[]>([]);
  const [autoSwapRulesLoaded, setAutoSwapRulesLoaded] = useState<boolean>(false);
  const [autoSwapRulesLoading, setAutoSwapRulesLoading] = useState<boolean>(false);
  const [autoSwapRuleSaving, setAutoSwapRuleSaving] = useState<boolean>(false);
  const [autoSwapRuleDeletingId, setAutoSwapRuleDeletingId] = useState<string>("");
  const [autoSwapRuleError, setAutoSwapRuleError] = useState<string>("");
  const [autoSwapRuleNotice, setAutoSwapRuleNotice] = useState<string>("");
  const [autoSwapDirectionDraft, setAutoSwapDirectionDraft] = useState<"above" | "below">("above");
  const [autoSwapThresholdRateDraft, setAutoSwapThresholdRateDraft] = useState<string>("");
  const [autoSwapSlippagePctDraft, setAutoSwapSlippagePctDraft] = useState<string>("1");
  const autoSwapRulesRequestInFlightRef = useRef<boolean>(false);
  const [pendingSwapLink, setPendingSwapLink] = useState<PendingSwapLink | null>(null);
  const quoteActionRef = useRef<HTMLDivElement>(null);
  const quoteDetailsRef = useRef<HTMLDivElement>(null);
  const quoteScrollPendingRef = useRef<boolean>(false);
  const previousBuyTokenAddressRef = useRef<string>("");
  const recipientQrVideoRef = useRef<HTMLVideoElement>(null);
  const recipientQrStreamRef = useRef<MediaStream | null>(null);
  const recipientQrTimerRef = useRef<number | null>(null);
  const recipientWalletImportRunRef = useRef<number>(0);
  const applyRecipientAddressRef = useRef<(rawValue: string, source?: RecipientAddressSource, walletName?: string) => void>(
    () => undefined
  );

  const chain = useMemo(() => getChainById(selectedChainId), [selectedChainId]);
  const connectedWalletName = useMemo(
    () => getWalletDisplayName(walletInfo?.name, walletProviderType),
    [walletInfo?.name, walletProviderType]
  );
  const connectedWalletDisplay = useMemo(
    () =>
      buildConnectedWalletDisplay({
        address: walletAddress,
        accountLabel: getEmbeddedAccountLabel(evmAccount.embeddedWalletInfo?.user),
        networkName: getWalletNetworkLabel(walletChainId, chain?.name),
        providerType: walletProviderType,
        walletName: connectedWalletName
      }),
    [chain?.name, connectedWalletName, evmAccount.embeddedWalletInfo?.user, walletAddress, walletChainId, walletProviderType]
  );
  const [tokensByChain, setTokensByChain] = useState<Record<number, TokenInfo[]>>(() =>
    buildFallbackTokensByChain(allowedChains.map((allowedChain) => allowedChain.chainId))
  );
  const [tokensLoadingByChain, setTokensLoadingByChain] = useState<Record<number, boolean>>({});
  const [tokenListNotice, setTokenListNotice] = useState<string>("");
  const tokens = useMemo(
    () => tokensByChain[selectedChainId] ?? DEFAULT_TOKENS_BY_CHAIN[selectedChainId] ?? [],
    [selectedChainId, tokensByChain]
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

  useEffect(() => {
    const controllers: AbortController[] = [];
    setTokensByChain((current) => {
      const next = { ...current };
      for (const allowedChain of allowedChains) {
        next[allowedChain.chainId] = next[allowedChain.chainId] ?? DEFAULT_TOKENS_BY_CHAIN[allowedChain.chainId] ?? [];
      }
      return next;
    });
    setTokensLoadingByChain(
      Object.fromEntries(allowedChains.map((allowedChain) => [allowedChain.chainId, true]))
    );
    setTokenListNotice("");

    for (const allowedChain of allowedChains) {
      const controller = new AbortController();
      controllers.push(controller);
      listTokens(allowedChain.chainId, controller.signal)
        .then((availableTokens) => {
          if (!availableTokens.length) return;
          setTokensByChain((current) => ({
            ...current,
            [allowedChain.chainId]: availableTokens
          }));
        })
        .catch((error: any) => {
          if (error?.name === "AbortError") return;
          setTokenListNotice("Showing popular tokens while the full token list is unavailable.");
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setTokensLoadingByChain((current) => ({
            ...current,
            [allowedChain.chainId]: false
          }));
        });
    }

    return () => controllers.forEach((controller) => controller.abort());
  }, [allowedChains]);

  useEffect(() => {
    const swapLink = parseSwapLinkParams(window.location.search);
    if (!swapLink || !allowedChains.some((allowedChain) => allowedChain.chainId === swapLink.chainId)) return;

    setPendingSwapLink(swapLink);
    setActiveView("swap");
    if (window.location.hash !== "#swap") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#swap`);
    }
    setSelectedChainId(swapLink.chainId);
    setSellToken(swapLink.sellToken);
    setBuyToken(swapLink.buyToken);
    setQuoteValidationVisible(false);
    clearQuoteState();
    setActionError("");
  }, [allowedChains]);

  useEffect(() => {
    if (pendingSwapLink) return;

    const sellTokenAvailable = tokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken));
    const buyTokenAvailable = tokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken));

    if (!sellTokenAvailable && tokens.length > 0) setSellToken(tokens[0]!.address);
    if (!buyTokenAvailable && tokens.length > 1) {
      const fallbackBuyToken = tokens.find((token) => normalizeTokenKey(token.address) !== normalizeTokenKey(tokens[0]!.address));
      if (fallbackBuyToken) setBuyToken(fallbackBuyToken.address);
    }
  }, [tokens, sellToken, buyToken, pendingSwapLink]);

  useEffect(() => {
    if (!allowedChains.some((allowedChain) => allowedChain.chainId === selectedChainId)) {
      setSelectedChainId(allowedChains[0]?.chainId ?? 11155111);
      setSellToken("");
      setBuyToken("");
      clearQuoteState();
      setActionError("");
      return;
    }
  }, [allowedChains, selectedChainId]);

  useEffect(() => {
    if (!walletChainId || !allowedChains.some((allowedChain) => allowedChain.chainId === walletChainId)) return;

    setSelectedChainId(walletChainId);
    setSellToken("");
    setBuyToken("");
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
        if (!cancelled) setFeatureFlags({ autoSwapEnabled: false });
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
      const view = window.location.hash.replace("#", "") as ActiveView;
      setActiveView(ACTIVE_VIEWS.includes(view) ? view : "swap");
    }

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (!featureFlagsLoaded || featureFlags.autoSwapEnabled || activeView !== "auto-swap") return;
    setActiveView("swap");
    if (window.location.hash === "#auto-swap") {
      window.history.replaceState(null, "", "#swap");
    }
  }, [activeView, featureFlags.autoSwapEnabled, featureFlagsLoaded]);

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
    if (activeView !== "auto-swap" || !featureFlags.autoSwapEnabled || !walletAddress || autoSwapRulesLoaded) return;
    const stored = backendSession ?? readStoredBackendSession();
    if (stored && isSessionForWallet(stored, walletAddress)) {
      void refreshAutoSwapRules();
    }
    // Load exactly when the Auto Swap view becomes active with an existing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, autoSwapRulesLoaded, backendSession, featureFlags.autoSwapEnabled, walletAddress]);

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
      resetNotificationPreferenceState();
      resetFavoritePairsState();
      resetAutoSwapRulesState();
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
      resetAutoSwapRulesState();
      return;
    }

    setBackendSession(stored);
    setDbSwapHistory([]);
    setHistoryLoaded(false);
    setHistoryError("");
    setHistoryNotice("");
    resetNotificationPreferenceState();
    resetFavoritePairsState();
    resetAutoSwapRulesState();
  }, [walletAddress, provider]);

  const sellTokenInfo = useMemo(
    () => tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken)),
    [tokens, sellToken]
  );
  const buyTokenInfo = useMemo(
    () => tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken)),
    [tokens, buyToken]
  );

  useEffect(() => {
    if (!pendingSwapLink || selectedChainId !== pendingSwapLink.chainId) return;

    if (sellTokenInfo && buyTokenInfo) {
      if (pendingSwapLink.sellAmountRaw) {
        setAmountHuman(formatUnitsSafe(pendingSwapLink.sellAmountRaw, sellTokenInfo.decimals));
      }
      setPendingSwapLink(null);
      return;
    }

    const loadingKnown = Object.prototype.hasOwnProperty.call(tokensLoadingByChain, selectedChainId);
    if (loadingKnown && !tokensLoadingByChain[selectedChainId]) {
      setPendingSwapLink(null);
    }
  }, [buyTokenInfo, pendingSwapLink, selectedChainId, sellTokenInfo, tokensLoadingByChain]);

  const sellTokenNetworkId = getTokenNetworkId(sellTokenInfo, selectedChainId);
  const buyTokenNetworkId = getTokenNetworkId(buyTokenInfo, selectedChainId);
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
      ? getWalletDisplayName(bitcoinWalletInfo?.name, bitcoinWalletInfo?.type)
      : getWalletDisplayName(walletInfo?.name, walletProviderType);
  }, [
    bitcoinWalletInfo?.name,
    bitcoinWalletInfo?.type,
    buyTokenInfo,
    recipientAddress,
    recipientAddressMode,
    walletInfo?.name,
    walletProviderType
  ]);
  const recipientAddressDisplay = useMemo(
    () =>
      buildRecipientAddressDisplay({
        address: recipientAddress,
        networkName: getTokenNetworkName(buyTokenInfo, chain?.name),
        source: recipientAddressMode === "connected" ? "connected" : recipientAddressSource,
        walletName: recipientAddressSource === "wallet_import" ? recipientImportedWalletName : recipientConnectedWalletName
      }),
    [
      buyTokenInfo,
      chain?.name,
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
        sourceWalletAddress,
        recipientAddress,
        slippageBps
      }),
    [amountHuman, sellTokenInfo, buyTokenInfo, sourceWalletAddress, recipientAddress, slippageBps]
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
    const oppositeToken = side === "sell" ? buyTokenInfo : sellTokenInfo;
    const nextChainId = getQuoteChainIdForTokenSelection(token, selectedChainId);
    const chainChanged = typeof nextChainId === "number" && nextChainId !== selectedChainId;
    const clearOppositeToken = chainChanged && getTokenWalletNamespace(oppositeToken) === "eip155";

    if (typeof nextChainId === "number" && chainChanged) {
      setSelectedChainId(nextChainId);
    }

    if (side === "sell") {
      setSellToken(token.address);
      if (clearOppositeToken) setBuyToken("");
      if (getTokenWalletNamespace(token) !== "eip155" || getTokenWalletAddress(token, connectedWallets)) {
        setConnectPromptVisible(false);
      }
    } else {
      setBuyToken(token.address);
      if (clearOppositeToken) setSellToken("");
    }

    if (side === "buy" || chainChanged) {
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
    const nextChainId = getQuoteChainIdForTokenSelection(
      tokenInfoToPickerLikeOption(nextSellToken, selectedChainId),
      selectedChainId
    );

    if (typeof nextChainId === "number" && nextChainId !== selectedChainId) {
      setSelectedChainId(nextChainId);
      setSellToken(nextSellToken?.address ?? "");
      if (getTokenWalletNamespace(nextBuyToken) === "eip155") {
        setBuyToken("");
      } else {
        setBuyToken(nextBuyToken?.address ?? "");
      }
    } else {
      setSellToken(nextSellToken?.address ?? "");
      setBuyToken(nextBuyToken?.address ?? "");
    }

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

    const connectedNamespaces: WalletNamespace[] = [
      ...(walletAddress ? (["eip155"] as const) : []),
      ...(bitcoinAccountAddress ? (["bip122"] as const) : [])
    ];

    if (connectedNamespaces.length > 0) {
      for (const connectedNamespace of connectedNamespaces) {
        try {
          await disconnectAppKit({ namespace: connectedNamespace });
        } catch {
          // Continue to the chooser; Reown may already have dropped the session.
        }
      }

      if (connectedNamespaces.includes("eip155")) {
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
      setRecipientDialogError("Wallet import is available for 0x recipient addresses. Paste or scan this address instead.");
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
        chainId: selectedChainId,
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
      setHistoryNotice,
      connectedWalletName
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

  function resetNotificationPreferenceState() {
    setNotificationPreference(null);
    setNotificationPreferenceLoaded(false);
    setNotificationPreferenceLoading(false);
    setNotificationPreferenceSaving(false);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    setTelegramEnabledDraft(false);
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
    setFavoriteAlertEnabledDraft(true);
    setFavoriteAlertDirectionDraft("above");
    setFavoriteTargetRateDraft("");
    setFavoritePopoverOpen(false);
    favoritePairsRequestInFlightRef.current = false;
  }

  function resetAutoSwapRulesState() {
    setAutoSwapRules([]);
    setAutoSwapRulesLoaded(false);
    setAutoSwapRulesLoading(false);
    setAutoSwapRuleSaving(false);
    setAutoSwapRuleDeletingId("");
    setAutoSwapRuleError("");
    setAutoSwapRuleNotice("");
    setAutoSwapDirectionDraft("above");
    setAutoSwapThresholdRateDraft("");
    setAutoSwapSlippagePctDraft("1");
    autoSwapRulesRequestInFlightRef.current = false;
  }

  async function refreshNotificationPreferences() {
    if (notificationPreferenceRequestInFlightRef.current) return;
    notificationPreferenceRequestInFlightRef.current = true;
    setNotificationPreferenceLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = await ensureBackendSession();
      const preference = await getNotificationPreferences(envPublic.BACKEND_BASE_URL, session);
      applyNotificationPreference(preference);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setNotificationPreferenceError(normalizeWalletError(e));
    } finally {
      setNotificationPreferenceLoading(false);
      notificationPreferenceRequestInFlightRef.current = false;
    }
  }

  function applyNotificationPreference(preference: NotificationPreference) {
    setNotificationPreference(preference);
    setNotificationPreferenceLoaded(true);
    setTelegramEnabledDraft(preference.telegramEnabled);
    setReverseProfitThresholdPctDraft(formatSlippageBpsAsPercent(preference.reverseProfitThresholdBps));
    setReverseLossEnabledDraft(preference.reverseLossEnabled);
    setReverseLossThresholdPctDraft(formatSlippageBpsAsPercent(preference.reverseLossThresholdBps));
    if (preference.telegramChatId) setTelegramLink(null);
  }

  async function saveNotificationPreferenceSettings() {
    setNotificationPreferenceSaving(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      if (telegramEnabledDraft && !notificationPreference?.telegramChatId) {
        throw new Error("Connect Telegram before enabling Telegram alerts.");
      }
      const profitThresholdBps = parseThresholdPctToBps(reverseProfitThresholdPctDraft);
      if (profitThresholdBps === null) throw new Error("Enter a profit alert threshold from 0% to 1000%.");
      const lossThresholdBps = parseThresholdPctToBps(reverseLossThresholdPctDraft);
      if (lossThresholdBps === null) throw new Error("Enter a loss alert threshold from 0% to 1000%.");
      const session = await ensureBackendSession();
      const preference = await saveNotificationPreferences(envPublic.BACKEND_BASE_URL, session, {
        emailAddress: notificationPreference?.emailAddress ?? null,
        emailEnabled: notificationPreference?.emailEnabled ?? false,
        telegramEnabled: telegramEnabledDraft,
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
    }
  }

  async function startTelegramConnection() {
    setTelegramLinkLoading(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = await ensureBackendSession();
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
    }
  }

  async function checkTelegramConnection() {
    setTelegramLinkChecking(true);
    setNotificationPreferenceError("");
    setNotificationPreferenceNotice("");
    try {
      const session = await ensureBackendSession();
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
    }
  }

  async function refreshAutoSwapRules() {
    if (autoSwapRulesRequestInFlightRef.current) return;
    autoSwapRulesRequestInFlightRef.current = true;
    setAutoSwapRulesLoading(true);
    setAutoSwapRuleError("");
    setAutoSwapRuleNotice("");
    try {
      const session = await ensureBackendSession();
      const rules = await listAutoSwapRules(envPublic.BACKEND_BASE_URL, session);
      setAutoSwapRules(rules);
      setAutoSwapRulesLoaded(true);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setAutoSwapRuleError(normalizeWalletError(e));
    } finally {
      setAutoSwapRulesLoading(false);
      autoSwapRulesRequestInFlightRef.current = false;
    }
  }

  async function saveCurrentAutoSwapRule() {
    setAutoSwapRuleSaving(true);
    setAutoSwapRuleError("");
    setAutoSwapRuleNotice("");
    try {
      const request = buildAutoSwapRuleRequest();
      const session = await ensureBackendSession();
      const saved = await saveAutoSwapRule(envPublic.BACKEND_BASE_URL, session, request);
      setAutoSwapRules((rules) => [saved, ...rules.filter((rule) => rule.id !== saved.id)]);
      setAutoSwapRulesLoaded(true);
      setAutoSwapRuleNotice(`${saved.sellTokenSymbol} to ${saved.buyTokenSymbol} Auto Swap saved.`);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setAutoSwapRuleError(normalizeWalletError(e));
    } finally {
      setAutoSwapRuleSaving(false);
    }
  }

  async function removeAutoSwapRule(rule: AutoSwapRule) {
    setAutoSwapRuleDeletingId(rule.id);
    setAutoSwapRuleError("");
    setAutoSwapRuleNotice("");
    try {
      const session = await ensureBackendSession();
      await deleteAutoSwapRule(envPublic.BACKEND_BASE_URL, session, rule.id);
      setAutoSwapRules((rules) => rules.filter((item) => item.id !== rule.id));
      setAutoSwapRuleNotice(`${rule.sellTokenSymbol} to ${rule.buyTokenSymbol} Auto Swap removed.`);
    } catch (e: any) {
      if (isExpiredBackendSessionError(e)) {
        clearStoredBackendSession();
        setBackendSession(null);
      }
      setAutoSwapRuleError(normalizeWalletError(e));
    } finally {
      setAutoSwapRuleDeletingId("");
    }
  }

  function buildAutoSwapRuleRequest(): SaveAutoSwapRuleRequest {
    if (!featureFlags.autoSwapEnabled) throw new Error("Auto Swap is not available.");
    if (!sellTokenInfo || !buyTokenInfo) throw new Error("Select a pair before saving Auto Swap.");
    if (normalizeTokenKey(sellTokenInfo.address) === normalizeTokenKey(buyTokenInfo.address)) {
      throw new Error("Choose two different tokens before saving Auto Swap.");
    }

    const sellAmountRaw = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
    if (!sellAmountRaw) throw new Error("Enter an amount before saving Auto Swap.");
    const thresholdRate = normalizePositiveDecimal(autoSwapThresholdRateDraft);
    if (!thresholdRate) throw new Error("Set a target rate before saving Auto Swap.");
    const autoSlippageBps = parseSlippagePctToBps(autoSwapSlippagePctDraft);
    if (autoSlippageBps === null) throw new Error("Enter a slippage tolerance from 0% to 10%.");
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
      alertDirection: autoSwapDirectionDraft,
      slippageBps: autoSlippageBps,
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
    try {
      const session = await ensureBackendSession();
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

  async function saveCurrentFavoritePair(): Promise<boolean> {
    setFavoritePairSaving(true);
    setFavoritePairError("");
    setFavoritePairNotice("");
    try {
      const request = buildFavoritePairRequest();
      const session = await ensureBackendSession();
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
      const session = await ensureBackendSession();
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
      sellToken: direction === "reverse" ? pair.buyTokenAddress : pair.sellTokenAddress,
      buyToken: direction === "reverse" ? pair.sellTokenAddress : pair.buyTokenAddress,
      sellAmountRaw: ""
    };

    setPendingSwapLink(swapLink);
    setActiveView("swap");
    setSelectedChainId(swapLink.chainId);
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
        chainId: selectedChainId,
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
        const msg = body?.error ?? body?.message ?? `Quote failed with status ${res.status}`;
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

    setWalletRequestNotice(buildWalletApprovalNotice(connectedWalletName, "tokenApproval"));
    const tx = await token.approve(spender, needed);
    setApprovalTxHash(tx.hash);
    setWalletRequestNotice("Approval submitted. Waiting for the network before opening the swap request.");
    await tx.wait();
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

      setSwapStatus("pending");
      setWalletRequestNotice(buildWalletApprovalNotice(connectedWalletName, "swap"));
      const tx = await signer.sendTransaction({
        to: quote.to,
        data: quote.data,
        value: BigInt(quote.value ?? "0"),
        gasLimit: gasLimit ?? undefined
      });

      setWalletRequestNotice("");
      setSwapStatus("submitted");
      setSwapTxHash(tx.hash);
      swapLog.add({ txHash: tx.hash, walletAddress, timestampMs: Date.now() });

      const receipt = await tx.wait();
      if (receipt?.status === 1) {
        const historyStatus = quote.executionKind === "evm-to-bitcoin" ? "submitted" : "confirmed";
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
          token: networkFeeToken,
          display: formatTokenAmount(networkFeeWei, networkFeeToken)
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
  }, [quote, sellTokenInfo, buyTokenInfo, chain, tokens, rateInverted, slippageBps]);

  const connectHint = useMemo(() => {
    if (walletAddress) return "";
    return "Choose a browser wallet or connect from your phone.";
  }, [walletAddress]);
  const currentFavoriteRate = useMemo(() => {
    if (!quote || !sellTokenInfo || !buyTokenInfo) return "";
    const buyAmount = stringValue(quote.netBuyAmount) || stringValue(quote.grossBuyAmount) || quote.buyAmount;
    return calculatePairRate(quote.sellAmount, tokenInfoToDisplay(sellTokenInfo), buyAmount, tokenInfoToDisplay(buyTokenInfo));
  }, [buyTokenInfo, quote, sellTokenInfo]);
  const autoSwapCurrentAmount = useMemo(() => {
    if (!sellTokenInfo) return "";
    const amountRaw = parseUnitsSafe(amountHuman, sellTokenInfo.decimals);
    if (!amountRaw) return "";
    return `${formatTokenAmount(amountRaw, tokenInfoToDisplay(sellTokenInfo))}`;
  }, [amountHuman, sellTokenInfo]);
  const autoSwapModeHelper = "You will receive an alert with a prefilled swap link when the target is reached.";
  const currentFavoritePairCount = useMemo(
    () =>
      favoritePairs.filter(
        (pair) =>
          pair.chainId === selectedChainId &&
          normalizeTokenKey(pair.sellTokenAddress) === normalizeTokenKey(sellToken) &&
          normalizeTokenKey(pair.buyTokenAddress) === normalizeTokenKey(buyToken)
      ).length,
    [buyToken, favoritePairs, selectedChainId, sellToken]
  );
  const favoritePairSelected = useMemo(
    () =>
      !!sellTokenInfo &&
      !!buyTokenInfo &&
      normalizeTokenKey(sellTokenInfo.address) !== normalizeTokenKey(buyTokenInfo.address),
    [buyTokenInfo, sellTokenInfo]
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
    setAutoSwapThresholdRateDraft("");
    setAutoSwapDirectionDraft("above");
    setAutoSwapRuleError("");
    setAutoSwapRuleNotice("");
  }, [selectedChainId, sellToken, buyToken]);

  useEffect(() => {
    if (currentFavoriteRate && !favoriteTargetRateDraft.trim()) {
      setFavoriteTargetRateDraft(currentFavoriteRate);
    }
    if (currentFavoriteRate && !autoSwapThresholdRateDraft.trim()) {
      setAutoSwapThresholdRateDraft(currentFavoriteRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFavoriteRate, favoriteTargetRateDraft]);

  useEffect(() => {
    if (slippageBps !== null) setAutoSwapSlippagePctDraft(formatSlippageBpsAsPercent(slippageBps));
  }, [slippageBps]);

  const historySigning = historyLoading && !backendSession;
  const historySignWalletName = connectedWalletName || connectedWalletDisplay.primary || "your wallet";
  const historySignNotice =
    historyNotice || buildWalletApprovalNotice(historySignWalletName, "signIn");
  const swapBusy = swapStatus === "pending" || swapStatus === "submitted" || Boolean(walletRequestNotice);

  return (
    <div className="container">
      <div className="header">
        <div className="headerTop">
          <div className="headerCopy">
            <h1 className="h1">The Wallet</h1>
            <div className="subtle">Your Personal Swap Aggregator. Get the best price for your swaps.</div>
          </div>
          <div className="walletActions">
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
              <button className="btn btnPrimary" onClick={openWalletChooser}>
                Connect Wallet
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
              <a
                className={`appMenuLink${activeView === "swap" ? " appMenuLinkActive" : ""}`}
                href="#swap"
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
            {featureFlags.autoSwapEnabled ? (
              <li>
                <a
                  className={`appMenuLink${activeView === "auto-swap" ? " appMenuLinkActive" : ""}`}
                  href="#auto-swap"
                  aria-current={activeView === "auto-swap" ? "page" : undefined}
                  onClick={() => setActiveView("auto-swap")}
                >
                  Auto Swap
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
          </ul>
        </nav>
      </div>

      {!walletAddress ? <div className="small" style={{ marginBottom: 12 }}>{connectHint}</div> : null}

      {activeView === "swap" ? (
        <>
      <div className="grid">
        <div className="panel">
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

          <div className="tokenPairRow" style={{ marginTop: 12 }}>
            <div>
              <TokenPicker
                label="Sell token"
                value={sellToken}
                selectedNetworkId={sellTokenNetworkId}
                networks={tokenPickerNetworks}
                tokens={tokenPickerTokens}
                loading={tokensLoading}
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
            <div className="favoritePairActionRow">
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

          <div className="quoteActionRow" ref={quoteActionRef}>
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
              Approval tx: <span className="mono">{approvalTxHash}</span>
            </div>
          ) : null}

          {swapTxHash ? (
            <div className="small" style={{ marginTop: 8 }}>
              Swap tx: <span className="mono">{swapTxHash}</span>
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
                  ? "Syncing..."
                  : backendSession
                    ? historyLoaded
                      ? "Refresh History"
                      : "Load History"
                    : "Sign In To Sync"}
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

      {activeView === "auto-swap" && featureFlags.autoSwapEnabled ? (
        <section className="panel pagePanel autoSwapPanel" aria-labelledby="auto-swap-title">
          <div className="pageHeader">
            <div>
              <h2 id="auto-swap-title">Auto Swap</h2>
              <div className="subtle">
                {walletAddress
                  ? "Set target-rate rules for the pair selected on the swap page."
                  : "Connect your wallet to create Auto Swap rules."}
              </div>
            </div>
            <span className="badge">{autoSwapRulesLoading ? "Loading rules" : "Auto Swap"}</span>
          </div>

          <div className="settingsContent">
            <div className="quoteHeader">
              <div className="subtle">
                {sellTokenInfo && buyTokenInfo
                  ? `${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}${autoSwapCurrentAmount ? ` - ${autoSwapCurrentAmount}` : ""}`
                  : "Select a pair in the swap form, then save an Auto Swap rule here."}
              </div>
              <button className="btn" type="button" onClick={refreshAutoSwapRules} disabled={!walletAddress || autoSwapRulesLoading}>
                {autoSwapRulesLoading ? "Loading..." : autoSwapRulesLoaded ? "Refresh" : "Load Rules"}
              </button>
            </div>

            <div className="autoSwapComposer">
              <div className="autoSwapSummary">
                <div className="label">Selected pair</div>
                <strong>
                  {sellTokenInfo && buyTokenInfo ? `${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}` : "No pair selected"}
                </strong>
                <span className="subtle">
                  {autoSwapCurrentAmount || "Enter an amount on the swap page."}
                </span>
                <span className="autoSwapModePill">
                  Confirm in wallet
                </span>
              </div>

              <div>
                <div className="label">Target</div>
                <div className="targetRateRow">
                  <select
                    className="select"
                    value={autoSwapDirectionDraft}
                    onChange={(event) => setAutoSwapDirectionDraft(event.target.value as "above" | "below")}
                    disabled={!walletAddress}
                  >
                    <option value="above">At or above</option>
                    <option value="below">At or below</option>
                  </select>
                  <input
                    className="input"
                    value={autoSwapThresholdRateDraft}
                    onChange={(event) => setAutoSwapThresholdRateDraft(event.target.value)}
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
                  value={autoSwapSlippagePctDraft}
                  onChange={(event) => setAutoSwapSlippagePctDraft(event.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                  disabled={!walletAddress}
                />
                <div className="small" style={{ marginTop: 6 }}>Percent, from 0 to 10.</div>
              </div>

              <div>
                <div className="label">Execution</div>
                <div className="autoSwapModePill">Wallet confirmation required</div>
                <div className="small" style={{ marginTop: 6 }}>{autoSwapModeHelper}</div>
              </div>

              <div className="settingsActions">
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={() => {
                    void saveCurrentAutoSwapRule();
                  }}
                  disabled={!walletAddress || !sellTokenInfo || !buyTokenInfo || autoSwapRuleSaving}
                >
                  {autoSwapRuleSaving ? "Saving..." : "Save Auto Swap Alert"}
                </button>
              </div>
            </div>

            {autoSwapRuleNotice ? <div className="ok" style={{ marginTop: 10 }}>{autoSwapRuleNotice}</div> : null}
            {autoSwapRuleError ? <div className="error" style={{ marginTop: 10 }}>{autoSwapRuleError}</div> : null}

            {!autoSwapRulesLoaded && autoSwapRules.length === 0 ? (
              <div className="small">Auto Swap rules have not been loaded yet.</div>
            ) : autoSwapRules.length === 0 ? (
              <div className="small">No Auto Swap rules yet.</div>
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
                    {autoSwapRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div>{rule.sellTokenSymbol} to {rule.buyTokenSymbol}</div>
                          <div className="small">{getChainById(rule.chainId)?.name ?? `Chain ${rule.chainId}`}</div>
                        </td>
                        <td>{formatAutoSwapAmount(rule)}</td>
                        <td>{formatAutoSwapTarget(rule)}</td>
                        <td>{formatSlippageBps(rule.slippageBps)}</td>
                        <td>{formatAutoSwapExecution()}</td>
                        <td>{formatAutoSwapStatus(rule.status)}</td>
                        <td>
                          <button
                            className="tableActionButton"
                            type="button"
                            onClick={() => {
                              void removeAutoSwapRule(rule);
                            }}
                            disabled={autoSwapRuleDeletingId === rule.id}
                          >
                            {autoSwapRuleDeletingId === rule.id ? "Removing..." : "Remove"}
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
              <div className="subtle">Telegram, alerts, and wallet-owned notification settings.</div>
            </div>
            <span className="badge">
              {notificationPreferenceLoading
                ? "Loading settings"
                : notificationPreference?.telegramEnabled
                  ? "Telegram on"
                  : "Telegram off"}
            </span>
          </div>
        <div className="settingsContent">
          <div className="quoteHeader">
            <div className="subtle">
              {walletAddress
                ? backendSession
                  ? "Telegram can notify you when saved swaps or favorite pairs reach alert conditions."
                  : "Sign once to manage alerts."
                : "Connect your wallet to manage alerts."}
            </div>
            <button
              className="btn"
              type="button"
              onClick={refreshNotificationPreferences}
              disabled={!walletAddress || notificationPreferenceLoading}
            >
              {notificationPreferenceLoading ? "Loading..." : notificationPreferenceLoaded ? "Refresh" : "Load Settings"}
            </button>
          </div>

          <div className="settingsGrid">
            <label className="toggleRow">
              <input
                type="checkbox"
                checked={telegramEnabledDraft}
                onChange={(event) => setTelegramEnabledDraft(event.target.checked)}
                disabled={!walletAddress}
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
                  disabled={!walletAddress || telegramLinkLoading}
                >
                  {telegramLinkLoading ? "Opening..." : notificationPreference?.telegramChatId ? "Reconnect Telegram" : "Connect Telegram"}
                </button>
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={checkTelegramConnection}
                  disabled={!walletAddress || telegramLinkChecking || !telegramLink}
                >
                  {telegramLinkChecking ? "Checking..." : "Check Connection"}
                </button>
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
                  disabled={!walletAddress}
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
                  disabled={!walletAddress}
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
                  disabled={!walletAddress || !reverseLossEnabledDraft}
                  aria-label="Loss protection alert threshold percent"
                />
                <span>%</span>
              </div>
            </div>
          </div>

          {notificationPreferenceNotice ? <div className="ok" style={{ marginTop: 10 }}>{notificationPreferenceNotice}</div> : null}
          {notificationPreferenceError ? <div className="error" style={{ marginTop: 10 }}>{notificationPreferenceError}</div> : null}

          <div className="settingsActions">
            <button
              className="btn btnPrimary"
              type="button"
              onClick={saveNotificationPreferenceSettings}
              disabled={!walletAddress || notificationPreferenceSaving}
            >
              {notificationPreferenceSaving ? "Saving..." : "Save Notifications"}
            </button>
          </div>
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
            <span className="badge">{favoritePairsLoading ? "Loading favorites" : "Favorites"}</span>
          </div>
        <div className="settingsContent">
          <div className="quoteHeader">
            <div className="subtle">
              {sellTokenInfo && buyTokenInfo
                ? `Add new favorite: ${sellTokenInfo.symbol} to ${buyTokenInfo.symbol}`
                : "Select a pair in the swap form, then save it here."}
            </div>
            <button className="btn" type="button" onClick={refreshFavoritePairs} disabled={!walletAddress || favoritePairsLoading}>
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
                  disabled={!walletAddress}
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
                  disabled={!walletAddress}
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
                  disabled={!walletAddress}
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
                disabled={!walletAddress || !sellTokenInfo || !buyTokenInfo || favoritePairSaving}
              >
                {favoritePairSaving ? "Saving..." : "Add Favorite"}
              </button>
            </div>
          </div>

          {favoritePairNotice ? <div className="ok" style={{ marginTop: 10 }}>{favoritePairNotice}</div> : null}
          {favoritePairError ? <div className="error" style={{ marginTop: 10 }}>{favoritePairError}</div> : null}

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
        </div>
        </section>
      ) : null}

      <footer className="siteFooter">
        <span>The Wallet is non-custodial. Review every wallet request before signing.</span>
        <nav aria-label="Legal links">
          <Link href="/fees">Fees & Risks</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function parseSwapLinkParams(search: string): PendingSwapLink | null {
  const params = new URLSearchParams(search);
  const chainId = Number(params.get("chainId"));
  const sellToken = sanitizeTokenQueryParam(params.get("sellToken"));
  const buyToken = sanitizeTokenQueryParam(params.get("buyToken"));
  const sellAmountRaw = sanitizeRawAmountQueryParam(params.get("sellAmountRaw") ?? params.get("sellAmount"));

  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !sellToken || !buyToken) return null;

  return {
    chainId,
    sellToken,
    buyToken,
    sellAmountRaw
  };
}

function buildSwapLinkHref(params: PendingSwapLink): string {
  const searchParams = new URLSearchParams({
    chainId: String(params.chainId),
    sellToken: params.sellToken,
    buyToken: params.buyToken
  });

  if (params.sellAmountRaw) {
    searchParams.set("sellAmountRaw", params.sellAmountRaw);
  }

  return `?${searchParams.toString()}#swap`;
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

function buildWalletApprovalNotice(walletName: string, action: WalletApprovalAction): string {
  const walletLabel = normalizeWalletApprovalName(walletName);
  const actionText = getWalletApprovalActionText(action);
  const safetyHint = action === "signIn" ? " This cannot move funds." : "";

  return `${actionText} in ${walletLabel}, then return to The Wallet.${safetyHint}`;
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

function buildFallbackTokensByChain(chainIds: number[]): Record<number, TokenInfo[]> {
  return Object.fromEntries(chainIds.map((chainId) => [chainId, DEFAULT_TOKENS_BY_CHAIN[chainId] ?? []]));
}

function buildTokenPickerOptions(
  chains: Array<{ chainId: number; name: string }>,
  tokensByChain: Record<number, TokenInfo[]>
): TokenPickerOption[] {
  const optionsByKey = new Map<string, TokenPickerOption>();

  for (const chain of chains) {
    const chainTokens = tokensByChain[chain.chainId] ?? DEFAULT_TOKENS_BY_CHAIN[chain.chainId] ?? [];
    for (const token of chainTokens) {
      const networkId = getTokenNetworkId(token, chain.chainId);
      const key = `${networkId}:${normalizeTokenKey(token.address)}`;
      const existing = optionsByKey.get(key);
      if (existing) {
        const currentSupportedChainIds = existing.supportedQuoteChainIds ?? [];
        if (!currentSupportedChainIds.includes(chain.chainId)) {
          existing.supportedQuoteChainIds = [...currentSupportedChainIds, chain.chainId];
        }
        continue;
      }

      const walletNamespace = getTokenWalletNamespace(token);
      optionsByKey.set(key, {
        ...token,
        networkId,
        networkName: getTokenNetworkName(token, chain.name),
        quoteChainId: walletNamespace === "eip155" ? chain.chainId : undefined,
        supportedQuoteChainIds: [chain.chainId]
      });
    }
  }

  return [...optionsByKey.values()];
}

function buildTokenPickerNetworks(
  chains: Array<{ chainId: number; name: string }>,
  tokens: TokenPickerOption[]
): TokenPickerNetwork[] {
  const networks = new Map<string, TokenPickerNetwork>();

  for (const chain of chains) {
    networks.set(getEvmNetworkId(chain.chainId), {
      id: getEvmNetworkId(chain.chainId),
      name: chain.name
    });
  }

  for (const token of tokens) {
    if (!networks.has(token.networkId)) {
      networks.set(token.networkId, {
        id: token.networkId,
        name: token.networkName
      });
    }
  }

  return [...networks.values()];
}

function getEvmNetworkId(chainId: number): string {
  return `eip155:${chainId}`;
}

function getTokenNetworkId(token: TokenInfo | undefined, fallbackChainId: number): string {
  return token?.networkId ?? getEvmNetworkId(fallbackChainId);
}

function getTokenNetworkName(token: TokenInfo | undefined, fallbackNetworkName: string | undefined): string {
  return token?.networkName ?? fallbackNetworkName ?? "this network";
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

function tokenInfoToPickerLikeOption(
  token: TokenInfo | undefined,
  currentChainId: number
): Pick<TokenPickerOption, "quoteChainId" | "supportedQuoteChainIds"> | undefined {
  if (!token) return undefined;
  const walletNamespace = getTokenWalletNamespace(token);
  return {
    quoteChainId: walletNamespace === "eip155" ? currentChainId : undefined,
    supportedQuoteChainIds: [currentChainId]
  };
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

function formatAutoSwapAmount(rule: AutoSwapRule): string {
  return formatTokenAmount(rule.sellAmountRaw, {
    address: rule.sellTokenAddress,
    symbol: rule.sellTokenSymbol,
    decimals: rule.sellTokenDecimals
  });
}

function formatAutoSwapTarget(rule: AutoSwapRule): string {
  const direction = rule.alertDirection === "below" ? "At or below" : "At or above";
  return `${direction} ${formatDecimal(String(rule.thresholdRate), 8)} ${rule.buyTokenSymbol} per ${rule.sellTokenSymbol}`;
}

function formatAutoSwapExecution(): string {
  return "Wallet confirmation";
}

function formatAutoSwapStatus(status: AutoSwapRule["status"]): string {
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

function readStoredBackendSession(): BackendSession | null {
  try {
    removeBackendSessionCopy(window.localStorage);
    const raw = window.sessionStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackendSession;
    if (!parsed.walletAddress || !parsed.accessToken || !parsed.expiresAt) {
      clearStoredBackendSession();
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now() + 60_000) {
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
  removeBackendSessionCopy(window.localStorage);
  try {
    window.sessionStorage.setItem(BACKEND_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The in-memory React state still carries the session for the current view.
  }
}

function clearStoredBackendSession() {
  removeBackendSessionCopy(window.localStorage);
  removeBackendSessionCopy(window.sessionStorage);
}

function removeBackendSessionCopy(storage: Storage) {
  try {
    storage.removeItem(BACKEND_SESSION_STORAGE_KEY);
  } catch {
    // Storage access can fail in strict browser privacy modes.
  }
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
  setNotice: (message: string) => void,
  walletName: string
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
      setNotice(buildWalletApprovalNotice(walletName, "signIn"));
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
    return provider.request(args, undefined, SIGNING_ATTEMPT_EXPIRY_SECONDS);
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

  if (params.sellTokenInfo && params.buyTokenInfo && params.sellTokenInfo.address === params.buyTokenInfo.address) {
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

function isBitcoinAddressInput(value: string): boolean {
  const address = value.trim();
  return (
    /^(bc1)[ac-hj-np-z02-9]{11,87}$/i.test(address) ||
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)
  );
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
