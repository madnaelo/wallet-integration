package com.wallet.swap.notification;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public final class NotificationModels {
  private NotificationModels() {}

  public record NotificationPreferenceRequest(
      String emailAddress,
      Boolean emailEnabled,
      String telegramChatId,
      Boolean telegramEnabled,
      @Min(0) @Max(100000) Integer reverseProfitThresholdBps,
      @Min(5) @Max(10080) Integer cooldownMinutes) {}

  public record NotificationPreferenceResponse(
      String walletAddress,
      String emailAddress,
      boolean emailEnabled,
      String telegramChatId,
      boolean telegramEnabled,
      int reverseProfitThresholdBps,
      int cooldownMinutes) {}
}
