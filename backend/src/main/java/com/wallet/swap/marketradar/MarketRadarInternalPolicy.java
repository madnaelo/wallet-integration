package com.wallet.swap.marketradar;

import com.wallet.swap.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Private research access is deliberately independent of commercial licensing. */
@Component
public final class MarketRadarInternalPolicy {
  private final boolean enabled;

  public MarketRadarInternalPolicy(
      @Value("${wallet.market-radar.internal-enabled:false}") boolean enabled) {
    this.enabled = enabled;
  }

  public boolean enabled() {
    return enabled;
  }

  public boolean permits(String venue) {
    return enabled && "binance".equals(venue);
  }

  public void requireEnabled() {
    if (!enabled)
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "Private Market Radar is not enabled.");
  }
}
