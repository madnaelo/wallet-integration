package com.wallet.swap.feature;

import com.wallet.swap.feature.FeatureModels.FeatureFlagsResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/features")
public class FeatureController {
  private final FeatureFlagService featureFlagService;

  public FeatureController(FeatureFlagService featureFlagService) {
    this.featureFlagService = featureFlagService;
  }

  @GetMapping
  public FeatureFlagsResponse get() {
    return featureFlagService.publicFlags();
  }
}
