package com.wallet.swap.notification;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class NotificationModels {
  private NotificationModels() {}

  public record NotificationPreferenceRequest(
      @Email @Size(max = 254) String emailAddress,
      Boolean emailEnabled,
      Boolean telegramEnabled,
      Boolean pushEnabled,
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
      boolean pushEnabled,
      int pushSubscriptionCount,
      int reverseProfitThresholdBps,
      boolean reverseLossEnabled,
      int reverseLossThresholdBps,
      int cooldownMinutes) {}

  public record PushNotificationConfigResponse(
      boolean enabled,
      String vapidPublicKey) {}

  public record PushSubscriptionRequest(
      @NotBlank @Size(max = 2048) String endpoint,
      @Valid @NotNull
      PushSubscriptionKeys keys,
      Long expirationTime) {}

  public record PushSubscriptionDisableRequest(
      @Size(max = 2048) String endpoint) {}

  public record PushSubscriptionKeys(
      @NotBlank @Size(max = 512) String p256dh,
      @NotBlank @Size(max = 256) String auth) {}
}
