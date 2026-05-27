package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.maintenance")
public class MaintenanceProperties {
  private int dryRunHistoryRetentionDays = 180;
  private int alertRetentionDays = 365;
  private int notificationOutboxRetentionDays = 30;

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
}
