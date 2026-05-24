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
  private int defaultCooldownMinutes = 360;
  private List<String> eligibleStatuses = List.of("submitted", "confirmed");
  private String appUrl = "http://localhost:3000";
  private Price price = new Price();
  private Email email = new Email();
  private Telegram telegram = new Telegram();

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

  public int getDefaultCooldownMinutes() {
    return defaultCooldownMinutes;
  }

  public void setDefaultCooldownMinutes(int defaultCooldownMinutes) {
    this.defaultCooldownMinutes = defaultCooldownMinutes;
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

  public static class Price {
    private String coingeckoBaseUrl = "https://api.coingecko.com/api/v3";
    private String coingeckoApiKey = "";
    private String coingeckoApiKeyHeader = "x-cg-demo-api-key";
    private int requestTimeoutSeconds = 8;
    private int contractBatchSize = 100;

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

    public String getBaseUrl() {
      return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
      this.baseUrl = baseUrl;
    }
  }
}
