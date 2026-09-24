import { afterEach, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { MarketCollector } from "./collector";
import { radarServer, validPairKey } from "./http-server";

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of close.splice(0)) await cleanup();
});
async function fixture(mode: "research" | "commercial" = "research") {
  let queries = 0;
  const collector = {
    markets: () => {
      queries++;
      return [];
    },
    health: () => ({ activeInstruments: 1 }),
    metrics: { apiRequests: 0, apiTotalMs: 0 },
  } as unknown as MarketCollector;
  const server = radarServer({
    collector,
    store: null,
    mode,
    internalToken: "i".repeat(32),
    publicReadToken: "p".repeat(32),
    env: { MARKET_RADAR_LIVE_ENABLED: "true" },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  close.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  );
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    queries: () => queries,
  };
}
it("never exposes research market data through the commercial API", async () => {
  const f = await fixture();
  const response = await fetch(f.url + "/v1/markets", {
    headers: { authorization: `Bearer ${"p".repeat(32)}` },
  });
  expect(response.status).toBe(503);
  expect(f.queries()).toBe(0);
});
it("a commercial environment flag cannot override the reviewed data rights", async () => {
  const f = await fixture("commercial");
  expect(
    (
      await fetch(f.url + "/v1/markets", {
        headers: { authorization: `Bearer ${"p".repeat(32)}` },
      })
    ).status,
  ).toBe(503);
});
it("protects internal health and data with a distinct service credential", async () => {
  const f = await fixture();
  expect((await fetch(f.url + "/internal/health")).status).toBe(401);
  expect(
    (
      await fetch(f.url + "/internal/markets", {
        headers: { authorization: `Bearer ${"p".repeat(32)}` },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(f.url + "/internal/markets", {
        headers: { authorization: `Bearer ${"i".repeat(32)}` },
      })
    ).status,
  ).toBe(200);
  expect(f.queries()).toBe(1);
});
it("bounds user market identifiers and rejects execution methods", async () => {
  const f = await fixture();
  expect(
    (
      await fetch(f.url + "/internal/markets?q=" + "x".repeat(33), {
        headers: { authorization: `Bearer ${"i".repeat(32)}` },
      })
    ).status,
  ).toBe(400);
  expect((await fetch(f.url + "/v1/orders", { method: "POST" })).status).toBe(
    405,
  );
  expect(validPairKey("TEST/USDT/SPOT")).toBe(true);
  expect(validPairKey("../USDT/SPOT")).toBe(false);
  expect(validPairKey("TEST/TEST/SPOT")).toBe(false);
  expect(validPairKey("TEST/USDT/PERPETUAL")).toBe(false);
});
