package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.auth")
public class AuthProperties {
  private long nonceTtlMinutes = 10;
  private long sessionTtlHours = 168;

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
}
