package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.features")
public class FeatureProperties {
  private boolean autoSwapDefaultEnabled = false;
  private String adminApiKey = "";

  public boolean isAutoSwapDefaultEnabled() {
    return autoSwapDefaultEnabled;
  }

  public void setAutoSwapDefaultEnabled(boolean autoSwapDefaultEnabled) {
    this.autoSwapDefaultEnabled = autoSwapDefaultEnabled;
  }

  public String getAdminApiKey() {
    return adminApiKey;
  }

  public void setAdminApiKey(String adminApiKey) {
    this.adminApiKey = adminApiKey;
  }
}
