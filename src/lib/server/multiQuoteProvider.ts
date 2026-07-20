import type { QuoteProviderError, QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
  getProviderErrorStatus,
  providerError,
  rankQuotes,
  sanitizeQuoteForList
} from "@/lib/server/quoteNormalization";

const PROVIDER_TIMEOUT_MS = 9_000;

export class MultiQuoteProvider implements DexAggregatorClient {
  providerId = "multi";
  providerName = "Best route";

  constructor(private readonly clients: DexAggregatorClient[]) {}

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const candidates = this.clients.filter(
      (client) => !client.supportedChainIds || client.supportedChainIds.includes(params.chainId)
    );
    if (!candidates.length) throw new Error("No swap providers support this network yet.");

    const settled = await Promise.allSettled(
      candidates.map(async (client) => {
        const startedAt = Date.now();
        const quote = await withProviderTimeout(
          client,
          params,
          PROVIDER_TIMEOUT_MS,
          `${client.providerName} quote took too long.`
        );
        logProviderResult(client, params.chainId, Date.now() - startedAt);
        return { client, quote };
      })
    );

    const quotes: QuoteResponse[] = [];
    const quoteErrors: QuoteProviderError[] = [];

    settled.forEach((result, index) => {
      const client = candidates[index]!;
      if (result.status === "fulfilled") {
        quotes.push(result.value.quote);
      } else {
        logProviderResult(client, params.chainId, undefined, result.reason);
        quoteErrors.push(providerError(client.providerId, client.providerName, result.reason));
      }
    });

    if (!quotes.length) {
      const detail = quoteErrors.map((error) => `${error.providerName}: ${error.message}`).join("; ");
      const statuses = quoteErrors.map((error) => error.status).filter((status): status is number => !!status);
      const status = statuses.includes(429)
        ? 429
        : statuses.every((candidate) => [400, 404, 422].includes(candidate))
          ? 422
          : 503;
      throw Object.assign(new Error(detail || "No swap provider returned a quote."), { status });
    }

    const ranked = rankQuotes(quotes).map((quote, index) => ({
      ...quote,
      providerRank: index + 1,
      isBest: index === 0
    }));

    const best = ranked[0]!;
    const availableQuotes = ranked.map(sanitizeQuoteForList);
    return {
      ...best,
      availableQuotes,
      quoteErrors
    };
  }
}

function logProviderResult(
  client: DexAggregatorClient,
  chainId: number,
  durationMs?: number,
  error?: unknown
) {
  const event = {
    event: error ? "quote_provider_failed" : "quote_provider_succeeded",
    providerId: client.providerId,
    providerName: client.providerName,
    chainId,
    durationMs
  };
  if (error) {
    console.warn({
      ...event,
      errorType: error instanceof Error ? error.name : "UnknownError",
      status: getProviderErrorStatus(error)
    });
  } else {
    console.info(event);
  }
}

function withProviderTimeout(
  client: DexAggregatorClient,
  params: QuoteParams,
  timeoutMs: number,
  message: string
): Promise<QuoteResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error(message)), { once: true });
  });

  return Promise.race([
    client.getQuote({ ...params, signal: controller.signal }),
    timeoutPromise
  ]).finally(() => clearTimeout(timeout));
}
