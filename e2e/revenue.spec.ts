import { expect, test } from "@playwright/test";

test("revenue dashboard stays locked, noindex and never stores the admin key", async ({ page }) => {
  await page.route("**/api/admin/revenue**", route => route.fulfill({status:401,contentType:"application/json",body:'{"error":"Unauthorized"}'}));
  await page.goto("/admin/revenue");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content",/noindex/);
  await expect(page.getByRole("heading",{name:"Fee stages"})).toHaveCount(0);
  await page.getByLabel("Admin access key").fill("synthetic-browser-test-key");
  await page.getByRole("button",{name:"Open dashboard"}).click();
  await expect(page.locator('main [role="alert"]')).toHaveText("Admin access denied.");
  expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain("synthetic-browser-test-key");
  expect(page.url()).not.toContain("synthetic-browser-test-key");
});

for (const width of [1280,390]) {
  test("revenue stages and evidence are separate at "+width+"px", async ({ page }) => {
    await page.setViewportSize({width,height:900});
    let delayReport = false;
    let pendingReport = false;
    await page.route("**/api/admin/revenue**", async route => {
      expect(route.request().headers()["x-admin-key"]).toBe("synthetic-browser-test-key");
      const url = route.request().url();
      if (delayReport && !url.includes("/records")) {
        pendingReport = true;
        await new Promise(resolve => setTimeout(resolve,500));
      }
      const body = url.includes("/evidence") ? [{source:"synthetic_test",state:"RECEIVED",evidence:'{"fixture":true}'}]
        : url.includes("/records") ? [{id:"record-1",state:"RECEIVED",reason:"finalized_exact_treasury_transfer",provider:"0x",
          source_chain:1,transaction_hash:"0x"+"a".repeat(64),attempts:1,created_at:"2026-09-19T00:00:00Z"}]
        : {feeGroups:[{period:"2026-09-19T00:00:00Z",provider:"0x",chain:1,token:"0x"+"2".repeat(40),symbol:"USDC",decimals:6,
          expected:"2000",accrued:null,received:"2000",submitted:1,not_verified:0,failed:0}],
          volumeGroups:[{provider:"0x",chain:1,token:"0x"+"2".repeat(40),symbol:"USDC",decimals:6,
            amount:"1000000",confirmed_swaps:1,measured_swaps:1}],
          funnel:{quote_requests:2,quoted_routes:3,reviewed_routes:1,submitted_routes:1,independently_confirmed_routes:1},
          providerOutcomes:[{provider:"lifi",outcome:"fee_validation_failed",count:1}],untrackedSubmissions:0,groupLimit:1000};
      await route.fulfill({contentType:"application/json",body:JSON.stringify(body)});
    });
    await page.goto("/admin/revenue");
    await page.getByLabel("Admin access key").fill("synthetic-browser-test-key");
    await page.getByRole("button",{name:"Open dashboard"}).click();
    await expect(page.getByRole("heading",{name:"Fee stages"})).toBeVisible();
    await expect(page.getByRole("columnheader",{name:"Expected",exact:true})).toBeVisible();
    await expect(page.getByRole("columnheader",{name:"Accrued, not received"})).toBeVisible();
    await expect(page.getByRole("columnheader",{name:"Received",exact:true})).toBeAttached();
    await expect(page.getByText("fee validation failed",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Inspect",exact:true}).click();
    await expect(page.locator("pre")).toContainText("synthetic_test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:"test-results/revenue-"+width+".png",fullPage:true});
    delayReport = true;
    await page.getByRole("button",{name:"Refresh report"}).click();
    await expect.poll(() => pendingReport).toBe(true);
    await page.getByRole("button",{name:"Lock dashboard"}).click();
    // Let the deliberately delayed response arrive after the administrator locks.
    await page.waitForTimeout(700);
    await expect(page.getByRole("heading",{name:"Fee stages"})).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain("synthetic-browser-test-key");
  });
}
