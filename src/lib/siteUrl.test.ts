import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "./siteUrl";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

afterEach(() => vi.unstubAllEnvs());

describe("canonical production domain", () => {
  it("defaults to the owned domain without relying on the request host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getSiteUrl().origin).toBe("https://getswapradar.xyz");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-url");
    expect(getSiteUrl().origin).toBe("https://getswapradar.xyz");
  });

  it("preserves configured local and separately branded deployment URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(getSiteUrl().origin).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://customer.example");
    expect(getSiteUrl().origin).toBe("https://customer.example");
  });

  it("uses the canonical origin for discovery without listing private or demo routes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getswapradar.xyz");
    const urls = sitemap().map((entry) => new URL(entry.url));
    expect(urls.every((url) => url.origin === "https://getswapradar.xyz")).toBe(true);
    expect(urls.map((url) => url.pathname)).toEqual(expect.arrayContaining(["/", "/business", "/guides", "/market-radar"]));
    expect(urls.some((url) => /^\/(admin|api|backend|demo)(\/|$)/.test(url.pathname))).toBe(false);
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/backend/", "/admin/", "/offline"] },
      sitemap: "https://getswapradar.xyz/sitemap.xml",
    });
  });

  it("does not claim that every page changed when an unrelated commit is deployed", () => {
    vi.stubEnv("NEXT_PUBLIC_COMMIT_TIMESTAMP", "2026-10-01T12:00:00Z");
    const before = sitemap();
    vi.stubEnv("NEXT_PUBLIC_COMMIT_TIMESTAMP", "2026-10-04T12:00:00Z");
    expect(sitemap()).toEqual(before);
    expect(before.every(entry => entry.lastModified === undefined)).toBe(true);
  });
});
