package com.wallet.swap.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wallet.notifications")
public class NotificationProperties {
  private boolean monitorEnabled = true;
  private long monitorFixedDelayMs = 900_000;
  private int candidateLimit = 2_000;
  private int lookbackDays = 90;
  private int defaultProfitThresholdBps = 100;
  private int defaultLossThresholdBps = 500;
  private int defaultCooldownMinutes = 360;
  private int telegramLinkTtlMinutes = 10;
  private long outboxFixedDelayMs = 15_000;
  private int outboxBatchSize = 50;
  private int outboxMaxAttempts = 8;
  private int outboxLockTtlSeconds = 120;
  private List<String> eligibleStatuses = List.of("submitted", "confirmed");
  private String appUrl = "http://localhost:3000";
  private Price price = new Price();
  private Email email = new Email();
  private Telegram telegram = new Telegram();
  private Push push = new Push();

  public boolean isMonitorEnabled() {
    return monitorEnabled;
  }

  public void setMonitorEnabled(boolean monitorEnabled) {
    this.monitorEnabled = monitorEnabled;
  }

  public long getMonitorFixedDelayMs() {
    return monitorFixedDelayMs;
  }

  public void setMonitorFixedDelayMs(long monitorFixedDelayMs) {
    this.monitorFixedDelayMs = monitorFixedDelayMs;
  }

  public int getCandidateLimit() {
    return candidateLimit;
  }

  public void setCandidateLimit(int candidateLimit) {
    this.candidateLimit = candidateLimit;
  }

  public int getLookbackDays() {
    return lookbackDays;
  }

  public void setLookbackDays(int lookbackDays) {
    this.lookbackDays = lookbackDays;
  }

  public int getDefaultProfitThresholdBps() {
    return defaultProfitThresholdBps;
  }

  public void setDefaultProfitThresholdBps(int defaultProfitThresholdBps) {
    this.defaultProfitThresholdBps = defaultProfitThresholdBps;
  }

  public int getDefaultLossThresholdBps() {
    return defaultLossThresholdBps;
  }

  public void setDefaultLossThresholdBps(int defaultLossThresholdBps) {
    this.defaultLossThresholdBps = defaultLossThresholdBps;
  }

  public int getDefaultCooldownMinutes() {
    return defaultCooldownMinutes;
  }

  public void setDefaultCooldownMinutes(int defaultCooldownMinutes) {
    this.defaultCooldownMinutes = defaultCooldownMinutes;
  }

  public int getTelegramLinkTtlMinutes() {
    return telegramLinkTtlMinutes;
  }

  public void setTelegramLinkTtlMinutes(int telegramLinkTtlMinutes) {
    this.telegramLinkTtlMinutes = telegramLinkTtlMinutes;
  }

  public long getOutboxFixedDelayMs() {
    return outboxFixedDelayMs;
  }

  public void setOutboxFixedDelayMs(long outboxFixedDelayMs) {
    this.outboxFixedDelayMs = outboxFixedDelayMs;
  }

  public int getOutboxBatchSize() {
    return outboxBatchSize;
  }

  public void setOutboxBatchSize(int outboxBatchSize) {
    this.outboxBatchSize = outboxBatchSize;
  }

  public int getOutboxMaxAttempts() {
    return outboxMaxAttempts;
  }

  public void setOutboxMaxAttempts(int outboxMaxAttempts) {
    this.outboxMaxAttempts = outboxMaxAttempts;
  }

  public int getOutboxLockTtlSeconds() {
    return outboxLockTtlSeconds;
  }

  public void setOutboxLockTtlSeconds(int outboxLockTtlSeconds) {
    this.outboxLockTtlSeconds = outboxLockTtlSeconds;
  }

  public List<String> getEligibleStatuses() {
    return eligibleStatuses;
  }

  public void setEligibleStatuses(List<String> eligibleStatuses) {
    this.eligibleStatuses = eligibleStatuses;
  }

  public String getAppUrl() {
    return appUrl;
  }

  public void setAppUrl(String appUrl) {
    this.appUrl = appUrl;
  }

  public Price getPrice() {
    return price;
  }

  public void setPrice(Price price) {
    this.price = price;
  }

  public Email getEmail() {
    return email;
  }

  public void setEmail(Email email) {
    this.email = email;
  }

  public Telegram getTelegram() {
    return telegram;
  }

  public void setTelegram(Telegram telegram) {
    this.telegram = telegram;
  }

  public Push getPush() {
    return push;
  }

  public void setPush(Push push) {
    this.push = push;
  }

  public static class Price {
    private String coingeckoBaseUrl = "https://api.coingecko.com/api/v3";
    private String coingeckoApiKey = "";
    private String coingeckoApiKeyHeader = "x-cg-demo-api-key";
    private int requestTimeoutSeconds = 15;
    private int contractBatchSize = 100;
    private int maxAttempts = 2;
    private long retryDelayMs = 1_000;

    public String getCoingeckoBaseUrl() {
      return coingeckoBaseUrl;
    }

    public void setCoingeckoBaseUrl(String coingeckoBaseUrl) {
      this.coingeckoBaseUrl = coingeckoBaseUrl;
    }

    public String getCoingeckoApiKey() {
      return coingeckoApiKey;
    }

    public void setCoingeckoApiKey(String coingeckoApiKey) {
      this.coingeckoApiKey = coingeckoApiKey;
    }

    public String getCoingeckoApiKeyHeader() {
      return coingeckoApiKeyHeader;
    }

    public void setCoingeckoApiKeyHeader(String coingeckoApiKeyHeader) {
      this.coingeckoApiKeyHeader = coingeckoApiKeyHeader;
    }

    public int getRequestTimeoutSeconds() {
      return requestTimeoutSeconds;
    }

    public void setRequestTimeoutSeconds(int requestTimeoutSeconds) {
      this.requestTimeoutSeconds = requestTimeoutSeconds;
    }

    public int getContractBatchSize() {
      return contractBatchSize;
    }

    public void setContractBatchSize(int contractBatchSize) {
      this.contractBatchSize = contractBatchSize;
    }

    public int getMaxAttempts() {
      return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
      this.maxAttempts = maxAttempts;
    }

    public long getRetryDelayMs() {
      return retryDelayMs;
    }

    public void setRetryDelayMs(long retryDelayMs) {
      this.retryDelayMs = retryDelayMs;
    }
  }

  public static class Email {
    private boolean enabled = false;
    private String from = "";

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public String getFrom() {
      return from;
    }

    public void setFrom(String from) {
      this.from = from;
    }
  }

  public static class Telegram {
    private boolean enabled = false;
    private String botToken = "";
    private String botUsername = "";
    private String baseUrl = "https://api.telegram.org";

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public String getBotToken() {
      return botToken;
    }

    public void setBotToken(String botToken) {
      this.botToken = botToken;
    }

    public String getBotUsername() {
      return botUsername;
    }

    public void setBotUsername(String botUsername) {
      this.botUsername = botUsername;
    }

    public String getBaseUrl() {
      return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  public static class Push {
    private static final List<String> DEFAULT_ALLOWED_ENDPOINT_HOSTS = List.of(
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        ".notify.windows.com");

    private boolean enabled = false;
    private String vapidPublicKey = "";
    private String vapidPrivateKey = "";
    private String vapidSubject = "mailto:alerts@swapassistant.app";
    private List<String> allowedEndpointHosts = DEFAULT_ALLOWED_ENDPOINT_HOSTS;
    private int requestTimeoutSeconds = 15;
    private int maxDevicesPerWallet = 10;

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public String getVapidPublicKey() {
      return vapidPublicKey;
    }

    public void setVapidPublicKey(String vapidPublicKey) {
      this.vapidPublicKey = vapidPublicKey;
    }

    public String getVapidPrivateKey() {
      return vapidPrivateKey;
    }

    public void setVapidPrivateKey(String vapidPrivateKey) {
      this.vapidPrivateKey = vapidPrivateKey;
    }

    public String getVapidSubject() {
      return vapidSubject;
    }

    public void setVapidSubject(String vapidSubject) {
      String normalized = vapidSubject == null ? "" : vapidSubject.trim();
      this.vapidSubject = "mailto:alerts@thewallet.app".equalsIgnoreCase(normalized)
          ? "mailto:alerts@swapassistant.app"
          : normalized;
    }

    public List<String> getAllowedEndpointHosts() {
      return allowedEndpointHosts;
    }

    public void setAllowedEndpointHosts(List<String> allowedEndpointHosts) {
      this.allowedEndpointHosts = allowedEndpointHosts == null || allowedEndpointHosts.isEmpty()
          ? DEFAULT_ALLOWED_ENDPOINT_HOSTS
          : List.copyOf(allowedEndpointHosts);
    }

    public int getRequestTimeoutSeconds() {
      return requestTimeoutSeconds;
    }

    public void setRequestTimeoutSeconds(int requestTimeoutSeconds) {
      this.requestTimeoutSeconds = requestTimeoutSeconds;
    }

    public int getMaxDevicesPerWallet() {
      return maxDevicesPerWallet;
    }

    public void setMaxDevicesPerWallet(int maxDevicesPerWallet) {
      this.maxDevicesPerWallet = maxDevicesPerWallet;
    }
  }
}
