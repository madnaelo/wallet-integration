package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

class CoinGeckoPriceClientTest {
  @Test
  void fetchesNativePricesWithAbsoluteBaseUrl() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicReference<String> requestUri = new AtomicReference<>("");
    AtomicReference<String> apiKeyHeader = new AtomicReference<>("");
    server.createContext("/api/v3/simple/price", exchange -> {
      requestUri.set(exchange.getRequestURI().toString());
      apiKeyHeader.set(exchange.getRequestHeaders().getFirst("x-cg-demo-api-key"));
      byte[] body = "{\"ethereum\":{\"usd\":2095.50}}".getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");
    properties.getPrice().setCoingeckoApiKey("test-key");

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(properties, RestClient.builder());
      TokenRef eth = new TokenRef(1L, "ETH", "ETH", 18);

      Map<TokenRef, BigDecimal> prices = client.fetchUsdPrices(Set.of(eth));

      assertThat(prices).containsKey(eth);
      assertThat(prices.get(eth)).isEqualByComparingTo(new BigDecimal("2095.50"));
      assertThat(requestUri.get()).isEqualTo("/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
      assertThat(apiKeyHeader.get()).isEqualTo("test-key");
    } finally {
      server.stop(0);
    }
  }
}
