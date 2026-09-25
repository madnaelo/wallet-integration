import { describe, expect, it } from "vitest";
import { attributionFromUrl, attributedLink, campaignTag, GROWTH_PATHS } from "./growth";
import { buyerPages, guidePages } from "./growthContent";
describe("growth attribution", () => {
  it("keeps only bounded campaign names, known paths and referral groups", () => {
    const a = attributionFromUrl(new URL("https://getswapradar.xyz/business?utm_source=Partner&utm_medium=email&utm_campaign=pilot_sep&enquiry=paid-pilot"), "https://www.google.com/search?q=private-wallet-info");
    expect(a).toEqual({ landingPage: "/business", referrer: "google", utmSource: "partner", utmMedium: "email", utmCampaign: "pilot_sep", enquiryType: "paid-pilot" });
    expect(JSON.stringify(a)).not.toContain("private-wallet-info");
  });
  it("rejects email, full URLs, wallets, long identifiers and controls", () => {
    for (const value of ["me@example.com", "https://example.com", "0x" + "a".repeat(40), "a".repeat(64), "hello\nthere", "abc" + "a".repeat(24)]) expect(campaignTag(value)).toBe("");
    expect(attributionFromUrl(new URL("https://site.test/admin?landing=/swap?wallet=secret&referrer=evil.example")).landingPage).toBe("/business");
  });
  it("preserves context through internal demo links, never through external links", () => {
    const a = attributionFromUrl(new URL("https://site.test/for-wallets?utm_source=outreach&utm_campaign=wallet_pilot"));
    const demo = attributedLink("/demo#market-radar", a);
    expect(demo).toContain("landing=%2Ffor-wallets"); expect(demo).toContain("#market-radar");
    const contact = attributedLink("/contact?enquiry=branded-demo", attributionFromUrl(new URL(demo, "https://site.test")));
    expect(contact).toContain("enquiry=branded-demo"); expect(contact).toContain("utm_campaign=wallet_pilot");
    expect(attributedLink("https://other.test/", a)).toBe("https://other.test/");
    expect(attributedLink("/swap?wallet=secret", a)).toBe("/swap?wallet=secret");
  });
  it("does not attribute same-origin transitions as external referrals", () => {
    expect(attributionFromUrl(new URL("https://site.test/business"), "https://site.test/demo").referrer).toBe("direct");
  });
  it("publishes distinct pages with valid links and no made-up proof", () => {
    const pages = [...buyerPages, ...guidePages];
    for (const field of ["path", "title", "description", "h1"] as const) expect(new Set(pages.map(p => p[field])).size).toBe(pages.length);
    for (const page of pages) {
      expect(GROWTH_PATHS).toContain(page.path);
      expect(page.sections.length).toBeGreaterThanOrEqual(4);
      for (const [path] of page.related) expect(GROWTH_PATHS).toContain(path);
      expect(JSON.stringify(page)).not.toMatch(/saves \d+ months|\d+% success rate/i);
    }
  });
  it("keeps useful comparison and acceptance evidence in the existing guides", () => {
    const comparison = guidePages.find(p => p.path === "/guides/build-vs-license-crypto-swaps")!;
    expect(comparison.comparison?.headers).toHaveLength(4);
    for (const row of comparison.comparison!.rows) expect(row).toHaveLength(4);
    const walletGuide = guidePages.find(p => p.path === "/guides/add-swaps-to-a-wallet")!;
    expect(JSON.stringify(walletGuide)).toContain("Allowance completed, swap rejected");
    for (const page of [comparison, walletGuide]) {
      expect(page.reviewedOn).toBe("2026-09-25");
      for (const [url] of page.sources!) expect(new URL(url).protocol).toBe("https:");
    }
  });
});
