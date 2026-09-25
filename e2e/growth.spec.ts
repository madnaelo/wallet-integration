import { expect, test } from "@playwright/test";
import { buyerPages, guidePages } from "../src/lib/growthContent";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/growth/events", route => route.fulfill({ status: 204 }));
});

for (const width of [390, 1440]) {
  test(`buyer journey preserves bounded attribution at ${width}px without tracking the demo`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const events: Record<string, unknown>[] = [];
    await page.route("**/api/growth/events", route => {
      events.push(route.request().postDataJSON());
      return route.fulfill({ status: 204 });
    });
    await page.goto("/for-web3-agencies?utm_source=outreach&utm_medium=email&utm_campaign=agency_pilot");
    await expect.poll(() => events.length).toBe(1);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("agencies");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "See the demo", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\?.*utm_campaign=agency_pilot/);
    const requests: string[] = [];
    page.on("request", request => {
      if (["fetch", "xhr", "websocket"].includes(request.resourceType())) requests.push(request.url());
    });
    await page.getByRole("tab", { name: "Market Radar", exact: true }).click();
    await expect(page.getByText("Synthetic", { exact: false }).first()).toBeVisible();
    expect(requests).toEqual([]);
    expect(events.filter(event => event.page === "/demo")).toEqual([]);
    await page.getByRole("link", { name: "Get in touch", exact: true }).click();
    await expect(page).toHaveURL(/\/contact\?.*utm_campaign=agency_pilot/);
    let submission: Record<string, unknown> | undefined;
    await page.route("**/api/contact", route => {
      submission = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { accepted: true } });
    });
    await page.getByLabel("Email address *").fill("qa@example.test");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your message has been received");
    expect(submission?.attribution).toEqual({ landingPage: "/for-web3-agencies", referrer: "direct", utmSource: "outreach", utmMedium: "email", utmCampaign: "agency_pilot", enquiryType: "branded-demo" });
  });
}

test("all buyer pages and guides render unique metadata, visible FAQ and fitting mobile content", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const titles = new Set<string>();
  for (const content of [...buyerPages, ...guidePages]) {
    const response = await page.goto(content.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(content.h1);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(new RegExp(content.path + "$"));
    const title = await page.title();
    expect(titles.has(title)).toBe(false); titles.add(title);
    const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(schema.some(text => JSON.parse(text)["@graph"]?.some((node: { "@type": string }) => node["@type"] === "FAQPage"))).toBe(true);
    await page.locator("details summary").first().click();
    await expect(page.locator("details[open] p")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("privacy signals disable observations and contact attribution", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/growth/")) requests.push(request.url()); });
  await page.goto("/business?utm_source=outreach");
  await page.getByRole("link", { name: "Request a branded demo", exact: true }).first().click();
  await expect(page.getByLabel("Email address *")).toBeEnabled();
  expect(requests).toEqual([]);
  expect(page.url()).not.toContain("utm_source");
});

test("delivery comparison stays contained and accessible on narrow screens", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/guides/build-vs-license-crypto-swaps");
    const comparison = page.getByRole("region", { name: "What each approach actually delivers", exact: true });
    await expect(comparison).toHaveAttribute("tabindex", "0");
    await expect(comparison.getByRole("columnheader")).toHaveCount(4);
    await expect(comparison.getByRole("rowheader")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: "Further technical reading" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Related reading" }).getByRole("link").first()).toHaveAttribute("href", /^\//);
  }
});

test("enquiries require admin access and remain noindex", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/admin")) calls.push(request.url()); });
  const response = await page.goto("/admin/enquiries");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByLabel("Admin access key")).toBeVisible();
  expect(calls).toEqual([]);
  await page.route("**/api/admin/contact-submissions*", route => route.fulfill({ status: 403, json: { message: "Denied" } }));
  await page.getByLabel("Admin access key").fill("wrong-key");
  await page.getByRole("button", { name: "Open enquiries" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Admin access denied");
  await expect(page.getByLabel("Admin access key")).toHaveValue("");
});
