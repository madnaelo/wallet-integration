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
  public static final String PRICE_ALERTS_FEATURE_KEY = AUTO_SWAP_FEATURE_KEY;
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
    boolean priceAlertsEnabled = isPriceAlertsEnabled();
    return new FeatureFlagsResponse(priceAlertsEnabled, priceAlertsEnabled, isLimitOrdersEnabled());
  }

  public boolean isPriceAlertsEnabled() {
    return repository.find(PRICE_ALERTS_FEATURE_KEY)
        .map(FeatureFlagResponse::enabled)
        .orElse(featureProperties.isAutoSwapDefaultEnabled());
  }

  public boolean isAutoSwapEnabled() {
    return isPriceAlertsEnabled();
  }

  public boolean isLimitOrdersEnabled() {
    return repository.find(LIMIT_ORDERS_FEATURE_KEY)
        .map(FeatureFlagResponse::enabled)
        .orElse(featureProperties.isLimitOrdersDefaultEnabled());
  }

  public void requirePriceAlertsEnabled() {
    if (!isPriceAlertsEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Set Alerts is not available.");
    }
  }

  public void requireAutoSwapEnabled() {
    requirePriceAlertsEnabled();
  }

  public void requireLimitOrdersEnabled() {
    if (!isLimitOrdersEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Limit Orders are not available.");
    }
  }

  public FeatureFlagResponse setPriceAlertsEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    boolean enabled = Boolean.TRUE.equals(request.enabled());
    return repository.upsert(PRICE_ALERTS_FEATURE_KEY, enabled, "admin");
  }

  public FeatureFlagResponse setAutoSwapEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    return setPriceAlertsEnabled(adminApiKey, request);
  }

  public FeatureFlagResponse setLimitOrdersEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    boolean enabled = Boolean.TRUE.equals(request.enabled());
    return repository.upsert(LIMIT_ORDERS_FEATURE_KEY, enabled, "admin");
  }
}
