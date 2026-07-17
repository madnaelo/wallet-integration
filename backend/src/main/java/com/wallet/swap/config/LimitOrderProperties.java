package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.limit-orders")
public class LimitOrderProperties {
  private boolean orderbookSubmissionEnabled = true;
  private String oneinchApiKey = "";
  private String oneinchOrderbookBaseUrl = "https://api.1inch.dev/orderbook/v4.1";
  private String cowApiKey = "";
  private String cowOrderbookBaseUrl = "https://api.cow.fi";
  private String cowPartnerOrderbookBaseUrl = "https://partners.cow.fi";
  private int requestTimeoutSeconds = 8;
  private long submissionRetryFixedDelayMs = 30_000;
  private int submissionBatchSize = 25;
  private int submissionMaxAttempts = 8;
  private int submissionLockTtlSeconds = 60;

  public boolean isOrderbookSubmissionEnabled() {
    return orderbookSubmissionEnabled;
  }

  public void setOrderbookSubmissionEnabled(boolean orderbookSubmissionEnabled) {
    this.orderbookSubmissionEnabled = orderbookSubmissionEnabled;
  }

  public String getOneinchApiKey() {
    return oneinchApiKey;
  }

  public void setOneinchApiKey(String oneinchApiKey) {
    this.oneinchApiKey = oneinchApiKey;
  }

  public String getOneinchOrderbookBaseUrl() {
    return oneinchOrderbookBaseUrl;
  }

  public void setOneinchOrderbookBaseUrl(String oneinchOrderbookBaseUrl) {
    this.oneinchOrderbookBaseUrl = oneinchOrderbookBaseUrl;
  }

  public String getCowApiKey() {
    return cowApiKey;
  }

  public void setCowApiKey(String cowApiKey) {
    this.cowApiKey = cowApiKey;
  }

  public String getCowOrderbookBaseUrl() {
    return cowOrderbookBaseUrl;
  }

  public void setCowOrderbookBaseUrl(String cowOrderbookBaseUrl) {
    this.cowOrderbookBaseUrl = cowOrderbookBaseUrl;
  }

  public String getCowPartnerOrderbookBaseUrl() {
    return cowPartnerOrderbookBaseUrl;
  }

  public void setCowPartnerOrderbookBaseUrl(String cowPartnerOrderbookBaseUrl) {
    this.cowPartnerOrderbookBaseUrl = cowPartnerOrderbookBaseUrl;
  }

  public int getRequestTimeoutSeconds() {
    return requestTimeoutSeconds;
  }

  public void setRequestTimeoutSeconds(int requestTimeoutSeconds) {
    this.requestTimeoutSeconds = requestTimeoutSeconds;
  }

  public long getSubmissionRetryFixedDelayMs() {
    return submissionRetryFixedDelayMs;
  }

  public void setSubmissionRetryFixedDelayMs(long submissionRetryFixedDelayMs) {
    this.submissionRetryFixedDelayMs = submissionRetryFixedDelayMs;
  }

  public int getSubmissionBatchSize() {
    return submissionBatchSize;
  }

  public void setSubmissionBatchSize(int submissionBatchSize) {
    this.submissionBatchSize = submissionBatchSize;
  }

  public int getSubmissionMaxAttempts() {
    return submissionMaxAttempts;
  }

  public void setSubmissionMaxAttempts(int submissionMaxAttempts) {
    this.submissionMaxAttempts = submissionMaxAttempts;
  }

  public int getSubmissionLockTtlSeconds() {
    return submissionLockTtlSeconds;
  }

  public void setSubmissionLockTtlSeconds(int submissionLockTtlSeconds) {
    this.submissionLockTtlSeconds = submissionLockTtlSeconds;
  }
}
