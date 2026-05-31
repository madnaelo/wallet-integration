package com.wallet.swap.limitorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.LimitOrderProperties;
import java.net.URI;
import java.time.Duration;
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

  public LimitOrderSubmissionClient(LimitOrderProperties properties, RestClient.Builder restClientBuilder) {
    this.properties = properties;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    this.restClient = restClientBuilder
        .requestFactory(requestFactory)
        .build();
  }

  public LimitOrderSubmissionResult submit(long chainId, String orderHash, String signature, JsonNode data) {
    if (!properties.isOrderbookSubmissionEnabled()) {
      return LimitOrderSubmissionResult.skipped("Limit order submission is disabled.");
    }
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
      return LimitOrderSubmissionResult.failure(cleanProviderError(exception));
    } catch (RuntimeException exception) {
      return LimitOrderSubmissionResult.failure("Limit order could not be submitted right now.");
    }
  }

  private String cleanProviderError(RestClientResponseException exception) {
    String body = exception.getResponseBodyAsString();
    if (body == null || body.isBlank()) {
      return "1inch Orderbook rejected the signed order. Status " + exception.getStatusCode().value() + ".";
    }
    String compact = body.replaceAll("\\s+", " ").trim();
    if (compact.length() > 500) compact = compact.substring(0, 500);
    return "1inch Orderbook rejected the signed order: " + compact;
  }

  public record LimitOrderSubmissionResult(boolean submitted, boolean skipped, String message) {
    static LimitOrderSubmissionResult success() {
      return new LimitOrderSubmissionResult(true, false, "");
    }

    static LimitOrderSubmissionResult skipped(String message) {
      return new LimitOrderSubmissionResult(false, true, message);
    }

    static LimitOrderSubmissionResult failure(String message) {
      return new LimitOrderSubmissionResult(false, false, message);
    }
  }
}
