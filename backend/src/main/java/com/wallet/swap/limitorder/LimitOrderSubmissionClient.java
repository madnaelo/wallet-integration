package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class LimitOrderSubmissionClient {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderSubmissionClient.class);
  private static final String COW_EMPTY_APP_DATA_HASH =
      "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d";

  private final LimitOrderProperties properties;
  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public LimitOrderSubmissionClient(
      LimitOrderProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    this.restClient = restClientBuilder
        .requestFactory(requestFactory)
        .build();
  }

  public LimitOrderSubmissionResult submit(
      long chainId,
      String executionProvider,
      String orderHash,
      String signature,
      JsonNode data) {
    if (!properties.isOrderbookSubmissionEnabled()) {
      return LimitOrderSubmissionResult.skipped("Automatic submission is temporarily unavailable.");
    }
    if (LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER.equals(executionProvider)) {
      return submitCow(chainId, orderHash, signature, data);
    }
    if (LimitOrderCapabilityService.ONEINCH_PROVIDER.equals(executionProvider)) {
      return submitOneInch(chainId, orderHash, signature, data);
    }
    return LimitOrderSubmissionResult.failure("This limit order provider is not supported.", false);
  }

  private LimitOrderSubmissionResult submitOneInch(long chainId, String orderHash, String signature, JsonNode data) {
    if (properties.getOneinchApiKey() == null || properties.getOneinchApiKey().isBlank()) {
      return LimitOrderSubmissionResult.skipped("Automatic submission is temporarily unavailable.");
    }

    URI uri = UriComponentsBuilder
        .fromUriString(properties.getOneinchOrderbookBaseUrl())
        .path("/{chainId}/")
        .build(chainId);

    try {
      JsonNode response = restClient.post()
          .uri(uri)
          .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOneinchApiKey().trim())
          .header(HttpHeaders.ACCEPT, "application/json")
          .body(Map.of(
              "orderHash", orderHash,
              "signature", signature,
              "data", data))
          .retrieve()
          .body(JsonNode.class);
      if (response != null && response.has("success") && !response.path("success").asBoolean()) {
        return LimitOrderSubmissionResult.failure(
            "The order service could not accept these signed terms.",
            false);
      }
      return LimitOrderSubmissionResult.success(orderHash.toLowerCase(Locale.ROOT));
    } catch (RestClientResponseException exception) {
      if (couldBeDuplicate(exception.getStatusCode()) && oneInchOrderExists(chainId, orderHash)) {
        return LimitOrderSubmissionResult.success(orderHash.toLowerCase(Locale.ROOT));
      }
      return providerFailure("1inch Orderbook", exception);
    } catch (RuntimeException exception) {
      log.warn("1inch order submission failed before receiving a response.", exception);
      return LimitOrderSubmissionResult.failure(
          "The order service is temporarily unavailable. Your signed order will retry automatically.",
          true);
    }
  }

  private LimitOrderSubmissionResult submitCow(long chainId, String orderHash, String signature, JsonNode data) {
    String network = cowNetworkPath(chainId);
    if (network == null) {
      return LimitOrderSubmissionResult.failure("This network is not available for limit orders.", false);
    }

    String apiKey = properties.getCowApiKey() == null ? "" : properties.getCowApiKey().trim();
    String baseUrl = apiKey.isBlank()
        ? properties.getCowOrderbookBaseUrl()
        : properties.getCowPartnerOrderbookBaseUrl();
    URI uri = UriComponentsBuilder
        .fromUriString(baseUrl)
        .path("/{network}/api/v1/orders")
        .build(network);
    String expectedUid = cowOrderUid(orderHash, data);

    try {
      Map<String, Object> body = new LinkedHashMap<>(
          objectMapper.convertValue(data, new TypeReference<Map<String, Object>>() {}));
      if (COW_EMPTY_APP_DATA_HASH.equalsIgnoreCase(data.path("appData").asText(""))) {
        body.put("appData", "{}");
        body.put("appDataHash", COW_EMPTY_APP_DATA_HASH);
      }
      body.put("signature", signature);
      body.put("signingScheme", "eip712");

      RestClient.RequestBodySpec request = restClient.post()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      String uid = request.body(body).retrieve().body(String.class);
      String providerOrderId = cleanUid(uid);
      if (providerOrderId == null) {
        return LimitOrderSubmissionResult.failure(
            "The order service returned an invalid confirmation. Your signed order will retry automatically.",
            true);
      }
      return LimitOrderSubmissionResult.success(providerOrderId);
    } catch (RestClientResponseException exception) {
      if (expectedUid != null
          && couldBeDuplicate(exception.getStatusCode())
          && cowOrderExists(baseUrl, network, apiKey, expectedUid)) {
        return LimitOrderSubmissionResult.success(expectedUid);
      }
      return providerFailure("CoW Protocol", exception);
    } catch (RuntimeException exception) {
      log.warn("CoW Protocol order submission failed before receiving a response.", exception);
      return LimitOrderSubmissionResult.failure(
          "The order service is temporarily unavailable. Your signed order will retry automatically.",
          true);
    }
  }

  private boolean oneInchOrderExists(long chainId, String orderHash) {
    try {
      URI uri = UriComponentsBuilder
          .fromUriString(properties.getOneinchOrderbookBaseUrl())
          .path("/{chainId}/order/{orderHash}")
          .build(chainId, orderHash);
      JsonNode response = restClient.get()
          .uri(uri)
          .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOneinchApiKey().trim())
          .header(HttpHeaders.ACCEPT, "application/json")
          .retrieve()
          .body(JsonNode.class);
      return response != null && orderHash.equalsIgnoreCase(response.path("orderHash").asText(""));
    } catch (RuntimeException exception) {
      return false;
    }
  }

  private boolean cowOrderExists(String baseUrl, String network, String apiKey, String uid) {
    try {
      URI uri = UriComponentsBuilder
          .fromUriString(baseUrl)
          .path("/{network}/api/v1/orders/{uid}")
          .build(network, uid);
      RestClient.RequestHeadersSpec<?> request = restClient.get()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      JsonNode response = request.retrieve().body(JsonNode.class);
      return response != null;
    } catch (RuntimeException exception) {
      return false;
    }
  }

  private String cowOrderUid(String orderHash, JsonNode data) {
    String owner = data.path("from").asText("");
    long validTo = data.path("validTo").asLong(-1);
    if (!orderHash.matches("(?i)^0x[0-9a-f]{64}$")
        || !owner.matches("(?i)^0x[0-9a-f]{40}$")
        || validTo < 0
        || validTo > 0xffff_ffffL) {
      return null;
    }
    return (orderHash + owner.substring(2) + String.format("%08x", validTo)).toLowerCase(Locale.ROOT);
  }

  private String cleanUid(String value) {
    if (value == null) return null;
    String uid = value.replace("\"", "").trim().toLowerCase(Locale.ROOT);
    return uid.matches("^0x[0-9a-f]{112}$") ? uid : null;
  }

  private boolean couldBeDuplicate(HttpStatusCode status) {
    return status.value() == 400 || status.value() == 409;
  }

  private LimitOrderSubmissionResult providerFailure(String providerName, RestClientResponseException exception) {
    int status = exception.getStatusCode().value();
    String providerBody = exception.getResponseBodyAsString();
    log.warn(
        "{} rejected a limit order with HTTP {}: {}",
        providerName,
        status,
        compactForLog(providerBody));
    boolean retryable = status == 404 || status == 408 || status == 425 || status == 429 || status >= 500;
    if (status == 429) {
      return LimitOrderSubmissionResult.failure(
          "The order service is busy. Your signed order will retry automatically.",
          true);
    }
    if (retryable) {
      return LimitOrderSubmissionResult.failure(
          "The order service is temporarily unavailable. Your signed order will retry automatically.",
          true);
    }
    return LimitOrderSubmissionResult.failure(
        "The order service could not accept these signed terms.",
        false);
  }

  private String compactForLog(String value) {
    if (value == null || value.isBlank()) return "no response body";
    String compact = value.replaceAll("\\s+", " ").trim();
    return compact.length() <= 500 ? compact : compact.substring(0, 500);
  }

  private String cowNetworkPath(long chainId) {
    return switch ((int) chainId) {
      case 1 -> "mainnet";
      case 56 -> "bnb";
      case 100 -> "xdai";
      case 137 -> "polygon";
      case 8453 -> "base";
      case 9745 -> "plasma";
      case 42161 -> "arbitrum_one";
      case 43114 -> "avalanche";
      case 57073 -> "ink";
      case 59144 -> "linea";
      default -> null;
    };
  }

  public record LimitOrderSubmissionResult(
      boolean submitted,
      boolean skipped,
      boolean retryable,
      String message,
      String providerOrderId) {
    static LimitOrderSubmissionResult success(String providerOrderId) {
      return new LimitOrderSubmissionResult(true, false, false, "", providerOrderId);
    }

    static LimitOrderSubmissionResult skipped(String message) {
      return new LimitOrderSubmissionResult(false, true, true, message, null);
    }

    static LimitOrderSubmissionResult failure(String message, boolean retryable) {
      return new LimitOrderSubmissionResult(false, false, retryable, message, null);
    }
  }
}
