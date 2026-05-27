package com.wallet.swap.config;

import java.time.Duration;

public record ApiRateLimitDecision(boolean allowed, Duration retryAfter) {
  public static ApiRateLimitDecision permit() {
    return new ApiRateLimitDecision(true, Duration.ZERO);
  }

  public static ApiRateLimitDecision reject(Duration retryAfter) {
    return new ApiRateLimitDecision(false, retryAfter);
  }
}
