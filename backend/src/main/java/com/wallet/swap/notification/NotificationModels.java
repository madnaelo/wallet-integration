package com.wallet.swap.notification;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public final class NotificationModels {
  private NotificationModels() {}

  public record NotificationPreferenceRequest(
      @Email @Size(max = 254) String emailAddress,
      Boolean emailEnabled,
      @Size(max = 64) String telegramChatId,
      Boolean telegramEnabled,
      @Min(0) @Max(100000) Integer reverseProfitThresholdBps,
      Boolean reverseLossEnabled,
      @Min(0) @Max(100000) Integer reverseLossThresholdBps,
      @Min(5) @Max(10080) Integer cooldownMinutes) {}

  public record NotificationPreferenceResponse(
      String walletAddress,
      String emailAddress,
      boolean emailEnabled,
      String telegramChatId,
      boolean telegramEnabled,
      int reverseProfitThresholdBps,
      boolean reverseLossEnabled,
      int reverseLossThresholdBps,
      int cooldownMinutes) {}
}
