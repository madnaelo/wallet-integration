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
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ApiRequestGuardFilter extends OncePerRequestFilter {
  private static final String APPLICATION_JSON = "application/json";

  private final ApiProperties apiProperties;
  private final ApiRateLimiter rateLimiter;
  private final Set<String> allowedOrigins;
  private final boolean allowAnyOrigin;

  public ApiRequestGuardFilter(ApiProperties apiProperties, ApiRateLimiter rateLimiter) {
    this.apiProperties = apiProperties;
    this.rateLimiter = rateLimiter;
    Set<String> configuredOrigins = java.util.Arrays.stream(apiProperties.getCorsAllowedOrigins().split(","))
        .map(String::trim)
        .filter(origin -> !origin.isBlank())
        .collect(Collectors.toUnmodifiableSet());
    this.allowAnyOrigin = configuredOrigins.contains("*");
    this.allowedOrigins = configuredOrigins.stream()
        .filter(origin -> !"*".equals(origin))
        .map(this::canonicalOrigin)
        .filter(origin -> origin != null)
        .collect(Collectors.toUnmodifiableSet());
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

    if (!isAllowedBrowserRequest(request)) {
      writeError(response, HttpStatus.FORBIDDEN, "Request origin is not allowed.");
      return;
    }

    long maxBodyBytes = Math.max(1, apiProperties.getMaxRequestBodyBytes());
    long contentLength = request.getContentLengthLong();
    if (contentLength > maxBodyBytes) {
      writeError(response, HttpStatus.PAYLOAD_TOO_LARGE, "Request body is too large.");
      return;
    }

    if (!path.equals("/api/health") && apiProperties.isRateLimitEnabled()) {
      ApiRateLimitDecision decision = checkRateLimit(path, clientIp(request));
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
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  private boolean isAllowedBrowserRequest(HttpServletRequest request) {
    String rawOrigin = request.getHeader(HttpHeaders.ORIGIN);
    String origin = canonicalOrigin(rawOrigin);
    if (rawOrigin != null && (origin == null || (!allowAnyOrigin && !allowedOrigins.contains(origin)))) {
      return false;
    }
    return !isStateChanging(request) || !hasSessionCookie(request) || origin != null;
  }

  private boolean isStateChanging(HttpServletRequest request) {
    return switch (request.getMethod().toUpperCase(Locale.ROOT)) {
      case "POST", "PUT", "PATCH", "DELETE" -> true;
      default -> false;
    };
  }

  private boolean hasSessionCookie(HttpServletRequest request) {
    if (request.getCookies() == null) return false;
    for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
      if ("wallet_session".equals(cookie.getName()) && !cookie.getValue().isBlank()) return true;
    }
    return false;
  }

  private String canonicalOrigin(String value) {
    if (value == null || value.isBlank() || "null".equalsIgnoreCase(value.trim())) return null;
    try {
      URI uri = new URI(value.trim());
      String scheme = uri.getScheme();
      String host = uri.getHost();
      if (scheme == null || host == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
        return null;
      }
      if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) return null;
      if (uri.getPath() != null && !uri.getPath().isBlank() && !"/".equals(uri.getPath())) return null;
      return new URI(
          scheme.toLowerCase(Locale.ROOT),
          null,
          host.toLowerCase(Locale.ROOT),
          uri.getPort(),
          null,
          null,
          null).toString();
    } catch (URISyntaxException exception) {
      return null;
    }
  }

  private ApiRateLimitDecision checkRateLimit(String path, String ip) {
    long windowMs = Math.max(1_000, apiProperties.getRateLimitWindowMs());
    int maxRequests = maxRequestsFor(path);
    return rateLimiter.check(rateLimitKey(rateLimitGroup(path), ip), maxRequests, windowMs);
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

  private String clientIp(HttpServletRequest request) {
    String remoteAddress = normalizeIp(request.getRemoteAddr());
    if (apiProperties.isTrustForwardedHeaders() && isTrustedProxy(remoteAddress)) {
      String forwardedIp = firstValidForwardedIp(request.getHeader("X-Forwarded-For"));
      if (forwardedIp != null) return forwardedIp;

      String realIp = normalizeIp(request.getHeader("X-Real-IP"));
      if (realIp != null) return realIp;
    }
    return remoteAddress == null ? "unknown" : remoteAddress;
  }

  private String firstValidForwardedIp(String forwardedFor) {
    if (forwardedFor == null || forwardedFor.isBlank()) return null;
    for (String part : forwardedFor.split(",")) {
      String ip = normalizeIp(part);
      if (ip != null) return ip;
    }
    return null;
  }

  private String normalizeIp(String value) {
    if (value == null || value.isBlank()) return null;
    String ip = value.trim();
    if (ip.startsWith("[") && ip.contains("]")) {
      ip = ip.substring(1, ip.indexOf(']'));
    }
    int zoneIndex = ip.indexOf('%');
    if (zoneIndex >= 0) ip = ip.substring(0, zoneIndex);
    InetAddress address = parseIpLiteral(ip);
    return address == null ? null : address.getHostAddress().toLowerCase(Locale.ROOT);
  }

  private boolean isTrustedProxy(String remoteAddress) {
    InetAddress address = parseIpLiteral(remoteAddress);
    if (address == null) return false;
    if (matchesTrustedProxyCidr(address)) return true;
    if (!apiProperties.isTrustPrivateProxyHeaders()) return false;
    return address.isLoopbackAddress()
        || address.isSiteLocalAddress()
        || address.isLinkLocalAddress()
        || isUniqueLocalIpv6(address);
  }

  private boolean matchesTrustedProxyCidr(InetAddress address) {
    String cidrs = apiProperties.getTrustedProxyCidrs();
    if (cidrs == null || cidrs.isBlank()) return false;
    for (String rawCidr : cidrs.split(",")) {
      if (isInCidr(address, rawCidr.trim())) return true;
    }
    return false;
  }

  private boolean isInCidr(InetAddress address, String cidr) {
    if (cidr.isBlank()) return false;
    String[] parts = cidr.split("/", 2);
    InetAddress network = parseIpLiteral(parts[0].trim());
    if (network == null) return false;

    byte[] addressBytes = address.getAddress();
    byte[] networkBytes = network.getAddress();
    if (addressBytes.length != networkBytes.length) return false;

    int maxPrefix = addressBytes.length * 8;
    int prefixLength = maxPrefix;
    if (parts.length == 2) {
      try {
        prefixLength = Integer.parseInt(parts[1].trim());
      } catch (NumberFormatException exception) {
        return false;
      }
    }
    if (prefixLength < 0 || prefixLength > maxPrefix) return false;

    int fullBytes = prefixLength / 8;
    int remainingBits = prefixLength % 8;
    for (int i = 0; i < fullBytes; i++) {
      if (addressBytes[i] != networkBytes[i]) return false;
    }
    if (remainingBits == 0) return true;

    int mask = (0xff << (8 - remainingBits)) & 0xff;
    return ((addressBytes[fullBytes] & 0xff) & mask) == ((networkBytes[fullBytes] & 0xff) & mask);
  }

  private InetAddress parseIpLiteral(String ip) {
    if (ip == null || ip.isBlank()) return null;
    try {
      if (isIpv4Literal(ip) || isIpv6Literal(ip)) return InetAddress.getByName(ip);
    } catch (UnknownHostException exception) {
      return null;
    }
    return null;
  }

  private boolean isIpv4Literal(String ip) {
    String[] parts = ip.split("\\.", -1);
    if (parts.length != 4) return false;
    for (String part : parts) {
      if (part.isBlank() || part.length() > 3 || !part.chars().allMatch(Character::isDigit)) return false;
      int value = Integer.parseInt(part);
      if (value < 0 || value > 255) return false;
    }
    return true;
  }

  private boolean isIpv6Literal(String ip) {
    return ip.contains(":") && ip.matches("[0-9a-fA-F:.]+");
  }

  private boolean isUniqueLocalIpv6(InetAddress address) {
    byte[] bytes = address.getAddress();
    return bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
  }

  private String rateLimitKey(String group, String clientIp) {
    try {
      String pepper = apiProperties.getRateLimitKeyPepper() == null ? "" : apiProperties.getRateLimitKeyPepper();
      byte[] secret = (pepper.isBlank() ? "development-only-rate-limit-key" : pepper)
          .getBytes(StandardCharsets.UTF_8);
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      byte[] hash = mac.doFinal((group + ":" + clientIp).getBytes(StandardCharsets.UTF_8));
      return group + ":" + HexFormat.of().formatHex(hash);
    } catch (GeneralSecurityException exception) {
      throw new IllegalStateException("HMAC-SHA256 is not available.", exception);
    }
  }

  private void writeError(HttpServletResponse response, HttpStatus status, String message) throws IOException {
    response.setStatus(status.value());
    response.setContentType(APPLICATION_JSON);
    response.getWriter().write("{\"error\":\"" + message + "\"}");
    response.getWriter().flush();
  }

  private boolean hasRequestBody(HttpServletRequest request) {
    return isStateChanging(request);
  }

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
