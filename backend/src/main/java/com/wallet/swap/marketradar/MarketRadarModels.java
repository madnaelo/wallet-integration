package com.wallet.swap.marketradar;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class MarketRadarModels {
  private MarketRadarModels() {}

  public static final String PAIR_PATTERN =
      "^[A-Z0-9][A-Z0-9._-]{0,31}/[A-Z0-9][A-Z0-9._-]{0,31}/SPOT$";

  public enum AlertType {
    SUPPLY_APPROACHED,
    DEMAND_APPROACHED,
    ZONE_STRENGTHENED,
    ZONE_WEAKENED,
    ZONE_BROKEN,
    BUYER_ABSORPTION_INCREASED,
    SELLER_ABSORPTION_INCREASED
  }

  public record AlertRequest(
      @NotNull @Pattern(regexp = PAIR_PATTERN) String pairKey,
      @NotNull AlertType eventType,
      @Min(0) @Max(100) int minimumScore,
      @Min(15) @Max(1440) int cooldownMinutes) {}

  public record AlertRule(
      UUID id,
      String pairKey,
      AlertType eventType,
      int minimumScore,
      int cooldownMinutes,
      Instant createdAt) {}

  public record RadarNotification(
      String pairKey,
      AlertType eventType,
      String zoneType,
      BigDecimal lower,
      BigDecimal upper,
      int structuralScore,
      int venueCount,
      String lifecycle,
      long observedAt,
      String eventId,
      int qualifyingScore) {}
}
