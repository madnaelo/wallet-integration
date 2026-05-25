package com.wallet.swap.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApiRequestGuardFilter extends OncePerRequestFilter {
  private static final String APPLICATION_JSON = "application/json";
  private static final int MAX_TRACKED_BUCKETS = 10_000;

  private final ApiProperties apiProperties;
  private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
  private volatile long lastSweepAt = 0;

  public ApiRequestGuardFilter(ApiProperties apiProperties) {
    this.apiProperties = apiProperties;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain)
      throws ServletException, IOException {
    applySecurityHeaders(response);

    String path = request.getRequestURI();
    if (!path.startsWith("/api/") || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
      filterChain.doFilter(request, response);
      return;
    }

    long maxBodyBytes = Math.max(1, apiProperties.getMaxRequestBodyBytes());
    long contentLength = request.getContentLengthLong();
    if (contentLength > maxBodyBytes) {
      writeError(response, HttpStatus.PAYLOAD_TOO_LARGE, "Request body is too large.");
      return;
    }

    if (!path.equals("/api/health") && apiProperties.isRateLimitEnabled()) {
      RateDecision decision = checkRateLimit(path, clientIp(request));
      if (!decision.allowed()) {
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, decision.retryAfter().toSeconds())));
        writeError(response, HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Please try again later.");
        return;
      }
    }

    HttpServletRequest guardedRequest = hasRequestBody(request)
        ? new BodySizeLimitRequestWrapper(request, maxBodyBytes)
        : request;

    try {
      filterChain.doFilter(guardedRequest, response);
    } catch (PayloadTooLargeException exception) {
      if (!response.isCommitted()) {
        writeError(response, HttpStatus.PAYLOAD_TOO_LARGE, "Request body is too large.");
      }
    }
  }

  private void applySecurityHeaders(HttpServletResponse response) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    response.setHeader("Cache-Control", "no-store");
  }

  private RateDecision checkRateLimit(String path, String ip) {
    long now = System.currentTimeMillis();
    long windowMs = Math.max(1_000, apiProperties.getRateLimitWindowMs());
    int maxRequests = maxRequestsFor(path);
    String key = rateLimitGroup(path) + ":" + ip;
    maybeSweep(now);

    AtomicReference<RateDecision> decision = new AtomicReference<>();
    buckets.compute(key, (ignored, bucket) -> {
      if (bucket == null || now >= bucket.resetAt()) {
        decision.set(new RateDecision(true, Duration.ZERO));
        return new Bucket(1, now + windowMs);
      }
      if (bucket.count() >= maxRequests) {
        decision.set(new RateDecision(false, Duration.ofMillis(Math.max(0, bucket.resetAt() - now))));
        return bucket;
      }
      decision.set(new RateDecision(true, Duration.ZERO));
      return new Bucket(bucket.count() + 1, bucket.resetAt());
    });

    return decision.get();
  }

  private int maxRequestsFor(String path) {
    if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/")) {
      return Math.max(1, apiProperties.getAuthRateLimitMaxRequests());
    }
    return Math.max(1, apiProperties.getRateLimitMaxRequests());
  }

  private String rateLimitGroup(String path) {
    if (path.startsWith("/api/auth/")) return "auth";
    if (path.startsWith("/api/admin/")) return "admin";
    return "api";
  }

  private void maybeSweep(long now) {
    long windowMs = Math.max(1_000, apiProperties.getRateLimitWindowMs());
    if (buckets.size() < MAX_TRACKED_BUCKETS && now - lastSweepAt < windowMs) return;
    lastSweepAt = now;
    buckets.entrySet().removeIf(entry -> now >= entry.getValue().resetAt());
    if (buckets.size() <= MAX_TRACKED_BUCKETS) return;

    int targetSize = MAX_TRACKED_BUCKETS * 9 / 10;
    for (String key : buckets.keySet()) {
      if (buckets.size() <= targetSize) break;
      buckets.remove(key);
    }
  }

  private String clientIp(HttpServletRequest request) {
    String forwardedFor = request.getHeader("X-Forwarded-For");
    if (forwardedFor != null && !forwardedFor.isBlank()) {
      return forwardedFor.split(",", 2)[0].trim().toLowerCase(Locale.ROOT);
    }
    String realIp = request.getHeader("X-Real-IP");
    if (realIp != null && !realIp.isBlank()) return realIp.trim().toLowerCase(Locale.ROOT);
    return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
  }

  private void writeError(HttpServletResponse response, HttpStatus status, String message) throws IOException {
    response.setStatus(status.value());
    response.setContentType(APPLICATION_JSON);
    response.getWriter().write("{\"error\":\"" + message + "\"}");
    response.getWriter().flush();
  }

  private boolean hasRequestBody(HttpServletRequest request) {
    return switch (request.getMethod().toUpperCase(Locale.ROOT)) {
      case "POST", "PUT", "PATCH", "DELETE" -> true;
      default -> false;
    };
  }

  private record Bucket(int count, long resetAt) {}

  private record RateDecision(boolean allowed, Duration retryAfter) {}

  private static final class BodySizeLimitRequestWrapper extends HttpServletRequestWrapper {
    private final long maxBodyBytes;

    private BodySizeLimitRequestWrapper(HttpServletRequest request, long maxBodyBytes) {
      super(request);
      this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
      return new LimitedServletInputStream(super.getInputStream(), maxBodyBytes);
    }

    @Override
    public BufferedReader getReader() throws IOException {
      return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
  }

  private static final class LimitedServletInputStream extends ServletInputStream {
    private final ServletInputStream delegate;
    private final long maxBodyBytes;
    private long bytesRead = 0;

    private LimitedServletInputStream(ServletInputStream delegate, long maxBodyBytes) {
      this.delegate = delegate;
      this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    public int read() throws IOException {
      int value = delegate.read();
      if (value != -1) countBytes(1);
      return value;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
      int count = delegate.read(b, off, len);
      if (count > 0) countBytes(count);
      return count;
    }

    @Override
    public boolean isFinished() {
      return delegate.isFinished();
    }

    @Override
    public boolean isReady() {
      return delegate.isReady();
    }

    @Override
    public void setReadListener(ReadListener readListener) {
      delegate.setReadListener(readListener);
    }

    private void countBytes(int count) throws PayloadTooLargeException {
      bytesRead += count;
      if (bytesRead > maxBodyBytes) {
        throw new PayloadTooLargeException();
      }
    }
  }

  private static final class PayloadTooLargeException extends IOException {}
}
