package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class LimitOrderSubmissionClient {
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
      return LimitOrderSubmissionResult.skipped("Limit order submission is disabled.");
    }
    if (LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER.equals(executionProvider)) {
      return submitCow(chainId, signature, data);
    }
    if (LimitOrderCapabilityService.ONEINCH_PROVIDER.equals(executionProvider)) {
      return submitOneInch(chainId, orderHash, signature, data);
    }
    return LimitOrderSubmissionResult.failure("Limit order provider is not supported.");
  }

  private LimitOrderSubmissionResult submitOneInch(long chainId, String orderHash, String signature, JsonNode data) {
    if (properties.getOneinchApiKey() == null || properties.getOneinchApiKey().isBlank()) {
      return LimitOrderSubmissionResult.skipped("1inch Orderbook API key is not configured.");
    }

    URI uri = UriComponentsBuilder
        .fromUriString(properties.getOneinchOrderbookBaseUrl())
        .path("/{chainId}/")
        .build(chainId);

    try {
      restClient.post()
          .uri(uri)
          .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOneinchApiKey().trim())
          .header(HttpHeaders.ACCEPT, "application/json")
          .body(Map.of(
              "orderHash", orderHash,
              "signature", signature,
              "data", data))
          .retrieve()
          .toBodilessEntity();
      return LimitOrderSubmissionResult.success();
    } catch (RestClientResponseException exception) {
      return LimitOrderSubmissionResult.failure(cleanProviderError("1inch Orderbook", exception));
    } catch (RuntimeException exception) {
      return LimitOrderSubmissionResult.failure("Limit order could not be submitted right now.");
    }
  }

  private LimitOrderSubmissionResult submitCow(long chainId, String signature, JsonNode data) {
    String network = cowNetworkPath(chainId);
    if (network == null) {
      return LimitOrderSubmissionResult.skipped("CoW Protocol is not available on this network.");
    }

    String apiKey = properties.getCowApiKey() == null ? "" : properties.getCowApiKey().trim();
    String baseUrl = apiKey.isBlank()
        ? properties.getCowOrderbookBaseUrl()
        : properties.getCowPartnerOrderbookBaseUrl();
    URI uri = UriComponentsBuilder
        .fromUriString(baseUrl)
        .path("/{network}/api/v1/orders")
        .build(network);

    try {
      Map<String, Object> body = new LinkedHashMap<>(
          objectMapper.convertValue(data, new TypeReference<Map<String, Object>>() {}));
      body.put("signature", signature);
      body.put("signingScheme", "eip712");

      RestClient.RequestBodySpec request = restClient.post()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) {
        request = request.header("X-API-Key", apiKey);
      }
      String uid = request
          .body(body)
          .retrieve()
          .body(String.class);
      return LimitOrderSubmissionResult.success(uid == null ? "" : uid.replace("\"", "").trim());
    } catch (RestClientResponseException exception) {
      return LimitOrderSubmissionResult.failure(cleanProviderError("CoW Protocol", exception));
    } catch (RuntimeException exception) {
      return LimitOrderSubmissionResult.failure("Limit order could not be submitted right now.");
    }
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

  private String cleanProviderError(String providerName, RestClientResponseException exception) {
    String body = exception.getResponseBodyAsString();
    if (body == null || body.isBlank()) {
      return providerName + " rejected the signed order. Status " + exception.getStatusCode().value() + ".";
    }
    String compact = body.replaceAll("\\s+", " ").trim();
    if (compact.length() > 500) compact = compact.substring(0, 500);
    return providerName + " rejected the signed order: " + compact;
  }

  public record LimitOrderSubmissionResult(boolean submitted, boolean skipped, String message, String providerOrderId) {
    static LimitOrderSubmissionResult success() {
      return success("");
    }

    static LimitOrderSubmissionResult success(String providerOrderId) {
      return new LimitOrderSubmissionResult(true, false, "", providerOrderId);
    }

    static LimitOrderSubmissionResult skipped(String message) {
      return new LimitOrderSubmissionResult(false, true, message, null);
    }

    static LimitOrderSubmissionResult failure(String message) {
      return new LimitOrderSubmissionResult(false, false, message, null);
    }
  }
}
