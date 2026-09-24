package com.wallet.swap.growth;

import jakarta.validation.constraints.Size;
import java.util.Set;

public record GrowthAttribution(@Size(max=100) String landingPage, @Size(max=32) String referrer,
    @Size(max=48) String utmSource, @Size(max=48) String utmMedium, @Size(max=48) String utmCampaign,
    @Size(max=32) String enquiryType) {
  public static final Set<String> PAGES = Set.of("/", "/business", "/white-label-crypto-swap", "/crypto-swap-integration",
      "/for-wallets", "/for-web3-agencies", "/guides/build-vs-license-crypto-swaps", "/guides/add-swaps-to-a-wallet",
      "/guides/non-custodial-swap-architecture", "/market-radar", "/demo", "/contact");
  private static final Set<String> SOURCES = Set.of("google", "bing", "github", "linkedin", "producthunt", "other", "direct");

  public static GrowthAttribution sanitize(GrowthAttribution value) {
    if (value == null) return new GrowthAttribution("", "", "", "", "", "general");
    return new GrowthAttribution(PAGES.contains(text(value.landingPage)) ? value.landingPage : "",
        SOURCES.contains(text(value.referrer)) ? value.referrer : "", tag(value.utmSource), tag(value.utmMedium),
        tag(value.utmCampaign), Set.of("branded-demo", "paid-pilot").contains(text(value.enquiryType)) ? value.enquiryType : "general");
  }
  private static String tag(String value) {
    String text = text(value);
    return text.matches("[a-zA-Z][a-zA-Z0-9_-]{0,47}") && !text.matches("(?i).*?(0x[0-9a-f]{12}|[0-9a-f]{24}).*")
        ? text.toLowerCase(java.util.Locale.ROOT) : "";
  }
  private static String text(String value) { return value == null ? "" : value; }
}
