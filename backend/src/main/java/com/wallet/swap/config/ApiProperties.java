package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.api")
public class ApiProperties {
  private String corsAllowedOrigins = "http://localhost:3000";
  private long maxRequestBodyBytes = 1_048_576;
  private boolean rateLimitEnabled = true;
  private long rateLimitWindowMs = 60_000;
  private int rateLimitMaxRequests = 120;
  private int authRateLimitMaxRequests = 20;
  private boolean trustForwardedHeaders = true;
  private boolean trustPrivateProxyHeaders = true;
  private String trustedProxyCidrs = "";

  public String getCorsAllowedOrigins() {
    return corsAllowedOrigins;
  }

  public void setCorsAllowedOrigins(String corsAllowedOrigins) {
    this.corsAllowedOrigins = corsAllowedOrigins;
  }

  public long getMaxRequestBodyBytes() {
    return maxRequestBodyBytes;
  }

  public void setMaxRequestBodyBytes(long maxRequestBodyBytes) {
    this.maxRequestBodyBytes = maxRequestBodyBytes;
  }

  public boolean isRateLimitEnabled() {
    return rateLimitEnabled;
  }

  public void setRateLimitEnabled(boolean rateLimitEnabled) {
    this.rateLimitEnabled = rateLimitEnabled;
  }

  public long getRateLimitWindowMs() {
    return rateLimitWindowMs;
  }

  public void setRateLimitWindowMs(long rateLimitWindowMs) {
    this.rateLimitWindowMs = rateLimitWindowMs;
  }

  public int getRateLimitMaxRequests() {
    return rateLimitMaxRequests;
  }

  public void setRateLimitMaxRequests(int rateLimitMaxRequests) {
    this.rateLimitMaxRequests = rateLimitMaxRequests;
  }

  public int getAuthRateLimitMaxRequests() {
    return authRateLimitMaxRequests;
  }

  public void setAuthRateLimitMaxRequests(int authRateLimitMaxRequests) {
    this.authRateLimitMaxRequests = authRateLimitMaxRequests;
  }

  public boolean isTrustForwardedHeaders() {
    return trustForwardedHeaders;
  }

  public void setTrustForwardedHeaders(boolean trustForwardedHeaders) {
    this.trustForwardedHeaders = trustForwardedHeaders;
  }

  public boolean isTrustPrivateProxyHeaders() {
    return trustPrivateProxyHeaders;
  }

  public void setTrustPrivateProxyHeaders(boolean trustPrivateProxyHeaders) {
    this.trustPrivateProxyHeaders = trustPrivateProxyHeaders;
  }

  public String getTrustedProxyCidrs() {
    return trustedProxyCidrs;
  }

  public void setTrustedProxyCidrs(String trustedProxyCidrs) {
    this.trustedProxyCidrs = trustedProxyCidrs;
  }
}
