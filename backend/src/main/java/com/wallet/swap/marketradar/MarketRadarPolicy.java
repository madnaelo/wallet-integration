package com.wallet.swap.marketradar;

import com.wallet.swap.common.ApiException;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class MarketRadarPolicy {
  // No reviewed exchange currently grants commercial display rights. An environment flag is not a
  // license.
  private static final Set<String> COMMERCIAL_VENUES = Set.of();
  private final boolean requested;

  public MarketRadarPolicy(@Value("${wallet.market-radar.live-enabled:false}") boolean requested) {
    this.requested = requested;
  }

  public boolean enabled() {
    return requested && !COMMERCIAL_VENUES.isEmpty();
  }

  public boolean permits(String venue) {
    return enabled() && COMMERCIAL_VENUES.contains(venue);
  }

  public void requireEnabled() {
    if (!enabled())
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "Live Market Radar alerts are not available yet.");
  }
}
