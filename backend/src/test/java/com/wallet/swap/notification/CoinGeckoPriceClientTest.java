package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import com.wallet.swap.ops.OperationalMetricsService;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
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
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(
          properties,
          RestClient.builder(),
          new OperationalMetricsService());
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

  @Test
  void fetchesNativePricesForBnbAndAvalanche() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicReference<String> requestUri = new AtomicReference<>("");
    server.createContext("/api/v3/simple/price", exchange -> {
      requestUri.set(exchange.getRequestURI().toString());
      byte[] body = """
          {
            "binancecoin":{"usd":602.75},
            "avalanche-2":{"usd":32.40}
          }
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(
          properties,
          RestClient.builder(),
          new OperationalMetricsService());
      TokenRef bnb = new TokenRef(56L, "ETH", "BNB", 18);
      TokenRef avax = new TokenRef(43114L, "ETH", "AVAX", 18);

      Map<TokenRef, BigDecimal> prices = client.fetchUsdPrices(Set.of(bnb, avax));

      assertThat(prices.get(bnb)).isEqualByComparingTo(new BigDecimal("602.75"));
      assertThat(prices.get(avax)).isEqualByComparingTo(new BigDecimal("32.40"));
      assertThat(requestUri.get()).contains("binancecoin");
      assertThat(requestUri.get()).contains("avalanche-2");
    } finally {
      server.stop(0);
    }
  }

  @Test
  void fetchesContractPricesForArbitrum() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicReference<String> requestUri = new AtomicReference<>("");
    server.createContext("/api/v3/simple/token_price/arbitrum-one", exchange -> {
      requestUri.set(exchange.getRequestURI().toString());
      byte[] body = """
          {
            "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9":{"usd":1.00}
          }
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(
          properties,
          RestClient.builder(),
          new OperationalMetricsService());
      TokenRef usdt = new TokenRef(42161L, "0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9", "USDT", 6);

      Map<TokenRef, BigDecimal> prices = client.fetchUsdPrices(Set.of(usdt));

      assertThat(prices.get(usdt)).isEqualByComparingTo(new BigDecimal("1.00"));
      assertThat(requestUri.get()).contains("contract_addresses=0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9");
    } finally {
      server.stop(0);
    }
  }

  @Test
  void retriesTransientServerErrors() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicInteger requestCount = new AtomicInteger();
    server.createContext("/api/v3/simple/price", exchange -> {
      int attempt = requestCount.incrementAndGet();
      byte[] body = (attempt == 1
          ? """
              {"error":"temporarily unavailable"}
              """
          : """
              {"ethereum":{"usd":2095.50}}
              """).getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(attempt == 1 ? 503 : 200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");
    properties.getPrice().setMaxAttempts(2);
    properties.getPrice().setRetryDelayMs(100);
    OperationalMetricsService metrics = new OperationalMetricsService();

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(properties, RestClient.builder(), metrics);
      TokenRef eth = new TokenRef(1L, "ETH", "ETH", 18);

      Map<TokenRef, BigDecimal> prices = client.fetchUsdPrices(Set.of(eth));

      assertThat(prices.get(eth)).isEqualByComparingTo(new BigDecimal("2095.50"));
      assertThat(requestCount).hasValue(2);
      assertThat(metrics.snapshot().priceFetchBatchesAttempted()).isEqualTo(1);
      assertThat(metrics.snapshot().priceFetchBatchesFailed()).isZero();
      assertThat(metrics.snapshot().lastPriceFetchError()).isBlank();
    } finally {
      server.stop(0);
    }
  }

  @Test
  void keepsSuccessfulContractBatchesWhenAnotherPlatformFails() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/v3/simple/token_price/arbitrum-one", exchange -> {
      byte[] body = """
          {"error":"temporarily unavailable"}
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(503, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.createContext("/api/v3/simple/token_price/base", exchange -> {
      byte[] body = """
          {
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":{"usd":1.00}
          }
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");
    properties.getPrice().setMaxAttempts(1);
    OperationalMetricsService metrics = new OperationalMetricsService();

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(properties, RestClient.builder(), metrics);
      TokenRef arbitrumUsdt = new TokenRef(
          42161L,
          "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
          "USDT",
          6);
      TokenRef baseUsdc = new TokenRef(
          8453L,
          "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          "USDC",
          6);

      Map<TokenRef, BigDecimal> prices = client.fetchUsdPrices(Set.of(arbitrumUsdt, baseUsdc));

      assertThat(prices).doesNotContainKey(arbitrumUsdt);
      assertThat(prices.get(baseUsdc)).isEqualByComparingTo(BigDecimal.ONE);
      assertThat(metrics.snapshot().priceFetchBatchesAttempted()).isEqualTo(2);
      assertThat(metrics.snapshot().priceFetchBatchesFailed()).isEqualTo(1);
      assertThat(metrics.snapshot().lastPriceFetchError()).isNotBlank();
    } finally {
      server.stop(0);
    }
  }

  @Test
  void failsTheCycleWhenEveryRequestedBatchFails() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/v3/simple/price", exchange -> {
      byte[] body = """
          {"error":"temporarily unavailable"}
          """.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
      exchange.sendResponseHeaders(503, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();

    NotificationProperties properties = new NotificationProperties();
    properties.getPrice().setCoingeckoBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/v3");
    properties.getPrice().setMaxAttempts(1);
    OperationalMetricsService metrics = new OperationalMetricsService();

    try {
      CoinGeckoPriceClient client = new CoinGeckoPriceClient(properties, RestClient.builder(), metrics);
      TokenRef eth = new TokenRef(1L, "ETH", "ETH", 18);

      assertThatThrownBy(() -> client.fetchUsdPrices(Set.of(eth)))
          .isInstanceOf(RuntimeException.class)
          .hasMessageContaining("Price data was unavailable");
      assertThat(metrics.snapshot().priceFetchBatchesAttempted()).isEqualTo(1);
      assertThat(metrics.snapshot().priceFetchBatchesFailed()).isEqualTo(1);
    } finally {
      server.stop(0);
    }
  }
}
