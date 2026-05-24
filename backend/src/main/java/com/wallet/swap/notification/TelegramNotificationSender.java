package com.wallet.swap.notification;

import com.wallet.swap.config.NotificationProperties;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class TelegramNotificationSender {
  private final NotificationProperties properties;
  private final RestClient restClient;

  public TelegramNotificationSender(NotificationProperties properties, RestClient.Builder restClientBuilder) {
    this.properties = properties;
    this.restClient = restClientBuilder
        .requestFactory(new org.springframework.http.client.SimpleClientHttpRequestFactory() {{
          int timeoutMs = (int) Duration.ofSeconds(8).toMillis();
          setConnectTimeout(timeoutMs);
          setReadTimeout(timeoutMs);
        }})
        .build();
  }

  public boolean isEnabled() {
    return properties.getTelegram().isEnabled()
        && properties.getTelegram().getBotToken() != null
        && !properties.getTelegram().getBotToken().isBlank();
  }

  public void send(String chatId, String text) {
    if (!isEnabled()) throw new IllegalStateException("Telegram notifications are disabled.");
    if (chatId == null || chatId.isBlank()) throw new IllegalArgumentException("Telegram chat ID is missing.");

    URI uri = UriComponentsBuilder
        .fromHttpUrl(properties.getTelegram().getBaseUrl())
        .path("/bot{token}/sendMessage")
        .build(properties.getTelegram().getBotToken().trim());

    restClient.post()
        .uri(uri)
        .header(HttpHeaders.ACCEPT, "application/json")
        .body(Map.of(
            "chat_id", chatId.trim(),
            "text", text))
        .retrieve()
        .toBodilessEntity();
  }
}
