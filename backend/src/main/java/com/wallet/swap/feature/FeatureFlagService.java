package com.wallet.swap.feature;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.FeatureProperties;
import com.wallet.swap.feature.FeatureModels.FeatureFlagResponse;
import com.wallet.swap.feature.FeatureModels.FeatureFlagUpdateRequest;
import com.wallet.swap.feature.FeatureModels.FeatureFlagsResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class FeatureFlagService {
  public static final String AUTO_SWAP_FEATURE_KEY = "auto_swap";
  public static final String LIMIT_ORDERS_FEATURE_KEY = "limit_orders";

  private final FeatureProperties featureProperties;
  private final FeatureFlagRepository repository;
  private final AdminAuthService adminAuthService;

  public FeatureFlagService(
      FeatureProperties featureProperties,
      FeatureFlagRepository repository,
      AdminAuthService adminAuthService) {
    this.featureProperties = featureProperties;
    this.repository = repository;
    this.adminAuthService = adminAuthService;
  }

  public FeatureFlagsResponse publicFlags() {
    return new FeatureFlagsResponse(isAutoSwapEnabled(), isLimitOrdersEnabled());
  }

  public boolean isAutoSwapEnabled() {
    return repository.find(AUTO_SWAP_FEATURE_KEY)
        .map(FeatureFlagResponse::enabled)
        .orElse(featureProperties.isAutoSwapDefaultEnabled());
  }

  public boolean isLimitOrdersEnabled() {
    return repository.find(LIMIT_ORDERS_FEATURE_KEY)
        .map(FeatureFlagResponse::enabled)
        .orElse(featureProperties.isLimitOrdersDefaultEnabled());
  }

  public void requireAutoSwapEnabled() {
    if (!isAutoSwapEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Set Alerts is not available.");
    }
  }

  public void requireLimitOrdersEnabled() {
    if (!isLimitOrdersEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Limit Orders are not available.");
    }
  }

  public FeatureFlagResponse setAutoSwapEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    boolean enabled = Boolean.TRUE.equals(request.enabled());
    return repository.upsert(AUTO_SWAP_FEATURE_KEY, enabled, "admin");
  }

  public FeatureFlagResponse setLimitOrdersEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    boolean enabled = Boolean.TRUE.equals(request.enabled());
    return repository.upsert(LIMIT_ORDERS_FEATURE_KEY, enabled, "admin");
  }
}
