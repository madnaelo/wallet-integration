package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.maintenance")
public class MaintenanceProperties {
  private long cleanupFixedDelayMs = 3_600_000;
  private int deleteBatchSize = 2_000;
  private int maxDeleteBatchesPerRun = 5;
  private int dryRunHistoryRetentionDays = 180;
  private int alertRetentionDays = 365;
  private int notificationOutboxRetentionDays = 30;
  private int contactSubmissionRetentionDays = 365;

  public int getDryRunHistoryRetentionDays() {
    return dryRunHistoryRetentionDays;
  }

  public void setDryRunHistoryRetentionDays(int dryRunHistoryRetentionDays) {
    this.dryRunHistoryRetentionDays = dryRunHistoryRetentionDays;
  }

  public int getAlertRetentionDays() {
    return alertRetentionDays;
  }

  public void setAlertRetentionDays(int alertRetentionDays) {
    this.alertRetentionDays = alertRetentionDays;
  }

  public int getNotificationOutboxRetentionDays() {
    return notificationOutboxRetentionDays;
  }

  public void setNotificationOutboxRetentionDays(int notificationOutboxRetentionDays) {
    this.notificationOutboxRetentionDays = notificationOutboxRetentionDays;
  }

  public int getContactSubmissionRetentionDays() {
    return contactSubmissionRetentionDays;
  }

  public void setContactSubmissionRetentionDays(int contactSubmissionRetentionDays) {
    this.contactSubmissionRetentionDays = contactSubmissionRetentionDays;
  }

  public long getCleanupFixedDelayMs() {
    return cleanupFixedDelayMs;
  }

  public void setCleanupFixedDelayMs(long cleanupFixedDelayMs) {
    this.cleanupFixedDelayMs = cleanupFixedDelayMs;
  }

  public int getDeleteBatchSize() {
    return deleteBatchSize;
  }

  public void setDeleteBatchSize(int deleteBatchSize) {
    this.deleteBatchSize = deleteBatchSize;
  }

  public int getMaxDeleteBatchesPerRun() {
    return maxDeleteBatchesPerRun;
  }

  public void setMaxDeleteBatchesPerRun(int maxDeleteBatchesPerRun) {
    this.maxDeleteBatchesPerRun = maxDeleteBatchesPerRun;
  }
}
