package com.wallet.swap.feature;

import com.wallet.swap.feature.FeatureModels.FeatureFlagResponse;
import com.wallet.swap.feature.FeatureModels.FeatureFlagUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/features")
public class AdminFeatureController {
  private final FeatureFlagService featureFlagService;

  public AdminFeatureController(FeatureFlagService featureFlagService) {
    this.featureFlagService = featureFlagService;
  }

  @PutMapping("/auto-swap")
  public FeatureFlagResponse setAutoSwapEnabled(
      @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
      @Valid @RequestBody FeatureFlagUpdateRequest request) {
    return featureFlagService.setAutoSwapEnabled(adminApiKey, request);
  }

  @PutMapping("/limit-orders")
  public FeatureFlagResponse setLimitOrdersEnabled(
      @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
      @Valid @RequestBody FeatureFlagUpdateRequest request) {
    return featureFlagService.setLimitOrdersEnabled(adminApiKey, request);
  }
}
