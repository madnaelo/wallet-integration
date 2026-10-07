import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Never allow acceptance visits to send analytics or real contact messages.
  await page.route("**/api/growth/events", route => route.fulfill({ status: 204 }));
  await page.route("**/api/contact", route => route.fulfill({ status: 200, json: { accepted: true } }));
});

for (const width of [320, 390, 1440]) {
  test(`wallet guide to scoped pilot enquiry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/for-wallets");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Swap software for wallet products");
    await page.getByRole("link", { name: "Walk through a linked web-wallet integration" }).click();
    await expect(page).toHaveURL(/\/guides\/add-swaps-to-a-wallet.*#worked-example$/);
    const example = page.getByRole("region", { name: "Worked example: a linked web-wallet experience" });
    await expect(example).toContainText("Illustrative scope");
    await expect(example).toContainText("does not expose a customer returnUrl callback");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await example.screenshot({ path: `test-results/wallet-example-${width}.png` });
    await example.getByRole("link", { name: "Use the acceptance checklist for this example" }).click();
    const checklist = page.getByRole("region", { name: "An acceptance checklist your product team can run" });
    await expect(checklist).toContainText("Mark unexecuted cases as unverified");
    await expect(checklist.getByRole("listitem")).toHaveCount(7);
    await page.getByRole("link", { name: "See the sample pilot deliverables and handover package" }).click();
    await expect(page).toHaveURL(/\/for-wallets.*#sample-pilot$/);
    await expect(page.getByRole("region", { name: "What a scoped pilot could hand over" })).toContainText("configuration inventory without secrets");
    await page.getByRole("region", { name: "What a scoped pilot could hand over" }).screenshot({ path: `test-results/wallet-pilot-${width}.png` });
    await page.getByRole("link", { name: "Discuss a paid pilot", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Discuss a paid pilot");
    await expect(page.locator(".contactHeader")).toContainText("a call is optional");
    await expect(page.getByLabel("Topic *")).toHaveValue("partnership");
    await expect(page.getByLabel("Message *")).toHaveValue(/paid pilot/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/contact$/);
    await expect(page.getByText("The prompts in the message are optional", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/wallet-contact-${width}.png`, fullPage: true });

    let submission: Record<string, unknown> | undefined;
    await page.route("**/api/contact", route => {
      submission = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { accepted: true } });
    });
    // No name, budget, company field or call booking is required to send an outline.
    await page.getByLabel("Email address *").fill("qa@example.test");
    await page.getByLabel("Message *").fill("Illustrative QA enquiry only: evaluating a web wallet integration.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your message has been received");
    expect(submission?.topic).toBe("partnership");
    expect(submission?.name).toBe("");
    expect(submission?.attribution).toMatchObject({ enquiryType: "paid-pilot", landingPage: "/for-wallets" });
  });
}

test("branded demo contact retains validation, retry guidance and general contact", async ({ page }) => {
  await page.goto("/contact?enquiry=branded-demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Request a branded demo");
  await expect(page.locator(".contactHeader")).toContainText("fit and scope by email");
  let requests = 0;
  await page.route("**/api/contact", route => {
    requests++;
    return route.fulfill({ status: 429, json: { message: "Limited" } });
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByLabel("Email address *").fill("qa@example.test");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect(requests).toBe(0); // Consent is still required.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please wait before trying again");
  await expect(page.getByLabel("Message *")).toHaveValue(/branded demo/);
  await page.getByRole("link", { name: "Use general contact" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How can we help?");
  await expect(page.getByLabel("Topic *")).toHaveValue("general");
  await expect(page.getByLabel("Message *")).toBeEmpty();
  for (const value of ["technical", "privacy", "legal"]) {
    await page.getByLabel("Topic *").selectOption(value);
    await expect(page.getByLabel("Topic *")).toHaveValue(value);
  }
});

test("ambiguous enquiry values use generic contact and never reflect query text", async ({ page }) => {
  for (const query of ["enquiry=branded-demo&enquiry=paid-pilot", "enquiry=%3Cscript%3Eunsafe%3C%2Fscript%3E"]) {
    await page.goto(`/contact?${query}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How can we help?");
    await expect(page.getByLabel("Message *")).toBeEmpty();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/contact$/);
  }
});
