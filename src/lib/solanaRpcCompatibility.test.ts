import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

describe("Solana JSON-RPC dependency compatibility", () => {
  it("round-trips balance requests through the supported RPC client", async () => {
    const address = new PublicKey("11111111111111111111111111111111");
    const fetchRpc = vi.fn<typeof fetch>(async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      expect(request).toMatchObject({
        jsonrpc: "2.0",
        method: "getBalance",
        params: [address.toBase58(), { commitment: "confirmed" }]
      });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { context: { slot: 1 }, value: 42 }
      }), { status: 200 });
    });
    const connection = new Connection("https://rpc.invalid", { fetch: fetchRpc });

    await expect(connection.getBalance(address, "confirmed")).resolves.toBe(42);
    expect(fetchRpc).toHaveBeenCalledOnce();
  });

  it("propagates RPC errors instead of accepting an invalid balance", async () => {
    const fetchRpc = vi.fn<typeof fetch>(async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message: "RPC unavailable" }
      }), { status: 200 });
    });
    const connection = new Connection("https://rpc.invalid", { fetch: fetchRpc });

    await expect(connection.getBalance(new PublicKey("11111111111111111111111111111111")))
      .rejects.toThrow("RPC unavailable");
  });
});
