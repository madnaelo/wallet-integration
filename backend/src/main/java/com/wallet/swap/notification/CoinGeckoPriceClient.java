package com.wallet.swap.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.ReverseProfitModels.TokenRef;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class CoinGeckoPriceClient {
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

  public CoinGeckoPriceClient(NotificationProperties properties, RestClient.Builder restClientBuilder) {
    this.properties = properties;
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

    Map<TokenKey, List<TokenRef>> tokensByKey = new LinkedHashMap<>();
    for (TokenRef token : tokens) {
      tokensByKey.computeIfAbsent(TokenKey.from(token), key -> new ArrayList<>()).add(token);
    }

    Map<TokenKey, BigDecimal> pricesByKey = new HashMap<>();
    fetchNativePrices(tokensByKey.keySet()).forEach(pricesByKey::put);
    fetchContractPrices(tokensByKey.keySet()).forEach(pricesByKey::put);

    Map<TokenRef, BigDecimal> prices = new HashMap<>();
    for (Map.Entry<TokenKey, List<TokenRef>> entry : tokensByKey.entrySet()) {
      BigDecimal price = pricesByKey.get(entry.getKey());
      if (price == null || price.signum() <= 0) continue;
      for (TokenRef token : entry.getValue()) {
        prices.put(token, price);
      }
    }
    return prices;
  }

  private Map<TokenKey, BigDecimal> fetchNativePrices(Set<TokenKey> tokenKeys) {
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

    JsonNode body = restClient.get().uri(uri).retrieve().body(JsonNode.class);
    Map<TokenKey, BigDecimal> prices = new HashMap<>();
    if (body == null) return prices;

    for (Map.Entry<String, List<TokenKey>> entry : coinIds.entrySet()) {
      BigDecimal price = decimalAt(body.path(entry.getKey()).path("usd"));
      if (price == null) continue;
      for (TokenKey key : entry.getValue()) {
        prices.put(key, price);
      }
    }
    return prices;
  }

  private Map<TokenKey, BigDecimal> fetchContractPrices(Set<TokenKey> tokenKeys) {
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
        fetchContractPriceBatch(entry.getKey(), batch).forEach(prices::put);
      }
    }
    return prices;
  }

  private Map<TokenKey, BigDecimal> fetchContractPriceBatch(String platform, List<TokenKey> batch) {
    String addresses = String.join(",", batch.stream().map(TokenKey::address).toList());
    URI uri = baseUriBuilder()
        .path("/simple/token_price/{platform}")
        .queryParam("contract_addresses", addresses)
        .queryParam("vs_currencies", "usd")
        .build(platform);

    JsonNode body = restClient.get().uri(uri).retrieve().body(JsonNode.class);
    Map<TokenKey, BigDecimal> prices = new HashMap<>();
    if (body == null) return prices;

    for (TokenKey key : batch) {
      BigDecimal price = decimalAt(body.path(key.address()).path("usd"));
      if (price == null) price = decimalAt(body.path(key.address().toLowerCase(Locale.ROOT)).path("usd"));
      if (price != null) prices.put(key, price);
    }
    return prices;
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
}
