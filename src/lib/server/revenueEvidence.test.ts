import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRevenueSnapshot, captureRevenueEvidence, evidenceHash, signRevenuePayload } from "./revenueEvidence";
import type { QuoteParams } from "./aggregator";
import type { QuoteResponse } from "@/lib/types";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const params: QuoteParams = { chainId: 1, buyChainId: 1, sellToken: token, sellTokenSymbol: "TOK", sellTokenDecimals: 6,
  buyToken: "ETH", buyTokenSymbol: "ETH", buyTokenDecimals: 18, takerAddress: wallet, sellAmount: "1000000" };
const quote = (): QuoteResponse => ({ quoteId:"q", providerId:"0x", executionKind:"evm-same-chain", sellAmount:"1000000",
  buyAmount:"2000", minBuyAmount:"1900", to:wallet, data:"0xAbCd", value:"0", platformFeeBps:20,
  serviceFees:[{kind:"platform", label:"Platform fee", amount:"2000", token}] });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server quote evidence", () => {
  it("binds chains, assets, amount, fee, owner and the exact transaction hash", () => {
    const snapshot = buildRevenueSnapshot(quote(), params, wallet)!;
    expect(snapshot).toMatchObject({ owner:wallet, sourceChain:1, destinationChain:1, sellAmount:"1000000",
      expectedFee:"2000", feeBps:20, feeBasis:"sell_amount_floor", dataHash:evidenceHash("0xabcd") });
    expect(snapshot).not.toHaveProperty("data");
  });
  it("rejects ambiguous fee denomination instead of inventing a conversion", () => {
    const changed = quote();
    changed.serviceFees![0]!.token = "ETH";
    expect(() => buildRevenueSnapshot(changed, params, wallet)).toThrow(/fee basis/);
  });
  it("uses a scoped signature and rejects missing keys", () => {
    expect(signRevenuePayload("payload", "a".repeat(32))).toHaveLength(64);
    expect(signRevenuePayload("payload2", "a".repeat(32))).not.toBe(signRevenuePayload("payload", "a".repeat(32)));
    expect(() => signRevenuePayload("payload", "")).toThrow();
  });
  it("only returns the durable ID after successful persistence, and preserves alternative routes", async () => {
    vi.stubEnv("REVENUE_ENABLED","true");
    vi.stubEnv("REVENUE_BACKEND_URL","https://accounting.example");
    vi.stubEnv("REVENUE_INGEST_SECRET","a".repeat(32));
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}",{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    const result = quote();
    result.availableQuotes = [quote()];
    await captureRevenueEvidence(result,params,wallet,[{provider:"0x",outcome:"quoted"}]);
    expect(result.revenueQuoteId).toBe(result.availableQuotes[0]!.revenueQuoteId);
    const envelope = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(envelope.signature).toBe(signRevenuePayload(envelope.payload,"a".repeat(32)));
    expect(JSON.parse(envelope.payload).outcomes).toEqual([{provider:"0x",outcome:"quoted"}]);
    fetchMock.mockResolvedValue(new Response("{}",{status:503}));
    const failed = quote();
    await expect(captureRevenueEvidence(failed,params,wallet,[])).rejects.toThrow(/unavailable/);
    expect(failed.revenueQuoteId).toBeUndefined();
  });
});
