package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ProductionConfigurationValidatorTest {
  @Test
  void acceptsHardenedProductionConfiguration() {
    var configuration = validConfiguration();

    assertThatCode(configuration::validate).doesNotThrowAnyException();
  }

  @Test
  void rejectsUnsafeProductionConfiguration() {
    var api = validApiProperties();
    api.setCorsAllowedOrigins("*");
    api.setRateLimitKeyPepper("");
    var auth = validAuthProperties();
    auth.setExposeAccessToken(true);
    auth.setSessionCookieSecure(false);

    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://localhost:5432/wallet",
        "wallet",
        "",
        api,
        auth,
        validFeatureProperties(),
        validLimitOrderProperties(),
        validNotificationProperties());

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("CORS_ALLOWED_ORIGINS")
        .hasMessageContaining("API_RATE_LIMIT_KEY_PEPPER")
        .hasMessageContaining("AUTH_EXPOSE_ACCESS_TOKEN")
        .hasMessageContaining("DATABASE_URL");
  }

  private ProductionConfigurationValidator validConfiguration() {
    return new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        validApiProperties(),
        validAuthProperties(),
        validFeatureProperties(),
        validLimitOrderProperties(),
        validNotificationProperties());
  }

  private ApiProperties validApiProperties() {
    var properties = new ApiProperties();
    properties.setCorsAllowedOrigins("https://swapassistant.example");
    properties.setRateLimitEnabled(true);
    properties.setRateLimitKeyPepper("12345678901234567890123456789012");
    return properties;
  }

  private AuthProperties validAuthProperties() {
    var properties = new AuthProperties();
    properties.setSigningDomain("swapassistant.example");
    properties.setSigningUri("https://swapassistant.example");
    properties.setSessionCookieSecure(true);
    properties.setSessionCookieSameSite("Lax");
    properties.setExposeAccessToken(false);
    return properties;
  }

  private FeatureProperties validFeatureProperties() {
    var properties = new FeatureProperties();
    properties.setAdminApiKey("12345678901234567890123456789012");
    return properties;
  }

  private LimitOrderProperties validLimitOrderProperties() {
    var properties = new LimitOrderProperties();
    properties.setOneinchApiKey("1234567890123456");
    return properties;
  }

  private NotificationProperties validNotificationProperties() {
    var properties = new NotificationProperties();
    properties.setAppUrl("https://swapassistant.example");
    return properties;
  }
}
