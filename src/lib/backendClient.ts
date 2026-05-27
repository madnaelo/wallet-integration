import type { QuoteResponse } from "@/lib/types";

export type BackendSession = {
  walletAddress: string;
  accessToken: string;
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
  reverseProfitThresholdBps: number;
  reverseLossEnabled: boolean;
  reverseLossThresholdBps: number;
  cooldownMinutes: number;
};

export type SaveNotificationPreferenceRequest = {
  emailAddress?: string | null;
  emailEnabled?: boolean;
  telegramEnabled?: boolean;
  reverseProfitThresholdBps?: number;
  reverseLossEnabled?: boolean;
  reverseLossThresholdBps?: number;
  cooldownMinutes?: number;
};

export type TelegramLinkStart = {
  code: string;
  botUsername: string;
  deepLink: string;
  expiresAt: string;
};

export type FeatureFlags = {
  autoSwapEnabled: boolean;
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
  return backendFetch<FeatureFlags>(backendBaseUrl, "/api/features", {
    method: "GET"
  });
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

export async function saveSwapHistory(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveSwapHistoryRequest
): Promise<SwapHistoryRecord> {
  return backendFetch<SwapHistoryRecord>(backendBaseUrl, "/api/swap-history", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
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
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function getNotificationPreferences(
  backendBaseUrl: string,
  session: BackendSession
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function saveNotificationPreferences(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveNotificationPreferenceRequest
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify(request)
  });
}

export async function startTelegramLink(
  backendBaseUrl: string,
  session: BackendSession
): Promise<TelegramLinkStart> {
  return backendFetch<TelegramLinkStart>(backendBaseUrl, "/api/notifications/preferences/telegram-link", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function completeTelegramLink(
  backendBaseUrl: string,
  session: BackendSession
): Promise<NotificationPreference> {
  return backendFetch<NotificationPreference>(backendBaseUrl, "/api/notifications/preferences/telegram-link/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function listFavoritePairs(
  backendBaseUrl: string,
  session: BackendSession
): Promise<FavoritePair[]> {
  return backendFetch<FavoritePair[]>(backendBaseUrl, "/api/favorite-pairs", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function saveFavoritePair(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveFavoritePairRequest
): Promise<FavoritePair> {
  return backendFetch<FavoritePair>(backendBaseUrl, "/api/favorite-pairs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
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
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function listAutoSwapRules(
  backendBaseUrl: string,
  session: BackendSession
): Promise<AutoSwapRule[]> {
  return backendFetch<AutoSwapRule[]>(backendBaseUrl, "/api/auto-swap/rules", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

export async function saveAutoSwapRule(
  backendBaseUrl: string,
  session: BackendSession,
  request: SaveAutoSwapRuleRequest
): Promise<AutoSwapRule> {
  return backendFetch<AutoSwapRule>(backendBaseUrl, "/api/auto-swap/rules", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify(request)
  });
}

export async function deleteAutoSwapRule(
  backendBaseUrl: string,
  session: BackendSession,
  id: string
): Promise<void> {
  await backendFetch<Record<string, never>>(backendBaseUrl, `/api/auto-swap/rules/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

async function backendFetch<T>(backendBaseUrl: string, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${backendBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error ?? body?.message ?? `Backend request failed with status ${res.status}`;
    throw new BackendClientError(message, res.status, body);
  }
  return body as T;
}
