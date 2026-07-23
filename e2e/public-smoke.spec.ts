import { expect, test } from "@playwright/test";

const ethereumTokens = [
  {
    symbol: "ETH",
    address: "ETH",
    decimals: 18,
    isNative: true,
    name: "Ether",
    searchAliases: ["Ethereum"]
  },
  {
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    name: "Tether USD"
  },
  {
    symbol: "WBTC",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    name: "Wrapped Bitcoin",
    searchAliases: ["BTC", "Bitcoin"]
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("wallet.swapAssistant.swapTour.v1", "done");
  });
  await page.route("**/backend/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Endpoint is intentionally unavailable during browser acceptance tests." })
    });
  });
  await page.route("**/api/features", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ priceAlertsEnabled: true, limitOrdersEnabled: true })
    });
  });
  await page.route("**/api/tokens?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ tokens: ethereumTokens })
    });
  });
});

test("intro explains custody boundaries and exposes crawlable metadata", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.getByRole("heading", { level: 1, name: "Swap Assistant" })).toBeVisible();
  await expect(page.getByText(/cannot move funds by itself/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Swap" })).toHaveAttribute("href", "/swap");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /swap/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

test("contact form works without a wallet and keeps the recipient inbox private", async ({ page }) => {
  let submission: Record<string, unknown> | undefined;
  await page.unroute("**/backend/api/**");
  await page.route("**/backend/api/contact", async (route) => {
    submission = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true })
    });
  });

  await page.goto("/contact");

  await expect(page.getByRole("heading", { level: 1, name: "How can we help?" })).toBeVisible();
  await expect(page.getByText(/do not need to connect or sign in with a wallet/i)).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await page.getByLabel("Name (optional)", { exact: true }).fill("Browser test");
  await page.getByLabel("Email address *", { exact: true }).fill("browser@example.invalid");
  await page.getByLabel("Topic *", { exact: true }).selectOption("privacy");
  await page.getByLabel("Message *", { exact: true }).fill("Please verify this contact form submission.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Thanks. Your message has been received.")).toBeVisible();
  expect(submission).toMatchObject({
    name: "Browser test",
    email: "browser@example.invalid",
    topic: "privacy",
    message: "Please verify this contact form submission.",
    website: ""
  });
});

test("swap token picker restores keyboard focus and navigation stays available", async ({ page }) => {
  await page.goto("/swap");

  await expect(page.getByRole("heading", { level: 1, name: "Swap Assistant" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  const sellToken = page.getByRole("button", { name: /Sell token:/ });
  await expect(sellToken).toBeVisible();
  await sellToken.click();
  const search = page.getByRole("textbox", { name: "Sell token search" });
  await expect(search).toBeFocused();
  await search.fill("Tether");
  await expect(page.getByRole("button", { name: /USDT.*Tether USD/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sellToken).toBeFocused();
  await expect(page.getByRole("link", { name: "Limit Orders" })).toHaveAttribute("href", "/limit-orders");
});

test("wallet-scoped pages explain their sign-in gates", async ({ page }) => {
  await page.goto("/swap#preferences");
  await expect(page.getByRole("heading", { level: 2, name: "Preferences" })).toBeVisible();
  await expect(page.getByText("Connect your wallet to manage alerts")).toBeVisible();

  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Favorite Pairs" })).toBeVisible();
  await expect(page.getByText("Connect your wallet to save favorite pairs", { exact: true })).toBeVisible();
});

test("limit orders disclose safeguards before accepting an order", async ({ page }) => {
  const requestedTokenChains: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/tokens") {
      requestedTokenChains.push(url.searchParams.get("chainId") ?? "");
    }
  });

  await page.goto("/limit-orders");

  await expect(page.getByRole("heading", { level: 2, name: "Swap later at the price you choose." })).toBeVisible();
  await expect(page.getByText("Wallet approval required")).toBeVisible();
  await expect(page.getByText("Exact signed terms")).toBeVisible();
  await expect(page.getByText("No custody of funds")).toBeVisible();
  await expect(page.getByRole("region", { name: "Limit order form" })).toBeVisible();
  await expect(page.getByText("Showing popular tokens while the full list is unavailable.")).toHaveCount(0);
  expect(requestedTokenChains).toEqual(["1"]);
});

test("mobile token picker remains inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/swap");
  await page.getByRole("button", { name: /Buy token:/ }).click();

  const panel = page.getByRole("dialog", { name: "Buy token options" });
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(360);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("PWA manifest is installable and uses standalone navigation", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe("Swap Assistant");
  expect(manifest.start_url).toBe("/swap");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ purpose: expect.stringContaining("maskable") })])
  );
});
