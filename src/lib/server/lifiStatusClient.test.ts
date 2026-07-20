import { afterEach, describe, expect, it, vi } from "vitest";
import { getLifiTransferStatus, normalizeLifiTransferStatus } from "@/lib/server/lifiStatusClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LI.FI transfer status", () => {
  it("requests status with the source route identity and API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "DONE",
      substatus: "COMPLETED",
      receiving: { txHash: `0x${"a".repeat(64)}` }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLifiTransferStatus(
      { baseUrl: "https://li.quest", apiKey: "test-key" },
      {
        transactionHash: `0x${"b".repeat(64)}`,
        fromChainId: 1,
        toChainId: 8453,
        bridge: "across"
      }
    );

    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.searchParams.get("txHash")).toBe(`0x${"b".repeat(64)}`);
    expect(url.searchParams.get("fromChain")).toBe("1");
    expect(url.searchParams.get("toChain")).toBe("8453");
    expect(url.searchParams.get("bridge")).toBe("across");
    expect((init as RequestInit).headers).toMatchObject({ "x-lifi-api-key": "test-key" });
    expect(result).toMatchObject({ state: "completed", destinationTransactionHash: `0x${"a".repeat(64)}` });
  });

  it("maps refunds distinctly from failed routes", () => {
    expect(normalizeLifiTransferStatus({ status: "FAILED", substatus: "REFUNDED" }))
      .toMatchObject({ state: "refunded" });
    expect(normalizeLifiTransferStatus({ status: "FAILED", substatus: "UNKNOWN_ERROR" }))
      .toMatchObject({ state: "failed" });
    expect(normalizeLifiTransferStatus({ status: "DONE", substatus: "REFUNDED" }))
      .toMatchObject({ state: "refunded" });
  });

  it("treats a not-yet-indexed transaction as pending", () => {
    expect(normalizeLifiTransferStatus({ status: "NOT_FOUND" }))
      .toMatchObject({ state: "pending", providerStatus: "NOT_FOUND" });
  });

  it("treats the provider's HTTP 404 as a not-yet-indexed transaction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Transaction hash is not found in any chain.", code: 1003 }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    )));

    const status = await getLifiTransferStatus(
      { baseUrl: "https://li.quest" },
      { transactionHash: `0x${"b".repeat(64)}`, fromChainId: 1, toChainId: 8453 }
    );

    expect(status).toMatchObject({ state: "pending", providerStatus: "NOT_FOUND" });
  });
});
