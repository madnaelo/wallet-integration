import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/growth/events", route => route.fulfill({ status: 204 }));
});

test("contact cannot submit private form fields before hydration", async ({ page }) => {
  let releaseScripts!: () => void;
  const gate = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route("**/_next/static/**/*.js", async route => { await gate; await route.continue(); });
  const navigation = page.goto("/contact?enquiry=branded-demo", { waitUntil: "commit" });
  try {
    await navigation;
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
    await expect(page.getByLabel("Email address *")).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("method", "post");
  } finally { releaseScripts(); }
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(page.getByLabel("Topic *")).toHaveValue("partnership");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`safe demo and sales contact at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", { get() { throw new Error("Demo must not access a wallet"); } });
    });
    const errors: string[] = [];
    const unsafeRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (["fetch", "xhr", "websocket"].includes(request.resourceType()) || /\/(api|backend)\//.test(request.url())) unsafeRequests.push(request.url());
    });
    const response = await page.goto("/demo");
    expect(response?.headers()["content-security-policy"]).toContain("connect-src 'none'");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByText("Interactive demonstration", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "You receive: USDC", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "You receive options" });
    await expect(picker).toBeVisible();
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Use sample wallet" }).click();
    await page.getByRole("button", { name: "Review sample quote" }).click();
    await expect(page.getByText("Your wallet, your approval.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Complete preview" }).click();
    await expect(page.getByRole("status")).toContainText("No wallet was opened");
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(page.getByRole("cell", { name: "Preview only" })).toBeVisible();
    await page.getByRole("tab", { name: "Alerts" }).click();
    await page.getByRole("button", { name: "Save sample alert" }).click();
    await expect(page.getByRole("status")).toContainText("Nothing is scheduled or sent");
    await page.getByRole("tab", { name: "Swap", exact: true }).click();
    await expect(page.getByRole("button", { name: "Complete preview" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(unsafeRequests).toEqual([]);
    expect(errors).toEqual([]);
    await page.goto("/business");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Branded crypto swap software");
    const productImage = page.getByRole("img", { name: "Swap Assistant demonstration with sample wallet, token selection, route comparison and fee review" });
    await productImage.scrollIntoViewIfNeeded();
    await expect.poll(() => productImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Request a branded demo", exact: true }).first().click();
    await expect(page.getByLabel("Topic *")).toHaveValue("partnership");
    await expect(page.getByLabel("Message *")).toContainText("branded demo");
    // Keep acceptance testing isolated: no prospect email or production backend call.
    await page.route("**/api/contact", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"accepted"}' }));
    await page.getByLabel("Email address *").fill("prospect@example.test");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your message has been received");
  });
}
