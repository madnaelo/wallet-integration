"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createRecipientWalletImport } from "@/lib/recipientWalletImport";
import { swapLog } from "@/lib/swapLog";
import { listTokens } from "@/lib/tokenClient";
import { TokenPicker, type TokenPickerNetwork, type TokenPickerOption } from "@/components/TokenPicker";
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

type TxStatus = "idle" | "pending" | "submitted" | "confirmed" | "failed";
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
type RecipientDialogMode = "paste" | "scan" | "wallet";
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
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount({ namespace: "eip155" });
  const { address: bitcoinAccountAddress } = useAppKitAccount({ namespace: "bip122" });
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
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [recipientAddressMode, setRecipientAddressMode] = useState<RecipientAddressMode>("connected");
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
  const previousBuyTokenAddressRef = useRef<string>("");
  const recipientQrVideoRef = useRef<HTMLVideoElement>(null);
  const recipientQrStreamRef = useRef<MediaStream | null>(null);
  const recipientQrTimerRef = useRef<number | null>(null);
  const recipientWalletImportRunRef = useRef<number>(0);
  const applyRecipientAddressRef = useRef<(rawValue: string, sourceLabel?: string) => void>(() => undefined);

  const chain = useMemo(() => getChainById(selectedChainId), [selectedChainId]);
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
    const sellTokenAvailable = tokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken));
    const buyTokenAvailable = tokens.some((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken));

    if (!sellTokenAvailable && tokens.length > 0) setSellToken(tokens[0]!.address);
    if (!buyTokenAvailable && tokens.length > 1) {
      const fallbackBuyToken = tokens.find((token) => normalizeTokenKey(token.address) !== normalizeTokenKey(tokens[0]!.address));
      if (fallbackBuyToken) setBuyToken(fallbackBuyToken.address);
    }
  }, [tokens, sellToken, buyToken]);

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
    setActionError("");
  }, [allowedChains, walletChainId]);

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

  const sellTokenInfo = useMemo(
    () => tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(sellToken)),
    [tokens, sellToken]
  );
  const buyTokenInfo = useMemo(
    () => tokens.find((token) => normalizeTokenKey(token.address) === normalizeTokenKey(buyToken)),
    [tokens, buyToken]
  );
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
  const recipientTooltip = recipientAddressMode === "custom" && recipientAddress
    ? "Custom Recipient Address"
    : destinationWalletAddress
    ? "Currently Connected Wallet"
    : "No recipient address selected";
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
    }
  }, [destinationWalletAddress, recipientAddressMode]);

  useEffect(() => {
    const buyTokenAddress = `${buyTokenNetworkId}:${buyTokenInfo?.address ?? ""}`;
    if (previousBuyTokenAddressRef.current === buyTokenAddress) return;

    previousBuyTokenAddressRef.current = buyTokenAddress;
    setRecipientAddressMode("connected");
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

            applyRecipientAddressRef.current(rawValue, "QR code");
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
      applyRecipientAddress(imported.address, "wallet import");
    } catch (e: any) {
      if (recipientWalletImportRunRef.current !== runId) return;
      setRecipientDialogError(normalizeRecipientImportError(e));
      setRecipientWalletImportStatus("");
    } finally {
      if (recipientWalletImportRunRef.current === runId) setRecipientWalletImportLoading(false);
    }
  }

  function applyRecipientAddress(rawValue: string, sourceLabel = "address") {
    const parsedAddress = parseRecipientAddressInput(rawValue, buyTokenInfo);
    const validationError = validateRecipientAddress(parsedAddress, buyTokenInfo);
    if (validationError) {
      setRecipientDialogError(validationError);
      if (sourceLabel === "QR code") setRecipientQrStatus("QR code did not contain a valid recipient address.");
      return;
    }

    setRecipientAddress(parsedAddress);
    setRecipientAddressMode("custom");
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
        const historyStatus = quote.executionKind === "evm-to-bitcoin" ? "submitted" : "confirmed";
        setSwapStatus(historyStatus);
        try {
          await persistCurrentSwap(historyStatus, tx.hash);
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
              <span aria-hidden="true">&#8644;</span>
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
          <div className="recipientPanel">
            <div className="recipientHeader">
              <div className="label">Recipient address</div>
            </div>
            <div className="recipientRow" title={recipientTooltip} aria-label={recipientTooltip}>
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
            <button
              className="btn btnPrimary"
              onClick={executeSwap}
              disabled={!quote || !walletAddress || isQuoteExpired || quote.executionKind === "bitcoin-to-evm"}
            >
              {quote?.executionKind === "bitcoin-to-evm" ? "BTC Sell Quote Only" : isDryRun ? "Preview Swap" : "Swap"}
            </button>
            {quote?.executionKind === "bitcoin-to-evm" ? (
              <div className="small" style={{ marginTop: 8 }}>
                BTC sell quotes are available now. Sending from Bitcoin is not available yet.
              </div>
            ) : null}
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
              className={swapStatus === "confirmed" ? "ok" : swapStatus === "pending" || swapStatus === "submitted" ? "warn" : "error"}
              style={{ marginTop: 8 }}
            >
              Status: {formatSwapStatus(swapStatus)}
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

function formatSwapStatus(status: TxStatus): string {
  if (status === "idle") return "";
  return `${status[0]!.toUpperCase()}${status.slice(1)}`;
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
