import { expect, test } from "@playwright/test";

test("public metadata and discovery use one canonical origin", async ({ page, request }) => {
  await page.goto("/");
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toBeTruthy();
  const origin = new URL(canonical!).origin;
  if (process.env.PLAYWRIGHT_EXPECTED_SITE_URL) {
    expect(origin).toBe(process.env.PLAYWRIGHT_EXPECTED_SITE_URL);
  }
  const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
  expect(new URL(structured.url).origin).toBe(origin);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", origin + "/");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));

  for (const path of ["/business", "/market-radar"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + path);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", origin + path);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).not.toContain("noindex");
  }

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
  expect(urls.length).toBeGreaterThan(2);
  expect(urls.every((url) => url.origin === origin)).toBe(true);
  expect(urls.some((url) => /^\/(admin|api|backend|demo)(\/|$)/.test(url.pathname))).toBe(false);
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  for (const path of ["/admin/", "/api/", "/backend/"]) expect(await robots.text()).toContain(`Disallow: ${path}`);
});

test("demo and private workspace stay noindex on the production domain", async ({ page }) => {
  for (const path of ["/demo", "/admin/market-radar"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    if (path === "/demo") expect(response?.headers()["content-security-policy"]).toContain("connect-src 'none'");
  }
  await expect(page.getByLabel("Admin access key")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next Supply Zone" })).toHaveCount(0);
});
