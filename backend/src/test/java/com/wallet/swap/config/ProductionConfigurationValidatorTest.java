package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
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

  @Test
  void rejectsDocumentationPlaceholdersInProductionSecrets() {
    var api = validApiProperties();
    api.setRateLimitKeyPepper("change_me_to_a_random_secret_in_production");
    var features = validFeatureProperties();
    features.setAdminApiKey("your_admin_api_key_that_is_long_enough");
    var limitOrders = validLimitOrderProperties();
    limitOrders.setOneinchApiKey("your_1inch_api_key_here");
    var notifications = validNotificationProperties();
    notifications.getTelegram().setEnabled(true);
    notifications.getTelegram().setBotToken("replace_me_with_a_real_telegram_bot_token");
    notifications.getTelegram().setBotUsername("SwapAssistantBot");

    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "change_me_to_a_long_random_database_password",
        "",
        api,
        validAuthProperties(),
        features,
        limitOrders,
        notifications);

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("API_RATE_LIMIT_KEY_PEPPER")
        .hasMessageContaining("ADMIN_API_KEY")
        .hasMessageContaining("DATABASE_PASSWORD")
        .hasMessageContaining("TELEGRAM_BOT_TOKEN")
        .hasMessageContaining("ONEINCH_API_KEY");
  }

  @Test
  void permitsMissingOneInchCredentialsWhenProviderIsDisabled() {
    var limitOrders = validLimitOrderProperties();
    limitOrders.setOneinchOrderbookEnabled(false);
    limitOrders.setOneinchApiKey("");
    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        validApiProperties(),
        validAuthProperties(),
        validFeatureProperties(),
        limitOrders,
        validNotificationProperties());

    assertThatCode(configuration::validate).doesNotThrowAnyException();
  }

  @Test
  void rejectsProviderUrlsThatCouldReceiveProductionCredentials() {
    var limitOrders = validLimitOrderProperties();
    limitOrders.setCowPartnerOrderbookBaseUrl("https://partners.cow.fi.attacker.example");
    var notifications = validNotificationProperties();
    notifications.getPrice().setCoingeckoBaseUrl("https://api.coingecko.com.attacker.example/api/v3");
    notifications.getTelegram().setEnabled(true);
    notifications.getTelegram().setBotToken("12345678901234567890123456789012");
    notifications.getTelegram().setBotUsername("SwapAssistantBot");
    notifications.getTelegram().setBaseUrl("https://api.telegram.org.attacker.example");

    var configuration = productionConfiguration(limitOrders, notifications);

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("COINGECKO_BASE_URL")
        .hasMessageContaining("TELEGRAM_BASE_URL")
        .hasMessageContaining("COW_PARTNER_ORDERBOOK_BASE_URL");
  }

  @Test
  void rejectsUnrecognizedPushServicesAndCoinGeckoHeaders() {
    var notifications = validNotificationProperties();
    notifications.getPrice().setCoingeckoApiKeyHeader("Authorization");
    notifications.getPush().setEnabled(true);
    notifications.getPush().setVapidPublicKey("A".repeat(87));
    notifications.getPush().setVapidPrivateKey("B".repeat(43));
    notifications.getPush().setAllowedEndpointHosts(List.of(".attacker.example"));
    notifications.getPush().setRequestTimeoutSeconds(0);
    notifications.getPush().setMaxDevicesPerWallet(100);

    var configuration = productionConfiguration(validLimitOrderProperties(), notifications);

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("COINGECKO_API_KEY_HEADER")
        .hasMessageContaining("PUSH_ALLOWED_ENDPOINT_HOSTS")
        .hasMessageContaining("PUSH_REQUEST_TIMEOUT_SECONDS")
        .hasMessageContaining("PUSH_MAX_DEVICES_PER_WALLET");
  }

  private ProductionConfigurationValidator validConfiguration() {
    return productionConfiguration(validLimitOrderProperties(), validNotificationProperties());
  }

  private ProductionConfigurationValidator productionConfiguration(
      LimitOrderProperties limitOrders,
      NotificationProperties notifications) {
    return new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        validApiProperties(),
        validAuthProperties(),
        validFeatureProperties(),
        limitOrders,
        notifications);
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
    properties.setOneinchOrderbookEnabled(true);
    properties.setOneinchApiKey("1234567890123456");
    return properties;
  }

  private NotificationProperties validNotificationProperties() {
    var properties = new NotificationProperties();
    properties.setAppUrl("https://swapassistant.example");
    return properties;
  }
}
