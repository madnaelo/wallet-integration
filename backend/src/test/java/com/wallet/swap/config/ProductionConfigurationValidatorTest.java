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
        validLifiProperties(),
        validLimitOrderProperties(),
        validMaintenanceProperties(),
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
        validLifiProperties(),
        limitOrders,
        validMaintenanceProperties(),
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
        validLifiProperties(),
        limitOrders,
        validMaintenanceProperties(),
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
  void rejectsUnsafeOrUncredentialedLifiTracking() {
    var lifi = new LifiProperties();
    lifi.setBaseUrl("https://li.quest.attacker.example");
    lifi.setApiKey("");
    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        validApiProperties(),
        validAuthProperties(),
        validFeatureProperties(),
        lifi,
        validLimitOrderProperties(),
        validMaintenanceProperties(),
        validNotificationProperties());

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("LIFI_BASE_URL")
        .hasMessageContaining("LIFI_API_KEY");
  }

  @Test
  void rejectsLifiPollingThatConsumesTheSharedQuoteBudget() {
    var lifi = validLifiProperties();
    lifi.setStatusCheckFixedDelayMs(5_000);
    lifi.setStatusCheckBatchSize(100);
    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        validApiProperties(),
        validAuthProperties(),
        validFeatureProperties(),
        lifi,
        validLimitOrderProperties(),
        validMaintenanceProperties(),
        validNotificationProperties());

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("reserve API capacity");
  }

  @Test
  void rejectsCorsValuesThatAreNotExactOrigins() {
    var api = validApiProperties();
    api.setCorsAllowedOrigins(
        "https://swapassistant.example?redirect=https://attacker.example,"
            + "https://swapassistant.example:443");
    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        api,
        validAuthProperties(),
        validFeatureProperties(),
        validLifiProperties(),
        validLimitOrderProperties(),
        validMaintenanceProperties(),
        validNotificationProperties());

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("CORS_ALLOWED_ORIGINS");
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

  @Test
  void rejectsOperationalSettingsThatCouldFloodOrStarveProduction() {
    var api = validApiProperties();
    api.setMaxRequestBodyBytes(100_000_000);
    api.setTrustForwardedHeaders(false);
    api.setContactRateLimitMaxRequests(1_000);
    var limitOrders = validLimitOrderProperties();
    limitOrders.setSubmissionRetryFixedDelayMs(0);
    limitOrders.setStatusCheckBatchSize(10_000);
    var notifications = validNotificationProperties();
    notifications.setMonitorFixedDelayMs(0);
    notifications.setOutboxBatchSize(10_000);
    notifications.setEligibleStatuses(List.of("dry_run"));
    notifications.getPrice().setMaxAttempts(0);
    notifications.getPrice().setRetryDelayMs(0);
    var maintenance = validMaintenanceProperties();
    maintenance.setDeleteBatchSize(100_000);
    maintenance.setContactSubmissionRetentionDays(1);

    var configuration = new ProductionConfigurationValidator(
        "production",
        "jdbc:postgresql://wallet-postgres:5432/wallet",
        "a-long-random-database-password",
        "",
        api,
        validAuthProperties(),
        validFeatureProperties(),
        validLifiProperties(),
        limitOrders,
        maintenance,
        notifications);

    assertThatThrownBy(configuration::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("API_MAX_REQUEST_BODY_BYTES")
        .hasMessageContaining("CONTACT_RATE_LIMIT_MAX_REQUESTS")
        .hasMessageContaining("proxy headers")
        .hasMessageContaining("LIMIT_ORDER_SUBMISSION_RETRY_FIXED_DELAY_MS")
        .hasMessageContaining("LIMIT_ORDER_STATUS_CHECK_BATCH_SIZE")
        .hasMessageContaining("MAINTENANCE_DELETE_BATCH_SIZE")
        .hasMessageContaining("CONTACT_SUBMISSION_RETENTION_DAYS")
        .hasMessageContaining("NOTIFICATIONS_MONITOR_FIXED_DELAY_MS")
        .hasMessageContaining("NOTIFICATIONS_OUTBOX_BATCH_SIZE")
        .hasMessageContaining("NOTIFICATIONS_ELIGIBLE_STATUSES")
        .hasMessageContaining("COINGECKO_MAX_ATTEMPTS")
        .hasMessageContaining("COINGECKO_RETRY_DELAY_MS");
  }

  @Test
  void rejectsInvalidOrUndeliverableContactRecipient() {
    var notifications = validNotificationProperties();
    notifications.getEmail().setContactRecipient("not-an-email");
    var invalidAddress = productionConfiguration(validLimitOrderProperties(), notifications);

    assertThatThrownBy(invalidAddress::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("CONTACT_RECIPIENT_EMAIL");

    notifications.getEmail().setContactRecipient("operator@example.com");
    var disabledEmail = productionConfiguration(validLimitOrderProperties(), notifications);

    assertThatThrownBy(disabledEmail::validate)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("EMAIL_NOTIFICATIONS_ENABLED");
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
        validLifiProperties(),
        limitOrders,
        validMaintenanceProperties(),
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
    properties.setSessionCookiePath("/backend");
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

  private LifiProperties validLifiProperties() {
    var properties = new LifiProperties();
    properties.setApiKey("1234567890123456");
    return properties;
  }

  private MaintenanceProperties validMaintenanceProperties() {
    return new MaintenanceProperties();
  }

  private NotificationProperties validNotificationProperties() {
    var properties = new NotificationProperties();
    properties.setAppUrl("https://swapassistant.example");
    return properties;
  }
}
