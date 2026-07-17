package com.wallet.swap.feature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.FeatureProperties;
import com.wallet.swap.feature.FeatureModels.FeatureFlagResponse;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FeatureFlagServiceTest {
  private final FeatureProperties properties = new FeatureProperties();
  private final FeatureFlagRepository repository = mock(FeatureFlagRepository.class);
  private final FeatureFlagService service = new FeatureFlagService(properties, repository, new AdminAuthService(properties));

  @Test
  void usesConfiguredDefaultWhenDatabaseFlagIsMissing() {
    properties.setPriceAlertsDefaultEnabled(true);
    when(repository.find(FeatureFlagService.PRICE_ALERTS_FEATURE_KEY)).thenReturn(Optional.empty());

    assertThat(service.isPriceAlertsEnabled()).isTrue();
  }

  @Test
  void databaseFlagOverridesConfiguredDefault() {
    properties.setPriceAlertsDefaultEnabled(true);
    when(repository.find(FeatureFlagService.PRICE_ALERTS_FEATURE_KEY))
        .thenReturn(Optional.of(new FeatureFlagResponse("price_alerts", false, Instant.now())));

    assertThat(service.isPriceAlertsEnabled()).isFalse();
  }

  @Test
  void rejectsAdminUpdateWhenKeyIsNotConfigured() {
    assertThatThrownBy(() -> service.setPriceAlertsEnabled("anything", new FeatureModels.FeatureFlagUpdateRequest(true)))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("not configured");
  }
}
