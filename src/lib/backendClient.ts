import type { QuoteResponse } from "@/lib/types";

export type BackendSession = {
  walletAddress: string;
  accessToken?: string | null;
  expiresAt: string;
};

export type AuthNonceResponse = {
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type SaveSwapHistoryRequest = {
  chainId: number;
  txHash?: string;
  status: "dry_run" | "submitted" | "confirmed" | "failed";
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellAmountRaw: string;
  buyAmountRaw: string;
  minBuyAmountRaw?: string;
  aggregator: string;
  quote: QuoteResponse;
};

export type SwapHistoryRecord = SaveSwapHistoryRequest & {
  id: string;
  walletAddress: string;
  submittedAt?: string;
  confirmedAt?: string;
  createdAt: string;
};

export type NotificationPreference = {
  walletAddress: string;
  emailAddress?: string | null;
  emailEnabled: boolean;
  telegramChatId?: string | null;
  telegramEnabled: boolean;
  pushEnabled: boolean;
  pushSubscriptionCount: number;
  reverseProfitThresholdBps: number;
  reverseLossEnabled: boolean;
  reverseLossThresholdBps: number;
  cooldownMinutes: number;
};

export type SaveNotificationPreferenceRequest = {
  emailAddress?: string | null;
  emailEnabled?: boolean;
  telegramEnabled?: boolean;
  pushEnabled?: boolean;
  reverseProfitThresholdBps?: number;
  reverseLossEnabled?: boolean;
  reverseLossThresholdBps?: number;
  cooldownMinutes?: number;
};

export type PushNotificationConfig = {
  enabled: boolean;
  vapidPublicKey: string;
};

export type PushSubscriptionStatus = {
  linked: boolean;
  walletSubscriptionCount: number;
};

export type TelegramLinkStart = {
  code: string;
  botUsername: string;
  deepLink: string;
  expiresAt: string;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

export type PushDiagnosticEntryPayload = {
  time: string;
  stage: string;
  status: "info" | "success" | "error";
  detail: string;
};

export type PushDiagnosticReportPayload = {
  attemptId: string;
  result: string;
  location: string;
  entries: PushDiagnosticEntryPayload[];
};

export type FeatureFlags = {
  autoSwapEnabled: boolean;
  priceAlertsEnabled: boolean;
  limitOrdersEnabled: boolean;
};

export type FavoritePair = {
  id: string;
  walletAddress: string;
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  targetRate?: string | null;
  alertDirection: "above" | "below";
  alertsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveFavoritePairRequest = {
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  targetRate?: string | null;
  alertDirection?: "above" | "below";
  alertsEnabled?: boolean;
};

export type AutoSwapRule = {
  id: string;
  walletAddress: string;
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellAmountRaw: string;
  thresholdRate: string;
  alertDirection: "above" | "below";
  slippageBps: number;
  recipientAddress: string;
  executionMode: "auto_when_supported" | "notify_to_confirm";
  executionReadiness: "auto_supported" | "confirmation_required";
  status: "active" | "paused" | "completed" | "cancelled";
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveAutoSwapRuleRequest = {
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellAmountRaw: string;
  thresholdRate: string;
  alertDirection?: "above" | "below";
  slippageBps: number;
  recipientAddress: string;
  executionMode?: "notify_to_confirm";
};

export type LimitOrderCapabilityRequest = {
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
};

export type LimitOrderCapability = {
  automaticExecutionSupported: boolean;
  executionProvider: string;
  executionSupport: "supported" | "unsupported";
  reason: string;
  requiredSignature: string;
  riskLevel: string;
};

export type LimitOrder = {
  id: string;
  walletAddress: string;
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  targetRate: string;
  expiresAt: string;
  recipientAddress: string;
  executionProvider: string;
  executionSupport: "supported" | "unsupported";
  executionStatus: string;
  signedPayloadHash: string;
  orderHash: string;
  providerOrderId?: string | null;
  termsAcceptedAt: string;
  executionError?: string | null;
  submittedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveLimitOrderRequest = LimitOrderCapabilityRequest & {
  sellAmountRaw: string;
  minBuyAmountRaw: string;
  targetRate: string;
  expiresAt: string;
  recipientAddress: string;
  executionProvider: string;
  orderHash: string;
  signature: string;
  signedPayloadJson: string;
  termsAccepted: boolean;
};

export class BackendClientError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "BackendClientError";
    this.status = status;
    this.body = body;
  }
}

export async function getFeatureFlags(backendBaseUrl: string): Promise<FeatureFlags> {
  const flags = await backendFetch<Partial<FeatureFlags>>(backendBaseUrl, "/api/features", {
    method: "GET"
  });
  const priceAlertsEnabled = Boolean(flags.priceAlertsEnabled ?? flags.autoSwapEnabled);
  return {
    autoSwapEnabled: priceAlertsEnabled,
    priceAlertsEnabled,
    limitOrdersEnabled: Boolean(flags.limitOrdersEnabled)
  };
}

export async function requestAuthNonce(backendBaseUrl: string, walletAddress: string): Promise<AuthNonceResponse> {
  return backendFetch<AuthNonceResponse>(backendBaseUrl, "/api/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ walletAddress })
  });
}

export async function verifyAuthSignature(
  backendBaseUrl: string,
  walletAddress: string,
  signature: string
): Promise<BackendSession> {
  return backendFetch<BackendSession>(backendBaseUrl, "/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature })
  });
}

export async function logoutBackendSession(backendBaseUrl: string, session?: BackendSession | null): Promise<void> {
  await backendFetch<Record<string, never>>(backendBaseUrl, "/api/auth/logout", {
    method: "POST",
    headers: authHeaders(session)
  });
}

export async function saveSwapHistory(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveSwapHistoryRequest
): Promise<SwapHistoryRecord> {
  return backendFetch<SwapHistoryRecord>(backendBaseUrl, "/api/swap-history", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(request)
  });
}

export async function listSwapHistory(
  backendBaseUrl: string,
  session: BackendSession,
  limit = 25
): Promise<SwapHistoryRecord[]> {
  return backendFetch<SwapHistoryRecord[]>(backendBaseUrl, `/api/swap-history?limit=${limit}`, {
    method: "GET",
    headers: authHeaders(session)
  });
}

export async function getNotificationPreferences(
  backendBaseUrl: string,
  session: BackendSession
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences", {
    method: "GET",
    headers: authHeaders(session)
  });
}

export async function getPushNotificationConfig(backendBaseUrl: string): Promise<PushNotificationConfig> {
  return backendFetch<PushNotificationConfig>(backendBaseUrl, "/api/notifications/preferences/push-config", {
    method: "GET"
  });
}

export async function saveNotificationPreferences(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveNotificationPreferenceRequest
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences", {
    method: "PUT",
    headers: authHeaders(session),
    body: JSON.stringify(request)
  });
}

export async function startTelegramLink(
  backendBaseUrl: string,
  session: BackendSession
): Promise<TelegramLinkStart> {
  return backendFetch<TelegramLinkStart>(backendBaseUrl, "/api/notifications/preferences/telegram-link", {
    method: "POST",
    headers: authHeaders(session)
  });
}

export async function completeTelegramLink(
  backendBaseUrl: string,
  session: BackendSession
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences/telegram-link/complete", {
    method: "POST",
    headers: authHeaders(session)
  });
}

export async function savePushSubscription(
  backendBaseUrl: string,
  session: BackendSession,
  subscription: PushSubscriptionPayload
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences/push-subscriptions", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(subscription)
  });
}

export async function getPushSubscriptionStatus(
  backendBaseUrl: string,
  session: BackendSession,
  endpoint?: string
): Promise<PushSubscriptionStatus> {
  return backendFetch<PushSubscriptionStatus>(backendBaseUrl, "/api/notifications/preferences/push-subscriptions/status", {
    method: "POST",
    headers: authHeaders(session),
    body: endpoint ? JSON.stringify({ endpoint }) : undefined
  });
}

export async function submitPushDiagnostics(
  backendBaseUrl: string,
  session: BackendSession,
  report: PushDiagnosticReportPayload
): Promise<void> {
  await backendFetch<Record<string, never>>(backendBaseUrl, "/api/notifications/preferences/push-diagnostics", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(report)
  });
}

export async function disablePushSubscriptions(
  backendBaseUrl: string,
  session: BackendSession,
  endpoint?: string
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences/push-subscriptions", {
    method: "DELETE",
    headers: authHeaders(session),
    body: endpoint ? JSON.stringify({ endpoint }) : undefined
  });
}

export async function listFavoritePairs(
  backendBaseUrl: string,
  session: BackendSession
): Promise<FavoritePair[]> {
  return backendFetch<FavoritePair[]>(backendBaseUrl, "/api/favorite-pairs", {
    method: "GET",
    headers: authHeaders(session)
  });
}

export async function saveFavoritePair(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveFavoritePairRequest
): Promise<FavoritePair> {
  return backendFetch<FavoritePair>(backendBaseUrl, "/api/favorite-pairs", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(request)
  });
}

export async function deleteFavoritePair(
  backendBaseUrl: string,
  session: BackendSession,
  id: string
): Promise<void> {
  await backendFetch<Record<string, never>>(backendBaseUrl, `/api/favorite-pairs/${id}`, {
    method: "DELETE",
    headers: authHeaders(session)
  });
}

export async function listAutoSwapRules(
  backendBaseUrl: string,
  session: BackendSession
): Promise<AutoSwapRule[]> {
  return backendFetch<AutoSwapRule[]>(backendBaseUrl, "/api/price-alerts/rules", {
    method: "GET",
    headers: authHeaders(session)
  });
}

export async function saveAutoSwapRule(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveAutoSwapRuleRequest
): Promise<AutoSwapRule> {
  return backendFetch<AutoSwapRule>(backendBaseUrl, "/api/price-alerts/rules", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(request)
  });
}

export async function deleteAutoSwapRule(
  backendBaseUrl: string,
  session: BackendSession,
  id: string
): Promise<void> {
  await backendFetch<Record<string, never>>(backendBaseUrl, `/api/price-alerts/rules/${id}`, {
    method: "DELETE",
    headers: authHeaders(session)
  });
}

export async function checkLimitOrderCapability(
  backendBaseUrl: string,
  request: LimitOrderCapabilityRequest
): Promise<LimitOrderCapability> {
  return backendFetch<LimitOrderCapability>(backendBaseUrl, "/api/limit-orders/capability", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function listLimitOrders(
  backendBaseUrl: string,
  session: BackendSession
): Promise<LimitOrder[]> {
  return backendFetch<LimitOrder[]>(backendBaseUrl, "/api/limit-orders", {
    method: "GET",
    headers: authHeaders(session)
  });
}

export async function saveLimitOrder(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveLimitOrderRequest
): Promise<LimitOrder> {
  return backendFetch<LimitOrder>(backendBaseUrl, "/api/limit-orders", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(request)
  });
}

async function backendFetch<T>(backendBaseUrl: string, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${backendBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error ?? body?.message ?? `The request could not be completed. Please try again. (${res.status})`;
    throw new BackendClientError(message, res.status, body);
  }
  return body as T;
}

function authHeaders(session?: BackendSession | null): HeadersInit {
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}
