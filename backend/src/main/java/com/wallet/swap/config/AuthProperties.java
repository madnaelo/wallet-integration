package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.auth")
public class AuthProperties {
  private long nonceTtlMinutes = 10;
  private long sessionTtlHours = 168;
  private String signingDomain = "localhost:3000";
  private String signingUri = "http://localhost:3000";
  private String sessionCookieSameSite = "Lax";
  private boolean sessionCookieSecure = false;
  private boolean exposeAccessToken = false;

  public long getNonceTtlMinutes() {
    return nonceTtlMinutes;
  }

  public void setNonceTtlMinutes(long nonceTtlMinutes) {
    this.nonceTtlMinutes = nonceTtlMinutes;
  }

  public long getSessionTtlHours() {
    return sessionTtlHours;
  }

  public void setSessionTtlHours(long sessionTtlHours) {
    this.sessionTtlHours = sessionTtlHours;
  }

  public String getSigningDomain() {
    return signingDomain;
  }

  public void setSigningDomain(String signingDomain) {
    this.signingDomain = signingDomain;
  }

  public String getSigningUri() {
    return signingUri;
  }

  public void setSigningUri(String signingUri) {
    this.signingUri = signingUri;
  }

  public String getSessionCookieSameSite() {
    return sessionCookieSameSite;
  }

  public void setSessionCookieSameSite(String sessionCookieSameSite) {
    this.sessionCookieSameSite = sessionCookieSameSite;
  }

  public boolean isSessionCookieSecure() {
    return sessionCookieSecure;
  }

  public void setSessionCookieSecure(boolean sessionCookieSecure) {
    this.sessionCookieSecure = sessionCookieSecure;
  }

  public boolean isExposeAccessToken() {
    return exposeAccessToken;
  }

  public void setExposeAccessToken(boolean exposeAccessToken) {
    this.exposeAccessToken = exposeAccessToken;
  }
}
