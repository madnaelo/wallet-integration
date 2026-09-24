import { expect, test } from "@playwright/test";
import { syntheticRadar } from "../src/lib/marketRadarDemo";

for (const width of [1440, 390]) {
  test(`private Radar authorization, derived view and lock at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls: string[] = [];
    await page.route("**/api/admin/market-radar/**", async (route) => {
      const request = route.request();
      calls.push(request.url());
      expect(request.headers()["x-admin-key"]).toBe("test-only-owner-key");
      expect(request.url()).not.toContain("test-only");
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/status"))
        return route.fulfill({
          json: { mode: "PRIVATE / INTERNAL LIVE DATA" },
        });
      if (path.endsWith("/markets"))
        return route.fulfill({ json: [{ key: "SOL/USDT/SPOT" }] });
      const snapshot = syntheticRadar(0);
      snapshot.observedAt = Date.now();
      snapshot.calculatedAt = Date.now();
      snapshot.venues = [
        {
          venue: "binance",
          healthy: true,
          ageMs: 0,
          reason: "",
          continuity: "VERIFIED",
        },
      ];
      for (const zone of [...snapshot.supplyZones, ...snapshot.demandZones])
        zone.venues = [{ venue: "binance", weight: 1, notional: 10000 }];
      return route.fulfill({ json: snapshot });
    });
    await page.goto("/admin/market-radar");
    await expect(
      page.getByRole("heading", { name: "Owner access" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    expect(calls).toEqual([]);
    await page.getByLabel("Admin access key").fill("test-only-owner-key");
    await page.getByRole("button", { name: "Open private Radar" }).click();
    await expect(
      page.getByRole("heading", { name: "Next Supply Zone" }),
    ).toBeVisible();
    await expect(
      page.getByText("PRIVATE / INTERNAL LIVE DATA", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Cross-exchange confirmation is unavailable", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
    ).not.toContain("test-only-owner-key");
    await page.screenshot({
      path: testInfo.outputPath(`private-radar-fixture-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Lock workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "Next Supply Zone" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Admin access key")).toHaveValue("");
    await expect(
      page.getByRole("heading", { name: "Owner access" }),
    ).toBeVisible();
  });
}
test("invalid private authorization does not display derived market data", async ({
  page,
}) => {
  await page.route("**/api/admin/market-radar/**", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.goto("/admin/market-radar");
  await page.getByLabel("Admin access key").fill("invalid");
  await page.getByRole("button", { name: "Open private Radar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Owner access denied");
  await expect(
    page.getByRole("heading", { name: "Next Supply Zone" }),
  ).toHaveCount(0);
});

test("locking fences a late private snapshot response", async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let pending = false;
  await page.route("**/api/admin/market-radar/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status")) return route.fulfill({ json: {} });
    if (path.endsWith("/markets")) return route.fulfill({ json: [{ key: "SOL/USDT/SPOT" }] });
    pending = true;
    await gate;
    await route.fulfill({ json: syntheticRadar(0) }).catch(() => {});
  });
  await page.goto("/admin/market-radar");
  await page.getByLabel("Admin access key").fill("test-only-owner-key");
  await page.getByRole("button", { name: "Open private Radar" }).click();
  await expect.poll(() => pending).toBe(true);
  await page.getByRole("button", { name: "Lock workspace" }).click();
  release?.();
  await expect(page.getByRole("heading", { name: "Owner access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next Supply Zone" })).toHaveCount(0);
  await expect(page.getByLabel("Admin access key")).toHaveValue("");
});
