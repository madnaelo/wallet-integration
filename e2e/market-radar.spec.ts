import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`isolated Radar demo and public rollout boundary at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [],
      network: string[] = [];
    await page.addInitScript(() => {
      for (const key of ["ethereum", "solana", "bitcoin"])
        Object.defineProperty(window, key, {
          get() {
            throw new Error("Wallet access in Radar demo");
          },
        });
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (
        ["fetch", "xhr", "websocket"].includes(request.resourceType()) ||
        /\/(api|backend)\//.test(request.url())
      )
        network.push(request.url());
    });
    const response = await page.goto("/demo#market-radar");
    expect(response?.headers()["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(
      page.getByRole("tab", { name: "Market Radar", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Next Supply Zone" }),
    ).toBeVisible();
    await page.getByText("Why this zone?", { exact: true }).first().click();
    await expect(
      page.getByText("Contributing venues:", { exact: false }).first(),
    ).toBeVisible();
    await page.getByText("Why this zone?", { exact: true }).first().click();
    await page.getByLabel("Illustrative scenario").selectOption("2");
    await expect(
      page.getByText("Previous supply zone weakening:", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Liquidity being consumed", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save sample alert", exact: true })
      .click();
    await expect(
      page.getByText("Nothing is scheduled, sent or stored.", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`radar-demo-${viewport.width}.png`),
      fullPage: true,
    });
    expect(network).toEqual([]);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.getByLabel("Illustrative scenario")).toHaveValue("0");
    await page.goto("/market-radar");
    await expect(
      page.getByRole("heading", { name: "Market Radar", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Live market coverage is not enabled yet.", {
        exact: true,
      }),
    ).toBeVisible();
    const footerLink = page.locator("footer a").first();
    await expect(footerLink).toHaveCSS("color", "rgb(114, 215, 189)");
    await page.keyboard.press("Tab");
    await footerLink.focus();
    await expect(footerLink).toHaveCSS("outline-style", "solid");
    await expect(footerLink).toHaveCSS("outline-width", "2px");
    await footerLink.blur();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`radar-page-${viewport.width}.png`),
      fullPage: true,
    });
  });
}
