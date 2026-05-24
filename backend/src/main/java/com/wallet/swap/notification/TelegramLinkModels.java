package com.wallet.swap.notification;

import java.time.Instant;
import java.util.UUID;

public final class TelegramLinkModels {
  private TelegramLinkModels() {}

  public record TelegramLinkCode(
      UUID id,
      String walletAddress,
      String code,
      Instant expiresAt,
      Instant consumedAt,
      Instant createdAt) {}

  public record TelegramLinkStartResponse(
      String code,
      String botUsername,
      String deepLink,
      Instant expiresAt) {}
}
