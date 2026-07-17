package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.limit-orders")
public class LimitOrderProperties {
  private boolean orderbookSubmissionEnabled = true;
  private boolean oneinchOrderbookEnabled;
  private String oneinchApiKey = "";
  private String oneinchOrderbookBaseUrl = "https://api.1inch.com/orderbook/v4.1";
  private String cowApiKey = "";
  private String cowOrderbookBaseUrl = "https://api.cow.fi";
  private String cowPartnerOrderbookBaseUrl = "https://partners.cow.fi";
  private int requestTimeoutSeconds = 8;
  private long submissionRetryFixedDelayMs = 30_000;
  private int submissionBatchSize = 25;
  private int submissionMaxAttempts = 8;
  private int submissionLockTtlSeconds = 60;
  private long statusCheckFixedDelayMs = 30_000;
  private int statusCheckBatchSize = 50;
  private int statusCheckLockTtlSeconds = 60;
  private int statusCheckOpenIntervalSeconds = 60;
  private int statusCheckPartialIntervalSeconds = 30;
  private int statusCheckMaxBackoffSeconds = 1_800;

  public boolean isOrderbookSubmissionEnabled() {
    return orderbookSubmissionEnabled;
  }

  public void setOrderbookSubmissionEnabled(boolean orderbookSubmissionEnabled) {
    this.orderbookSubmissionEnabled = orderbookSubmissionEnabled;
  }

  public boolean isOneinchOrderbookEnabled() {
    return oneinchOrderbookEnabled;
  }

  public void setOneinchOrderbookEnabled(boolean oneinchOrderbookEnabled) {
    this.oneinchOrderbookEnabled = oneinchOrderbookEnabled;
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

  public int getStatusCheckOpenIntervalSeconds() {
    return statusCheckOpenIntervalSeconds;
  }

  public void setStatusCheckOpenIntervalSeconds(int statusCheckOpenIntervalSeconds) {
    this.statusCheckOpenIntervalSeconds = statusCheckOpenIntervalSeconds;
  }

  public int getStatusCheckPartialIntervalSeconds() {
    return statusCheckPartialIntervalSeconds;
  }

  public void setStatusCheckPartialIntervalSeconds(int statusCheckPartialIntervalSeconds) {
    this.statusCheckPartialIntervalSeconds = statusCheckPartialIntervalSeconds;
  }

  public int getStatusCheckMaxBackoffSeconds() {
    return statusCheckMaxBackoffSeconds;
  }

  public void setStatusCheckMaxBackoffSeconds(int statusCheckMaxBackoffSeconds) {
    this.statusCheckMaxBackoffSeconds = statusCheckMaxBackoffSeconds;
  }
}
