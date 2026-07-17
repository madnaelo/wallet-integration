package com.wallet.swap.limitorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.LimitOrderProperties;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class LimitOrderCancellationClient {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderCancellationClient.class);

  private final LimitOrderProperties properties;
  private final RestClient restClient;

  public LimitOrderCancellationClient(
      LimitOrderProperties properties,
      RestClient.Builder restClientBuilder) {
    this.properties = properties;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    this.restClient = restClientBuilder.requestFactory(requestFactory).build();
  }

  public CancellationResult cancelCow(long chainId, String orderUid, String signature) {
    String network = LimitOrderProviderSupport.cowNetworkPath(chainId);
    if (network == null) {
      return CancellationResult.failure("This network is not available for limit order cancellation.", false);
    }
    if (orderUid == null || !orderUid.matches("(?i)^0x[0-9a-f]{112}$")
        || signature == null || !signature.matches("(?i)^0x[0-9a-f]{130}$")) {
      return CancellationResult.failure("The signed cancellation request is invalid.", false);
    }

    String apiKey = properties.getCowApiKey() == null ? "" : properties.getCowApiKey().trim();
    String baseUrl = apiKey.isBlank()
        ? properties.getCowOrderbookBaseUrl()
        : properties.getCowPartnerOrderbookBaseUrl();
    URI uri = UriComponentsBuilder
        .fromUriString(baseUrl)
        .path("/{network}/api/v1/orders/{uid}")
        .build(network, orderUid);

    try {
      RestClient.RequestBodySpec request = restClient.method(HttpMethod.DELETE)
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      request.body(Map.of("signature", signature, "signingScheme", "eip712"))
          .retrieve()
          .toBodilessEntity();
      return CancellationResult.success();
    } catch (RestClientResponseException exception) {
      String status = cowOrderStatus(baseUrl, network, apiKey, orderUid);
      if ("cancelled".equals(status)) return CancellationResult.success();
      if ("fulfilled".equals(status) || "expired".equals(status)) {
        return CancellationResult.failure(
            "This order has already completed or expired and cannot be cancelled.",
            false);
      }
      return providerFailure(exception);
    } catch (RuntimeException exception) {
      log.warn("CoW Protocol cancellation failed before receiving a response.", exception);
      return CancellationResult.failure(
          "The order service is temporarily unavailable. Refresh the order before trying again.",
          true);
    }
  }

  private String cowOrderStatus(String baseUrl, String network, String apiKey, String orderUid) {
    try {
      URI uri = UriComponentsBuilder
          .fromUriString(baseUrl)
          .path("/{network}/api/v1/orders/{uid}")
          .build(network, orderUid);
      RestClient.RequestHeadersSpec<?> request = restClient.get()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      JsonNode response = request.retrieve().body(JsonNode.class);
      return response == null ? "" : response.path("status").asText("");
    } catch (RuntimeException exception) {
      return "";
    }
  }

  private CancellationResult providerFailure(RestClientResponseException exception) {
    HttpStatusCode statusCode = exception.getStatusCode();
    int status = statusCode.value();
    log.warn(
        "CoW Protocol rejected a cancellation with HTTP {}: {}",
        status,
        compactForLog(exception.getResponseBodyAsString()));
    boolean retryable = status == 408 || status == 425 || status == 429 || status >= 500;
    if (retryable) {
      return CancellationResult.failure(
          "The order service is temporarily unavailable. Refresh the order before trying again.",
          true);
    }
    return CancellationResult.failure(
        "The order service could not accept this cancellation. Refresh the order to see its latest status.",
        false);
  }

  private String compactForLog(String value) {
    if (value == null || value.isBlank()) return "no response body";
    String compact = value.replaceAll("\\s+", " ").trim();
    return compact.length() <= 500 ? compact : compact.substring(0, 500);
  }

  public record CancellationResult(boolean accepted, boolean retryable, String message) {
    static CancellationResult success() {
      return new CancellationResult(true, false, "");
    }

    static CancellationResult failure(String message, boolean retryable) {
      return new CancellationResult(false, retryable, message);
    }
  }
}
