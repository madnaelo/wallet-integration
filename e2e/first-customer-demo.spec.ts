import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
  test(`branded assessment sample stays synthetic at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      for (const name of ["ethereum", "solana", "bitcoin"]) {
        Object.defineProperty(window, name, { get() { throw new Error("Demo must not access wallets"); } });
      }
    });
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const request = route.request();
      const url = new URL(request.url());
      const target = new URL(testInfo.project.use.baseURL!);
      if (url.origin !== target.origin || /\/(api|backend)\//.test(url.pathname)
        || ["fetch", "xhr"].includes(request.resourceType())) {
        unexpected.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    page.on("websocket", () => unexpected.push("WebSocket"));
    const response = await page.goto("/demo");
    const expectedBrand = process.env.PLAYWRIGHT_DEMO_BRAND ?? "Swap Assistant";
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedBrand);
    expect(response?.headers()["content-security-policy"]).toContain("connect-src 'none'");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByRole("button", { name: "Use sample wallet", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Reverse pair", exact: true }).click();
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("100");
    await expect(page.getByRole("button", { name: "You sell: USDC", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "You receive: ETH", exact: true })).toBeVisible();
    await expect(page.getByLabel("Sample trade summary")).toContainText("0.03992 ETH");
    await expect(page.getByLabel("Sample trade summary")).toContainText("0.0397204 ETH");
    await expect(page.getByLabel("Sample trade summary")).toContainText("0.00008 ETH");
    await page.screenshot({ path: testInfo.outputPath("01-pair-and-costs.png"), fullPage: true });
    await page.getByRole("button", { name: "Use sample wallet", exact: true }).click();
    await page.getByRole("button", { name: "Review sample quote", exact: true }).click();
    await expect(page.getByText("Your wallet, your approval.", { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("02-approval-boundary.png"), fullPage: true });
    await page.getByRole("button", { name: "Complete preview", exact: true }).click();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("cell", { name: "Preview only", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("03-ephemeral-activity.png"), fullPage: true });
    await page.reload();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("cell", { name: "Preview only", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
      .toEqual({ local: 0, session: 0 });
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
