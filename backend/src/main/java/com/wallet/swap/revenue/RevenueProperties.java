package com.wallet.swap.revenue;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.revenue")
public record RevenueProperties(boolean enabled, String ingestSecret, Map<Long, String> rpcUrls) {
  public RevenueProperties {
    ingestSecret = ingestSecret == null ? "" : ingestSecret;
    rpcUrls = rpcUrls == null ? Map.of() : Map.copyOf(rpcUrls);
    if (enabled && (ingestSecret.isBlank() || ingestSecret.length() < 32)) {
      throw new IllegalArgumentException("Revenue ingestion requires a dedicated secret of at least 32 characters.");
    }
  }
}
