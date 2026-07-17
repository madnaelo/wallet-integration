package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.features")
public class FeatureProperties {
  private boolean priceAlertsDefaultEnabled = false;
  private boolean limitOrdersDefaultEnabled = true;
  private String adminApiKey = "";

  public boolean isPriceAlertsDefaultEnabled() {
    return priceAlertsDefaultEnabled;
  }

  public void setPriceAlertsDefaultEnabled(boolean priceAlertsDefaultEnabled) {
    this.priceAlertsDefaultEnabled = priceAlertsDefaultEnabled;
  }

  public boolean isLimitOrdersDefaultEnabled() {
    return limitOrdersDefaultEnabled;
  }

  public void setLimitOrdersDefaultEnabled(boolean limitOrdersDefaultEnabled) {
    this.limitOrdersDefaultEnabled = limitOrdersDefaultEnabled;
  }

  public String getAdminApiKey() {
    return adminApiKey;
  }

  public void setAdminApiKey(String adminApiKey) {
    this.adminApiKey = adminApiKey;
  }
}
