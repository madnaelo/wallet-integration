package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.common.SafeErrorDetails;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
import com.wallet.swap.ops.OperationalMetricsService;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class CoinGeckoPriceClient {
  private static final Logger log = LoggerFactory.getLogger(CoinGeckoPriceClient.class);
  private static final long MAX_RETRY_DELAY_MS = 30_000;
  private static final Map<Long, String> PLATFORM_BY_CHAIN = Map.of(
      1L, "ethereum",
      11155111L, "ethereum",
      137L, "polygon-pos",
      8453L, "base",
      42161L, "arbitrum-one",
      10L, "optimistic-ethereum",
      56L, "binance-smart-chain",
      43114L, "avalanche");

  private final NotificationProperties properties;
  private final RestClient restClient;
  private final OperationalMetricsService metricsService;

  public CoinGeckoPriceClient(
      NotificationProperties properties,
      RestClient.Builder restClientBuilder,
      OperationalMetricsService metricsService) {
    this.properties = properties;
    this.metricsService = metricsService;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getPrice().getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    RestClient.Builder builder = restClientBuilder
        .baseUrl(properties.getPrice().getCoingeckoBaseUrl())
        .requestInterceptor((request, body, execution) -> {
          request.getHeaders().set(HttpHeaders.ACCEPT, "application/json");
          String apiKey = properties.getPrice().getCoingeckoApiKey();
          if (apiKey != null && !apiKey.isBlank()) {
            String apiKeyHeader = properties.getPrice().getCoingeckoApiKeyHeader();
            request.getHeaders().set(
                apiKeyHeader == null || apiKeyHeader.isBlank() ? "x-cg-demo-api-key" : apiKeyHeader.trim(),
                apiKey.trim());
          }
          return execution.execute(request, body);
        })
        .requestFactory(requestFactory);
    this.restClient = builder.build();
  }

  public Map<TokenRef, BigDecimal> fetchUsdPrices(Set<TokenRef> tokens) {
    if (tokens == null || tokens.isEmpty()) return Map.of();

    FetchDiagnostics diagnostics = new FetchDiagnostics();
    try {
      Map<TokenKey, List<TokenRef>> tokensByKey = new LinkedHashMap<>();
      for (TokenRef token : tokens) {
        tokensByKey.computeIfAbsent(TokenKey.from(token), key -> new ArrayList<>()).add(token);
      }

      Map<TokenKey, BigDecimal> pricesByKey = new HashMap<>();
      fetchNativePrices(tokensByKey.keySet(), diagnostics).forEach(pricesByKey::put);
      fetchContractPrices(tokensByKey.keySet(), diagnostics).forEach(pricesByKey::put);

      if (pricesByKey.isEmpty() && diagnostics.failed > 0) {
        throw new PriceDataUnavailableException("Price data was unavailable for this monitoring cycle.",
            diagnostics.lastFailure);
      }
      if (diagnostics.failed > 0) {
        log.warn(
            "CoinGecko returned partial price data; {} of {} request batches failed.",
            diagnostics.failed,
            diagnostics.attempted);
      }

      Map<TokenRef, BigDecimal> prices = new HashMap<>();
      for (Map.Entry<TokenKey, List<TokenRef>> entry : tokensByKey.entrySet()) {
        BigDecimal price = pricesByKey.get(entry.getKey());
        if (price == null || price.signum() <= 0) continue;
        for (TokenRef token : entry.getValue()) {
          prices.put(token, price);
        }
      }
      return prices;
    } finally {
      metricsService.recordPriceFetchBatches(
          diagnostics.attempted,
          diagnostics.failed,
          diagnostics.lastFailure);
    }
  }

  private Map<TokenKey, BigDecimal> fetchNativePrices(
      Set<TokenKey> tokenKeys,
      FetchDiagnostics diagnostics) {
    Map<String, List<TokenKey>> coinIds = new LinkedHashMap<>();
    for (TokenKey key : tokenKeys) {
      nativeCoinId(key).ifPresent(coinId -> coinIds.computeIfAbsent(coinId, ignored -> new ArrayList<>()).add(key));
    }
    if (coinIds.isEmpty()) return Map.of();

    URI uri = baseUriBuilder()
        .path("/simple/price")
        .queryParam("ids", String.join(",", coinIds.keySet()))
        .queryParam("vs_currencies", "usd")
        .build()
        .toUri();

    Map<TokenKey, BigDecimal> prices = new HashMap<>();
    Optional<JsonNode> body = fetchBatch(
        "native-token prices",
        () -> restClient.get().uri(uri).retrieve().body(JsonNode.class),
        diagnostics);
    if (body.isEmpty()) return prices;

    for (Map.Entry<String, List<TokenKey>> entry : coinIds.entrySet()) {
      BigDecimal price = decimalAt(body.get().path(entry.getKey()).path("usd"));
      if (price == null) continue;
      for (TokenKey key : entry.getValue()) {
        prices.put(key, price);
      }
    }
    return prices;
  }

  private Map<TokenKey, BigDecimal> fetchContractPrices(
      Set<TokenKey> tokenKeys,
      FetchDiagnostics diagnostics) {
    Map<String, List<TokenKey>> byPlatform = new LinkedHashMap<>();
    for (TokenKey key : tokenKeys) {
      if (nativeCoinId(key).isPresent()) continue;
      String platform = PLATFORM_BY_CHAIN.get(key.chainId());
      if (platform == null || !isEvmContractAddress(key.address())) continue;
      byPlatform.computeIfAbsent(platform, ignored -> new ArrayList<>()).add(key);
    }

    Map<TokenKey, BigDecimal> prices = new HashMap<>();
    int batchSize = Math.max(1, Math.min(properties.getPrice().getContractBatchSize(), 515));
    for (Map.Entry<String, List<TokenKey>> entry : byPlatform.entrySet()) {
      List<TokenKey> uniqueKeys = dedupe(entry.getValue());
      for (int start = 0; start < uniqueKeys.size(); start += batchSize) {
        List<TokenKey> batch = uniqueKeys.subList(start, Math.min(uniqueKeys.size(), start + batchSize));
        fetchContractPriceBatch(entry.getKey(), batch, diagnostics).forEach(prices::put);
      }
    }
    return prices;
  }

  private Map<TokenKey, BigDecimal> fetchContractPriceBatch(
      String platform,
      List<TokenKey> batch,
      FetchDiagnostics diagnostics) {
    String addresses = String.join(",", batch.stream().map(TokenKey::address).toList());
    URI uri = baseUriBuilder()
        .path("/simple/token_price/{platform}")
        .queryParam("contract_addresses", addresses)
        .queryParam("vs_currencies", "usd")
        .build(platform);

    Map<TokenKey, BigDecimal> prices = new HashMap<>();
    Optional<JsonNode> body = fetchBatch(
        platform + " contract prices",
        () -> restClient.get().uri(uri).retrieve().body(JsonNode.class),
        diagnostics);
    if (body.isEmpty()) return prices;

    for (TokenKey key : batch) {
      BigDecimal price = decimalAt(body.get().path(key.address()).path("usd"));
      if (price == null) {
        price = decimalAt(body.get().path(key.address().toLowerCase(Locale.ROOT)).path("usd"));
      }
      if (price != null) prices.put(key, price);
    }
    return prices;
  }

  private Optional<JsonNode> fetchBatch(
      String batchName,
      Supplier<JsonNode> request,
      FetchDiagnostics diagnostics) {
    diagnostics.attempted++;
    int maxAttempts = Math.max(1, Math.min(properties.getPrice().getMaxAttempts(), 5));
    int attemptsMade = 0;
    RuntimeException lastFailure = null;
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsMade = attempt;
      try {
        JsonNode body = request.get();
        if (body == null) {
          throw new PriceDataUnavailableException("CoinGecko returned an empty response.", null);
        }
        return Optional.of(body);
      } catch (RuntimeException exception) {
        lastFailure = exception;
        if (attempt >= maxAttempts || !isTransient(exception)) break;
        try {
          waitBeforeRetry(exception, attempt);
        } catch (PriceDataUnavailableException interrupted) {
          diagnostics.failed++;
          diagnostics.lastFailure = interrupted;
          throw interrupted;
        }
      }
    }

    diagnostics.failed++;
    diagnostics.lastFailure = lastFailure;
    log.warn(
        "CoinGecko {} request failed after {} attempt(s): {}.",
        batchName,
        attemptsMade,
        SafeErrorDetails.summarize(lastFailure));
    return Optional.empty();
  }

  private boolean isTransient(RuntimeException exception) {
    if (exception instanceof ResourceAccessException) return true;
    if (exception instanceof RestClientResponseException responseException) {
      int status = responseException.getStatusCode().value();
      return status == 408 || status == 429 || status >= 500;
    }
    return false;
  }

  private void waitBeforeRetry(RuntimeException exception, int attempt) {
    long configuredDelay = Math.max(100, Math.min(properties.getPrice().getRetryDelayMs(), MAX_RETRY_DELAY_MS));
    long multiplier = 1L << Math.min(4, Math.max(0, attempt - 1));
    long delay = Math.min(MAX_RETRY_DELAY_MS, configuredDelay * multiplier);
    if (exception instanceof RestClientResponseException responseException) {
      HttpHeaders responseHeaders = responseException.getResponseHeaders();
      String retryAfter = responseHeaders == null ? null : responseHeaders.getFirst(HttpHeaders.RETRY_AFTER);
      if (retryAfter != null && retryAfter.matches("^[0-9]+$")) {
        try {
          long retryAfterSeconds = Long.parseLong(retryAfter);
          long retryAfterMs = retryAfterSeconds > MAX_RETRY_DELAY_MS / 1_000
              ? MAX_RETRY_DELAY_MS
              : retryAfterSeconds * 1_000;
          delay = Math.max(delay, retryAfterMs);
        } catch (NumberFormatException ignored) {
          // Fall back to the configured bounded delay.
        }
      }
    }
    try {
      Thread.sleep(delay);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new PriceDataUnavailableException("Price lookup retry was interrupted.", interrupted);
    }
  }

  private List<TokenKey> dedupe(List<TokenKey> keys) {
    Set<TokenKey> seen = new HashSet<>();
    return keys.stream().filter(seen::add).toList();
  }

  private Optional<String> nativeCoinId(TokenKey key) {
    if ("bitcoin".equals(key.address())) return Optional.of("bitcoin");
    if (!isNativeEvmAddress(key.address())) return Optional.empty();
    if (key.chainId() == 137L) return Optional.of("matic-network");
    if (key.chainId() == 56L) return Optional.of("binancecoin");
    if (key.chainId() == 43114L) return Optional.of("avalanche-2");
    return Optional.of("ethereum");
  }

  private boolean isNativeEvmAddress(String address) {
    return address.equals("eth")
        || address.equals("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
        || address.equals("0x0000000000000000000000000000000000000000");
  }

  private boolean isEvmContractAddress(String address) {
    return address.matches("^0x[a-f0-9]{40}$");
  }

  private BigDecimal decimalAt(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) return null;
    if (node.isNumber()) return node.decimalValue();
    if (node.isTextual() && !node.asText().isBlank()) {
      try {
        return new BigDecimal(node.asText());
      } catch (NumberFormatException ignored) {
        return null;
      }
    }
    return null;
  }

  private UriComponentsBuilder baseUriBuilder() {
    return UriComponentsBuilder.fromUriString(properties.getPrice().getCoingeckoBaseUrl());
  }

  private record TokenKey(long chainId, String address) {
    static TokenKey from(TokenRef token) {
      return new TokenKey(token.chainId(), normalizeAddress(token.address()));
    }

    static String normalizeAddress(String value) {
      return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
  }

  private static final class FetchDiagnostics {
    private int attempted;
    private int failed;
    private RuntimeException lastFailure;
  }

  private static final class PriceDataUnavailableException extends RuntimeException {
    private PriceDataUnavailableException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
