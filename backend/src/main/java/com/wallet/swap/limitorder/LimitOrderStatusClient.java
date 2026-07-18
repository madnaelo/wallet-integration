package com.wallet.swap.limitorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderRepository.StatusCheckCandidate;
import java.math.BigInteger;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class LimitOrderStatusClient {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderStatusClient.class);

  private final LimitOrderProperties properties;
  private final RestClient restClient;

  public LimitOrderStatusClient(
      LimitOrderProperties properties,
      RestClient.Builder restClientBuilder) {
    this.properties = properties;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    this.restClient = restClientBuilder.requestFactory(requestFactory).build();
  }

  public StatusResult check(StatusCheckCandidate candidate) {
    if (LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER.equals(candidate.executionProvider())) {
      return checkCow(candidate);
    }
    if (LimitOrderCapabilityService.ONEINCH_PROVIDER.equals(candidate.executionProvider())) {
      return checkOneInch(candidate);
    }
    return StatusResult.failure("Unsupported limit order provider.");
  }

  private StatusResult checkOneInch(StatusCheckCandidate candidate) {
    if (!properties.isOneinchOrderbookEnabled()) {
      return StatusResult.failure("1inch order status is unavailable.");
    }
    String apiKey = properties.getOneinchApiKey() == null ? "" : properties.getOneinchApiKey().trim();
    if (apiKey.isBlank()) return StatusResult.failure("1inch order status credentials are unavailable.");

    URI uri = UriComponentsBuilder
        .fromUriString(properties.getOneinchOrderbookBaseUrl())
        .path("/{chainId}/order/{orderHash}")
        .build(candidate.chainId(), candidate.orderHash());
    try {
      JsonNode response = restClient.get()
          .uri(uri)
          .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
          .header(HttpHeaders.ACCEPT, "application/json")
          .retrieve()
          .body(JsonNode.class);
      return parseOneInch(response, candidate.expiresAt(), Instant.now());
    } catch (RestClientResponseException exception) {
      return providerFailure("1inch Orderbook", exception);
    } catch (RuntimeException exception) {
      log.warn("1inch order status check failed before receiving a response.", exception);
      return StatusResult.failure("1inch order status is temporarily unavailable.");
    }
  }

  private StatusResult checkCow(StatusCheckCandidate candidate) {
    String network = LimitOrderProviderSupport.cowNetworkPath(candidate.chainId());
    if (network == null) return StatusResult.failure("Unsupported CoW Protocol network.");
    String uid = candidate.providerOrderId();
    if (uid == null || !uid.matches("(?i)^0x[0-9a-f]{112}$")) {
      return StatusResult.failure("CoW Protocol order identifier is invalid.");
    }

    String apiKey = properties.getCowApiKey() == null ? "" : properties.getCowApiKey().trim();
    String baseUrl = apiKey.isBlank()
        ? properties.getCowOrderbookBaseUrl()
        : properties.getCowPartnerOrderbookBaseUrl();
    URI uri = UriComponentsBuilder
        .fromUriString(baseUrl)
        .path("/{network}/api/v1/orders/{uid}")
        .build(network, uid);
    try {
      RestClient.RequestHeadersSpec<?> request = restClient.get()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      JsonNode response = request.retrieve().body(JsonNode.class);
      StatusResult result = parseCow(response);
      if (result.checked() && ("partially_filled".equals(result.executionStatus()) || "filled".equals(result.executionStatus()))) {
        String transactionHash = cowLatestTransactionHash(baseUrl, network, apiKey, uid);
        return result.withTransactionHash(transactionHash);
      }
      return result;
    } catch (RestClientResponseException exception) {
      return providerFailure("CoW Protocol", exception);
    } catch (RuntimeException exception) {
      log.warn("CoW Protocol order status check failed before receiving a response.", exception);
      return StatusResult.failure("CoW Protocol order status is temporarily unavailable.");
    }
  }

  StatusResult parseOneInch(JsonNode response, Instant expiresAt, Instant now) {
    if (response == null || !response.isObject()) return StatusResult.failure("Invalid 1inch order status response.");

    boolean hasFill = false;
    boolean hasCancel = false;
    String transactionHash = null;
    JsonNode events = response.path("events");
    if (events.isArray()) {
      for (JsonNode event : events) {
        String action = event.path("action").asText("").toLowerCase(Locale.ROOT);
        if ("cancel".equals(action)) hasCancel = true;
        if ("fill".equals(action)) hasFill = true;
        if (transactionHash == null) transactionHash = validTransactionHash(event.path("transactionHash").asText(null));
      }
    }

    if (hasCancel) return StatusResult.success("cancelled", transactionHash, null);
    BigInteger remaining = unsignedInteger(response.path("remainingMakerAmount").asText(null));
    if (remaining == null) return StatusResult.failure("Invalid 1inch remaining amount.");
    if (remaining.signum() == 0 && hasFill) {
      return StatusResult.success("filled", transactionHash, null);
    }
    if (hasFill) return StatusResult.success("partially_filled", transactionHash, null);
    if (expiresAt != null && !now.isBefore(expiresAt)) return StatusResult.success("expired", null, null);

    int providerStatus = response.path("orderStatus").asInt(1);
    if (providerStatus == 3 || providerStatus == 6) {
      return StatusResult.success("rejected", null, "The order provider marked these signed terms as invalid.");
    }
    String warning = providerStatus == 2
        ? "This order is waiting for sufficient token balance or approval."
        : null;
    return StatusResult.success("open", null, warning);
  }

  StatusResult parseCow(JsonNode response) {
    if (response == null || !response.isObject()) return StatusResult.failure("Invalid CoW Protocol order status response.");
    String providerStatus = response.path("status").asText("");
    BigInteger executedSellAmount = unsignedInteger(response.path("executedSellAmount").asText("0"));
    return switch (providerStatus) {
      case "fulfilled" -> StatusResult.success("filled", null, null);
      case "cancelled" -> StatusResult.success("cancelled", null, null);
      case "expired" -> StatusResult.success("expired", null, null);
      case "open", "presignaturePending" -> executedSellAmount == null
          ? StatusResult.failure("Invalid CoW Protocol executed amount.")
          : executedSellAmount.signum() > 0
              ? StatusResult.success("partially_filled", null, null)
              : StatusResult.success("open", null, null);
      default -> StatusResult.failure("Unknown CoW Protocol order status.");
    };
  }

  private String cowLatestTransactionHash(String baseUrl, String network, String apiKey, String uid) {
    try {
      URI uri = UriComponentsBuilder
          .fromUriString(baseUrl)
          .path("/{network}/api/v2/trades")
          .queryParam("orderUid", uid)
          .queryParam("offset", 0)
          .queryParam("limit", 1)
          .buildAndExpand(network)
          .toUri();
      RestClient.RequestHeadersSpec<?> request = restClient.get()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("X-API-Key", apiKey);
      JsonNode response = request.retrieve().body(JsonNode.class);
      if (response == null || !response.isArray() || response.isEmpty()) return null;
      return validTransactionHash(response.get(0).path("txHash").asText(null));
    } catch (RuntimeException exception) {
      log.debug("CoW Protocol trade transaction lookup was unavailable.", exception);
      return null;
    }
  }

  private StatusResult providerFailure(String providerName, RestClientResponseException exception) {
    log.warn("{} order status check returned HTTP {}.", providerName, exception.getStatusCode().value());
    return StatusResult.failure(providerName + " order status is temporarily unavailable.");
  }

  private BigInteger unsignedInteger(String value) {
    if (value == null || !value.matches("^[0-9]+$")) return null;
    try {
      return new BigInteger(value);
    } catch (NumberFormatException exception) {
      return null;
    }
  }

  private String validTransactionHash(String value) {
    if (value == null) return null;
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    return normalized.matches("^0x[0-9a-f]{64}$") ? normalized : null;
  }

  public record StatusResult(
      boolean checked,
      String executionStatus,
      String transactionHash,
      String warning,
      String error) {
    static StatusResult success(String executionStatus, String transactionHash, String warning) {
      return new StatusResult(true, executionStatus, transactionHash, warning, null);
    }

    static StatusResult failure(String error) {
      return new StatusResult(false, null, null, null, error);
    }

    StatusResult withTransactionHash(String transactionHash) {
      return new StatusResult(checked, executionStatus, transactionHash, warning, error);
    }
  }
}
