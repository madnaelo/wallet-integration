package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import com.wallet.swap.config.NotificationProperties;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

class TelegramNotificationSenderTest {
  @Test
  void readsRecentPrivateUserMessagesOnly() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicReference<String> requestUri = new AtomicReference<>("");
    server.createContext("/bottest-token/getUpdates", exchange -> {
      requestUri.set(exchange.getRequestURI().toString());
      byte[] body = """
          {
            "ok": true,
            "result": [
              {"message":{"text":"/start GROUP","chat":{"id":-1,"type":"group"},"from":{"is_bot":false}}},
              {"message":{"text":"/start BOT","chat":{"id":2,"type":"private"},"from":{"is_bot":true}}},
              {"message":{"text":"/start PRIVATE","chat":{"id":3,"type":"private"},"from":{"is_bot":false}}}
            ]
          }
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getTelegram().setEnabled(true);
    properties.getTelegram().setBotToken("test-token");
    properties.getTelegram().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());

    try {
      TelegramNotificationSender sender = new TelegramNotificationSender(properties, RestClient.builder());

      List<TelegramNotificationSender.TelegramIncomingMessage> messages = sender.getRecentMessages();

      assertThat(messages).containsExactly(
          new TelegramNotificationSender.TelegramIncomingMessage("3", "/start PRIVATE"));
      assertThat(requestUri.get()).contains("offset=-100").contains("limit=100");
    } finally {
      server.stop(0);
    }
  }
}
