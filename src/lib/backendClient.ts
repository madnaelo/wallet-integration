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
  cooldownMinutes: number;
};

export type SaveNotificationPreferenceRequest = {
  emailAddress?: string | null;
  emailEnabled?: boolean;
  telegramChatId?: string | null;
  telegramEnabled?: boolean;
  reverseProfitThresholdBps?: number;
  cooldownMinutes?: number;
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
