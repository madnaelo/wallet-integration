package com.wallet.swap.feature;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.FeatureProperties;
import com.wallet.swap.feature.FeatureModels.FeatureFlagResponse;
import com.wallet.swap.feature.FeatureModels.FeatureFlagUpdateRequest;
import com.wallet.swap.feature.FeatureModels.FeatureFlagsResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class FeatureFlagService {
  public static final String AUTO_SWAP_FEATURE_KEY = "auto_swap";

  private final FeatureProperties featureProperties;
  private final FeatureFlagRepository repository;

  public FeatureFlagService(FeatureProperties featureProperties, FeatureFlagRepository repository) {
    this.featureProperties = featureProperties;
    this.repository = repository;
  }

  public FeatureFlagsResponse publicFlags() {
    return new FeatureFlagsResponse(isAutoSwapEnabled());
  }

  public boolean isAutoSwapEnabled() {
    return repository.find(AUTO_SWAP_FEATURE_KEY)
        .map(FeatureFlagResponse::enabled)
        .orElse(featureProperties.isAutoSwapDefaultEnabled());
  }

  public void requireAutoSwapEnabled() {
    if (!isAutoSwapEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Auto Swap is not available.");
    }
  }

  public FeatureFlagResponse setAutoSwapEnabled(String adminApiKey, FeatureFlagUpdateRequest request) {
    requireAdminApiKey(adminApiKey);
    boolean enabled = Boolean.TRUE.equals(request.enabled());
    return repository.upsert(AUTO_SWAP_FEATURE_KEY, enabled, "admin");
  }

  private void requireAdminApiKey(String providedKey) {
    String expectedKey = featureProperties.getAdminApiKey() == null ? "" : featureProperties.getAdminApiKey().trim();
    if (expectedKey.isBlank()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Admin API key is not configured.");
    }
    if (providedKey == null || providedKey.isBlank()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Missing admin API key.");
    }
    byte[] expected = sha256(expectedKey);
    byte[] provided = sha256(providedKey.trim());
    if (!MessageDigest.isEqual(expected, provided)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid admin API key.");
    }
  }

  private byte[] sha256(String value) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is not available.", exception);
    }
  }
}
