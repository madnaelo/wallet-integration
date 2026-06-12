package com.wallet.swap.feature;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public final class FeatureModels {
  private FeatureModels() {}

  public record FeatureFlagsResponse(
      boolean autoSwapEnabled,
      boolean priceAlertsEnabled,
      boolean limitOrdersEnabled) {}

  public record FeatureFlagUpdateRequest(@NotNull Boolean enabled) {}

  public record FeatureFlagResponse(String featureKey, boolean enabled, Instant updatedAt) {}
}
