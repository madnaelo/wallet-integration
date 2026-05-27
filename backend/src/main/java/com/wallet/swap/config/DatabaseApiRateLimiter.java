package com.wallet.swap.config;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DatabaseApiRateLimiter implements ApiRateLimiter {
  private final JdbcTemplate jdbcTemplate;

  public DatabaseApiRateLimiter(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public ApiRateLimitDecision check(String key, int maxRequests, long windowMs) {
    int limit = Math.max(1, maxRequests);
    long safeWindowMs = Math.max(1_000, windowMs);
    List<BucketState> states = jdbcTemplate.query(
        """
        INSERT INTO api_rate_limit_buckets (bucket_key, request_count, reset_at, updated_at)
        VALUES (?, 1, now() + (? * interval '1 millisecond'), now())
        ON CONFLICT (bucket_key)
        DO UPDATE SET
          request_count = CASE
            WHEN api_rate_limit_buckets.reset_at <= now() THEN 1
            ELSE api_rate_limit_buckets.request_count + 1
          END,
          reset_at = CASE
            WHEN api_rate_limit_buckets.reset_at <= now()
            THEN now() + (? * interval '1 millisecond')
            ELSE api_rate_limit_buckets.reset_at
          END,
          updated_at = now()
        RETURNING request_count, reset_at
        """,
        (rs, rowNum) -> new BucketState(
            rs.getInt("request_count"),
            rs.getTimestamp("reset_at").toInstant()),
        key,
        safeWindowMs,
        safeWindowMs);

    BucketState state = states.isEmpty()
        ? new BucketState(limit + 1, Instant.now().plusMillis(safeWindowMs))
        : states.get(0);
    if (state.requestCount() <= limit) return ApiRateLimitDecision.permit();
    Duration retryAfter = Duration.between(Instant.now(), state.resetAt());
    if (retryAfter.isNegative()) retryAfter = Duration.ZERO;
    return ApiRateLimitDecision.reject(retryAfter);
  }

  public int deleteExpiredBuckets(Instant now) {
    return jdbcTemplate.update(
        """
        DELETE FROM api_rate_limit_buckets
        WHERE reset_at <= ?
        """,
        now);
  }

  private record BucketState(int requestCount, Instant resetAt) {}
}
