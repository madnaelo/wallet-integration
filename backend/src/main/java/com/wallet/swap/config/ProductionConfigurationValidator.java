package com.wallet.swap.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ProductionConfigurationValidator implements ApplicationRunner {
  private static final Set<String> COINGECKO_HOSTS = Set.of("api.coingecko.com", "pro-api.coingecko.com");
  private static final Set<String> ONEINCH_HOSTS = Set.of("api.1inch.com", "api.1inch.dev");
  private static final Set<String> COW_PUBLIC_HOSTS = Set.of("api.cow.fi");
  private static final Set<String> COW_PARTNER_HOSTS = Set.of("partners.cow.fi");
  private static final Set<String> TELEGRAM_HOSTS = Set.of("api.telegram.org");
  private static final Set<String> ALLOWED_PUSH_HOST_PATTERNS = Set.of(
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
      ".notify.windows.com");
  private final String appEnvironment;
  private final String databaseUrl;
  private final String databasePassword;
  private final String smtpHost;
  private final ApiProperties apiProperties;
  private final AuthProperties authProperties;
  private final FeatureProperties featureProperties;
  private final LimitOrderProperties limitOrderProperties;
  private final NotificationProperties notificationProperties;

  public ProductionConfigurationValidator(
      @Value("${APP_ENVIRONMENT:development}") String appEnvironment,
      @Value("${spring.datasource.url:}") String databaseUrl,
      @Value("${spring.datasource.password:}") String databasePassword,
      @Value("${spring.mail.host:}") String smtpHost,
      ApiProperties apiProperties,
      AuthProperties authProperties,
      FeatureProperties featureProperties,
      LimitOrderProperties limitOrderProperties,
      NotificationProperties notificationProperties) {
    this.appEnvironment = appEnvironment;
    this.databaseUrl = databaseUrl;
    this.databasePassword = databasePassword;
    this.smtpHost = smtpHost;
    this.apiProperties = apiProperties;
    this.authProperties = authProperties;
    this.featureProperties = featureProperties;
    this.limitOrderProperties = limitOrderProperties;
    this.notificationProperties = notificationProperties;
  }

  @Override
  public void run(ApplicationArguments args) {
    validate();
  }

  void validate() {
    if (!"production".equalsIgnoreCase(text(appEnvironment))) return;

    List<String> problems = new ArrayList<>();
    validateApi(problems);
    validateAuthentication(problems);
    validateDatabase(problems);
    validateNotifications(problems);
    validateLimitOrders(problems);

    if (!problems.isEmpty()) {
      throw new IllegalStateException("Invalid production configuration: " + String.join(", ", problems));
    }
  }

  private void validateApi(List<String> problems) {
    List<String> origins = List.of(text(apiProperties.getCorsAllowedOrigins()).split(","));
    if (origins.isEmpty() || origins.stream().map(String::trim).anyMatch(this::isUnsafeProductionOrigin)) {
      problems.add("CORS_ALLOWED_ORIGINS must contain only explicit HTTPS origins");
    }
    if (!apiProperties.isRateLimitEnabled()) problems.add("API_RATE_LIMIT_ENABLED must be true");
    if (isWeakSecret(apiProperties.getRateLimitKeyPepper(), 32)) {
      problems.add("API_RATE_LIMIT_KEY_PEPPER must contain at least 32 characters");
    }
    if (isWeakSecret(featureProperties.getAdminApiKey(), 32)) {
      problems.add("ADMIN_API_KEY must contain at least 32 characters");
    }
  }

  private void validateAuthentication(List<String> problems) {
    URI signingUri = httpsUri(authProperties.getSigningUri());
    if (signingUri == null) {
      problems.add("AUTH_SIGNING_URI must be an HTTPS URL");
    } else if (!text(authProperties.getSigningDomain()).equalsIgnoreCase(signingUri.getAuthority())) {
      problems.add("AUTH_SIGNING_DOMAIN must match AUTH_SIGNING_URI");
    }
    if (!authProperties.isSessionCookieSecure()) problems.add("AUTH_SESSION_COOKIE_SECURE must be true");
    if (authProperties.isExposeAccessToken()) problems.add("AUTH_EXPOSE_ACCESS_TOKEN must be false");
    String sameSite = text(authProperties.getSessionCookieSameSite()).toLowerCase(Locale.ROOT);
    if (!(sameSite.equals("lax") || sameSite.equals("strict"))) {
      problems.add("AUTH_SESSION_COOKIE_SAME_SITE must be Lax or Strict");
    }
    if (authProperties.getNonceTtlMinutes() < 1 || authProperties.getNonceTtlMinutes() > 30) {
      problems.add("NONCE_TTL_MINUTES must be between 1 and 30");
    }
    if (authProperties.getSessionTtlHours() < 1 || authProperties.getSessionTtlHours() > 720) {
      problems.add("SESSION_TTL_HOURS must be between 1 and 720");
    }
  }

  private void validateDatabase(List<String> problems) {
    String url = text(databaseUrl).toLowerCase(Locale.ROOT);
    if (!url.startsWith("jdbc:postgresql://") || url.contains("localhost") || url.contains("127.0.0.1")) {
      problems.add("DATABASE_URL must point to the production PostgreSQL service");
    }
    String password = text(databasePassword);
    if (isWeakSecret(password, 16) || password.equalsIgnoreCase("wallet")) {
      problems.add("DATABASE_PASSWORD must be a non-default secret of at least 16 characters");
    }
  }

  private void validateNotifications(List<String> problems) {
    if (httpsUri(notificationProperties.getAppUrl()) == null) problems.add("APP_URL must be an HTTPS URL");

    URI coinGeckoUri = validateProviderUrl(
        problems,
        "COINGECKO_BASE_URL",
        notificationProperties.getPrice().getCoingeckoBaseUrl(),
        COINGECKO_HOSTS);
    String coinGeckoHeader = text(notificationProperties.getPrice().getCoingeckoApiKeyHeader())
        .toLowerCase(Locale.ROOT);
    if (!Set.of("x-cg-demo-api-key", "x-cg-pro-api-key").contains(coinGeckoHeader)) {
      problems.add("COINGECKO_API_KEY_HEADER must be a supported CoinGecko header");
    } else if (coinGeckoUri != null
        && coinGeckoUri.getHost().equalsIgnoreCase("pro-api.coingecko.com")
        && !coinGeckoHeader.equals("x-cg-pro-api-key")) {
      problems.add("COINGECKO_API_KEY_HEADER must match the CoinGecko Pro host");
    }

    NotificationProperties.Telegram telegram = notificationProperties.getTelegram();
    if (telegram.isEnabled()) {
      if (isWeakSecret(telegram.getBotToken(), 32)) problems.add("TELEGRAM_BOT_TOKEN is missing");
      if (text(telegram.getBotUsername()).isBlank()) problems.add("TELEGRAM_BOT_USERNAME is missing");
      validateProviderUrl(problems, "TELEGRAM_BASE_URL", telegram.getBaseUrl(), TELEGRAM_HOSTS);
    }

    NotificationProperties.Push push = notificationProperties.getPush();
    if (push.isEnabled()) {
      if (text(push.getVapidPublicKey()).length() < 80) problems.add("PUSH_VAPID_PUBLIC_KEY is invalid");
      if (isWeakSecret(push.getVapidPrivateKey(), 40)) problems.add("PUSH_VAPID_PRIVATE_KEY is invalid");
      String subject = text(push.getVapidSubject());
      if (!(subject.startsWith("mailto:") || subject.startsWith("https://"))) {
        problems.add("PUSH_VAPID_SUBJECT must be a mailto or HTTPS URI");
      }
      if (push.getAllowedEndpointHosts().isEmpty()
          || push.getAllowedEndpointHosts().stream()
              .map(this::text)
              .map(value -> value.toLowerCase(Locale.ROOT))
              .anyMatch(value -> !ALLOWED_PUSH_HOST_PATTERNS.contains(value))) {
        problems.add("PUSH_ALLOWED_ENDPOINT_HOSTS must contain only supported browser push services");
      }
      if (push.getRequestTimeoutSeconds() < 1 || push.getRequestTimeoutSeconds() > 30) {
        problems.add("PUSH_REQUEST_TIMEOUT_SECONDS must be between 1 and 30");
      }
      if (push.getMaxDevicesPerWallet() < 1 || push.getMaxDevicesPerWallet() > 25) {
        problems.add("PUSH_MAX_DEVICES_PER_WALLET must be between 1 and 25");
      }
    }

    if (notificationProperties.getEmail().isEnabled()) {
      if (text(notificationProperties.getEmail().getFrom()).isBlank()) problems.add("EMAIL_FROM is missing");
      if (text(smtpHost).isBlank()) problems.add("SMTP_HOST is missing");
    }
  }

  private void validateLimitOrders(List<String> problems) {
    if (!limitOrderProperties.isOrderbookSubmissionEnabled()) return;
    if (limitOrderProperties.isOneinchOrderbookEnabled()
        && isWeakSecret(limitOrderProperties.getOneinchApiKey(), 16)) {
      problems.add("ONEINCH_API_KEY is required for limit-order fallback");
    }
    validateProviderUrl(
        problems,
        "ONEINCH_ORDERBOOK_BASE_URL",
        limitOrderProperties.getOneinchOrderbookBaseUrl(),
        ONEINCH_HOSTS);
    validateProviderUrl(
        problems,
        "COW_ORDERBOOK_BASE_URL",
        limitOrderProperties.getCowOrderbookBaseUrl(),
        COW_PUBLIC_HOSTS);
    validateProviderUrl(
        problems,
        "COW_PARTNER_ORDERBOOK_BASE_URL",
        limitOrderProperties.getCowPartnerOrderbookBaseUrl(),
        COW_PARTNER_HOSTS);
  }

  private URI validateProviderUrl(
      List<String> problems,
      String settingName,
      String value,
      Set<String> allowedHosts) {
    URI uri = httpsUri(value);
    String host = uri == null ? "" : text(uri.getHost()).toLowerCase(Locale.ROOT);
    if (uri == null
        || !allowedHosts.contains(host)
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || (uri.getPort() != -1 && uri.getPort() != 443)) {
      problems.add(settingName + " must use an approved provider HTTPS host");
      return null;
    }
    return uri;
  }

  private boolean isUnsafeProductionOrigin(String value) {
    String origin = text(value);
    URI uri = httpsUri(origin);
    return origin.isBlank()
        || origin.equals("*")
        || uri == null
        || uri.getPath() != null && !uri.getPath().isBlank() && !uri.getPath().equals("/")
        || isLocalHost(uri.getHost());
  }

  private URI httpsUri(String value) {
    try {
      URI uri = URI.create(text(value));
      if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) return null;
      return uri;
    } catch (IllegalArgumentException exception) {
      return null;
    }
  }

  private boolean isLocalHost(String host) {
    String value = text(host).toLowerCase(Locale.ROOT);
    return value.equals("localhost") || value.equals("127.0.0.1") || value.equals("::1");
  }

  private boolean isWeakSecret(String value, int minimumLength) {
    String secret = text(value);
    if (secret.length() < minimumLength) return true;
    String normalized = secret.toLowerCase(Locale.ROOT);
    return normalized.contains("change_me")
        || normalized.contains("changeme")
        || normalized.contains("replace_me")
        || normalized.contains("replace-me")
        || normalized.contains("placeholder")
        || normalized.startsWith("your_")
        || normalized.startsWith("your-");
  }

  private String text(String value) {
    return value == null ? "" : value.trim();
  }
}
