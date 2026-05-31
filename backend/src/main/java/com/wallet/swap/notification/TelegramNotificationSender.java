package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.NotificationProperties;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class TelegramNotificationSender {
  private final NotificationProperties properties;
  private final RestClient restClient;

  public TelegramNotificationSender(NotificationProperties properties, RestClient.Builder restClientBuilder) {
    this.properties = properties;
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(Duration.ofSeconds(8));
    requestFactory.setReadTimeout(Duration.ofSeconds(8));
    this.restClient = restClientBuilder
        .requestFactory(requestFactory)
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
        .fromUriString(properties.getTelegram().getBaseUrl())
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

  public Optional<String> getBotUsername() {
    String configured = properties.getTelegram().getBotUsername();
    if (configured != null && !configured.isBlank()) {
      return Optional.of(normalizeBotUsername(configured));
    }
    if (!isEnabled()) return Optional.empty();

    URI uri = UriComponentsBuilder
        .fromUriString(properties.getTelegram().getBaseUrl())
        .path("/bot{token}/getMe")
        .build(properties.getTelegram().getBotToken().trim());

    JsonNode body = restClient.get()
        .uri(uri)
        .header(HttpHeaders.ACCEPT, "application/json")
        .retrieve()
        .body(JsonNode.class);
    String username = body == null ? "" : body.path("result").path("username").asText("");
    return username.isBlank() ? Optional.empty() : Optional.of(normalizeBotUsername(username));
  }

  public List<TelegramIncomingMessage> getRecentMessages() {
    if (!isEnabled()) throw new IllegalStateException("Telegram notifications are disabled.");

    URI uri = UriComponentsBuilder
        .fromUriString(properties.getTelegram().getBaseUrl())
        .path("/bot{token}/getUpdates")
        .queryParam("timeout", 0)
        .queryParam("limit", 100)
        .build(properties.getTelegram().getBotToken().trim());

    JsonNode body = restClient.get()
        .uri(uri)
        .header(HttpHeaders.ACCEPT, "application/json")
        .retrieve()
        .body(JsonNode.class);
    if (body == null || !body.path("ok").asBoolean(false) || !body.path("result").isArray()) {
      return List.of();
    }

    List<TelegramIncomingMessage> messages = new ArrayList<>();
    for (JsonNode update : body.path("result")) {
      JsonNode message = update.path("message");
      if (message.isMissingNode()) continue;
      String text = message.path("text").asText("");
      String chatId = message.path("chat").path("id").asText("");
      if (text.isBlank() || chatId.isBlank()) continue;
      messages.add(new TelegramIncomingMessage(chatId, text));
    }
    return messages;
  }

  private String normalizeBotUsername(String username) {
    return username.trim().replaceFirst("^@", "");
  }

  public record TelegramIncomingMessage(String chatId, String text) {}
}
