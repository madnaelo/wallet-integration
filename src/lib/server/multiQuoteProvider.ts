import type { QuoteProviderError, QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
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
        const quote = await withTimeout(
          client.getQuote(params),
          PROVIDER_TIMEOUT_MS,
          `${client.providerName} quote took too long.`
        );
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
        quoteErrors.push(providerError(client.providerId, client.providerName, result.reason));
      }
    });

    if (!quotes.length) {
      const detail = quoteErrors.map((error) => `${error.providerName}: ${error.message}`).join("; ");
      throw new Error(detail || "No swap provider returned a quote.");
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}
