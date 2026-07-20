package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.lifi")
public class LifiProperties {
  private boolean trackingEnabled = true;
  private String baseUrl = "https://li.quest";
  private String apiKey = "";
  private int requestTimeoutSeconds = 10;
  private long statusCheckFixedDelayMs = 10_000;
  private int statusCheckBatchSize = 10;
  private int statusCheckLockTtlSeconds = 45;
  private int statusCheckMaxBackoffSeconds = 1_800;
  private int maximumTrackingHours = 168;

  public boolean isTrackingEnabled() {
    return trackingEnabled;
  }

  public void setTrackingEnabled(boolean trackingEnabled) {
    this.trackingEnabled = trackingEnabled;
  }

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = baseUrl;
  }

  public String getApiKey() {
    return apiKey;
  }

  public void setApiKey(String apiKey) {
    this.apiKey = apiKey;
  }

  public int getRequestTimeoutSeconds() {
    return requestTimeoutSeconds;
  }

  public void setRequestTimeoutSeconds(int requestTimeoutSeconds) {
    this.requestTimeoutSeconds = requestTimeoutSeconds;
  }

  public long getStatusCheckFixedDelayMs() {
    return statusCheckFixedDelayMs;
  }

  public void setStatusCheckFixedDelayMs(long statusCheckFixedDelayMs) {
    this.statusCheckFixedDelayMs = statusCheckFixedDelayMs;
  }

  public int getStatusCheckBatchSize() {
    return statusCheckBatchSize;
  }

  public void setStatusCheckBatchSize(int statusCheckBatchSize) {
    this.statusCheckBatchSize = statusCheckBatchSize;
  }

  public int getStatusCheckLockTtlSeconds() {
    return statusCheckLockTtlSeconds;
  }

  public void setStatusCheckLockTtlSeconds(int statusCheckLockTtlSeconds) {
    this.statusCheckLockTtlSeconds = statusCheckLockTtlSeconds;
  }

  public int getStatusCheckMaxBackoffSeconds() {
    return statusCheckMaxBackoffSeconds;
  }

  public void setStatusCheckMaxBackoffSeconds(int statusCheckMaxBackoffSeconds) {
    this.statusCheckMaxBackoffSeconds = statusCheckMaxBackoffSeconds;
  }

  public int getMaximumTrackingHours() {
    return maximumTrackingHours;
  }

  public void setMaximumTrackingHours(int maximumTrackingHours) {
    this.maximumTrackingHours = maximumTrackingHours;
  }
}
