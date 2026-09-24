export const GROWTH_PATHS = ["/", "/business", "/white-label-crypto-swap", "/crypto-swap-integration",
  "/for-wallets", "/for-web3-agencies", "/guides/build-vs-license-crypto-swaps",
  "/guides/add-swaps-to-a-wallet", "/guides/non-custodial-swap-architecture", "/market-radar", "/demo", "/contact"] as const;
export type Attribution = { landingPage: string; referrer: string; utmSource: string; utmMedium: string;
  utmCampaign: string; enquiryType: string };
const SOURCES = ["google", "bing", "github", "linkedin", "producthunt", "other", "direct"];
export function campaignTag(value: unknown): string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,47}$/i.test(value)
    && !/0x[\da-f]{12}|[\da-f]{24}/i.test(value) ? value.toLowerCase() : "";
}
export function growthPath(value: string | null): string {
  return GROWTH_PATHS.includes(value as typeof GROWTH_PATHS[number]) ? value! : "/business";
}
export function attributionFromUrl(url: URL, referrer = ""): Attribution {
  let source = url.searchParams.get("referrer") ?? "";
  if (!SOURCES.includes(source)) {
    source = "direct";
    try {
      const ref = new URL(referrer);
      if (ref.origin !== url.origin) {
        source = SOURCES.find((name) => ref.hostname === `${name}.com` || ref.hostname.endsWith(`.${name}.com`)) ?? "other";
      }
    } catch { /* Missing or malformed referrers carry no attribution. */ }
  }
  const enquiry = url.searchParams.get("enquiry");
  return { landingPage: growthPath(url.searchParams.get("landing") ?? url.pathname), referrer: source,
    utmSource: campaignTag(url.searchParams.get("utm_source")), utmMedium: campaignTag(url.searchParams.get("utm_medium")),
    utmCampaign: campaignTag(url.searchParams.get("utm_campaign")),
    enquiryType: enquiry === "branded-demo" || enquiry === "paid-pilot" ? enquiry : "general" };
}
export function attributedLink(href: string, attribution: Attribution): string {
  const url = new URL(href, "https://example.invalid");
  if (url.origin !== "https://example.invalid" || !GROWTH_PATHS.includes(url.pathname as typeof GROWTH_PATHS[number])) return href;
  url.searchParams.set("landing", growthPath(attribution.landingPage));
  if (SOURCES.includes(attribution.referrer)) url.searchParams.set("referrer", attribution.referrer);
  for (const [key, value] of [["utm_source", attribution.utmSource], ["utm_medium", attribution.utmMedium], ["utm_campaign", attribution.utmCampaign]]) {
    const tag = campaignTag(value);
    if (tag) url.searchParams.set(key, tag);
    else url.searchParams.delete(key);
  }
  return url.pathname + url.search + url.hash;
}
