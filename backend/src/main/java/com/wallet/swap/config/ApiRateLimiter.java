package com.wallet.swap.config;

public interface ApiRateLimiter {
  ApiRateLimitDecision check(String key, int maxRequests, long windowMs);
}
