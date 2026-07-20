import type { RouteStatusResponse } from "@/lib/types";
import { readProviderResponse, recordValue, stringValue } from "@/lib/server/quoteNormalization";
import { acquireLifiRequestBudget } from "@/lib/server/providerRequestBudget";

const LIFI_STATUS_TIMEOUT_MS = 10_000;

export type LifiStatusClientConfig = {
  baseUrl: string;
  apiKey?: string;
};

export type LifiStatusRequest = {
  transactionHash: string;
  fromChainId: number;
  toChainId: number;
  bridge?: string;
  signal?: AbortSignal;
};

export async function getLifiTransferStatus(
  config: LifiStatusClientConfig,
  request: LifiStatusRequest
): Promise<RouteStatusResponse> {
  const url = new URL("/v1/status", config.baseUrl);
  url.searchParams.set("txHash", request.transactionHash);
  url.searchParams.set("fromChain", String(request.fromChainId));
  url.searchParams.set("toChain", String(request.toChainId));
  if (request.bridge) url.searchParams.set("bridge", request.bridge);

  await acquireLifiRequestBudget();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(config.apiKey?.trim() ? { "x-lifi-api-key": config.apiKey.trim() } : {})
    },
    cache: "no-store",
    signal: request.signal ?? AbortSignal.timeout(LIFI_STATUS_TIMEOUT_MS)
  });
  if (response.status === 404) return normalizeLifiTransferStatus({ status: "NOT_FOUND" });
  const body = await readProviderResponse(response, "LI.FI");
  return normalizeLifiTransferStatus(body);
}

export function normalizeLifiTransferStatus(body: Record<string, unknown>): RouteStatusResponse {
  const providerStatus = stringValue(body.status).trim().toUpperCase() || "NOT_FOUND";
  const providerSubstatus = stringValue(body.substatus).trim().toUpperCase();
  const receiving = recordValue(body.receiving);
  const destinationTransactionHash = validTransactionIdentifier(stringValue(receiving.txHash));

  if (providerSubstatus.includes("REFUND")) {
    return {
      state: "refunded",
      message: "The route was refunded to the source wallet.",
      providerStatus,
      providerSubstatus,
      ...(destinationTransactionHash ? { destinationTransactionHash } : {})
    };
  }

  if (providerStatus === "DONE") {
    return {
      state: "completed",
      message: "Swap completed. The funds reached the recipient.",
      providerStatus,
      ...(providerSubstatus ? { providerSubstatus } : {}),
      ...(destinationTransactionHash ? { destinationTransactionHash } : {})
    };
  }

  if (providerStatus === "FAILED" || providerStatus === "INVALID") {
    return {
      state: "failed",
      message: "The route could not be completed. Check the source wallet before trying again.",
      providerStatus,
      ...(providerSubstatus ? { providerSubstatus } : {}),
      ...(destinationTransactionHash ? { destinationTransactionHash } : {})
    };
  }

  return {
    state: "pending",
    message: providerStatus === "NOT_FOUND"
      ? "Waiting for the source transaction to appear on the network."
      : "Your swap is on its way to the recipient.",
    providerStatus,
    ...(providerSubstatus ? { providerSubstatus } : {}),
    ...(destinationTransactionHash ? { destinationTransactionHash } : {})
  };
}

function validTransactionIdentifier(value: string): string | undefined {
  const normalized = value.trim();
  return /^(?:0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{80,90})$/.test(normalized)
    ? normalized
    : undefined;
}
