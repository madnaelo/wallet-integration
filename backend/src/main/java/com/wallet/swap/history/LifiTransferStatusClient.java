package com.wallet.swap.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.config.LifiProperties;
import com.wallet.swap.history.SwapHistoryRepository.TransferStatusCandidate;
import java.net.URI;
import java.time.Duration;
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
public class LifiTransferStatusClient {
  private static final Logger log = LoggerFactory.getLogger(LifiTransferStatusClient.class);

  private final LifiProperties properties;
  private final RestClient restClient;

  public LifiTransferStatusClient(LifiProperties properties, RestClient.Builder restClientBuilder) {
    this.properties = properties;
    Duration timeout = Duration.ofSeconds(Math.max(1, properties.getRequestTimeoutSeconds()));
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeout);
    requestFactory.setReadTimeout(timeout);
    this.restClient = restClientBuilder.requestFactory(requestFactory).build();
  }

  public StatusResult check(TransferStatusCandidate candidate) {
    URI uri = statusUri(candidate);
    String apiKey = text(properties.getApiKey());
    try {
      RestClient.RequestHeadersSpec<?> request = restClient.get()
          .uri(uri)
          .header(HttpHeaders.ACCEPT, "application/json");
      if (!apiKey.isBlank()) request = request.header("x-lifi-api-key", apiKey);
      return parse(request.retrieve().body(JsonNode.class));
    } catch (RestClientResponseException exception) {
      if (exception.getStatusCode().value() == 404) {
        return StatusResult.checked("submitted", "NOT_FOUND", "", null);
      }
      log.warn("LI.FI transfer status returned HTTP {} for history {}.", exception.getStatusCode().value(), candidate.id());
      return StatusResult.failure("LI.FI transfer status is temporarily unavailable.");
    } catch (RuntimeException exception) {
      log.warn("LI.FI transfer status failed for history {}.", candidate.id(), exception);
      return StatusResult.failure("LI.FI transfer status is temporarily unavailable.");
    }
  }

  StatusResult parse(JsonNode response) {
    if (response == null || !response.isObject()) {
      return StatusResult.failure("LI.FI returned an invalid transfer status.");
    }
    String providerStatus = text(response.path("status").asText()).toUpperCase(Locale.ROOT);
    String providerSubstatus = text(response.path("substatus").asText()).toUpperCase(Locale.ROOT);
    String destinationTransactionHash = validTransactionIdentifier(response.path("receiving").path("txHash").asText(null));

    if (providerSubstatus.contains("REFUND")) {
      return StatusResult.checked(
          "refunded", providerStatus, providerSubstatus, destinationTransactionHash);
    }

    return switch (providerStatus) {
      case "DONE" -> StatusResult.checked(
          "confirmed", providerStatus, providerSubstatus, destinationTransactionHash);
      case "FAILED", "INVALID" -> StatusResult.checked(
          "failed",
          providerStatus,
          providerSubstatus,
          destinationTransactionHash);
      case "PENDING", "NOT_FOUND" -> StatusResult.checked(
          "submitted", providerStatus, providerSubstatus, destinationTransactionHash);
      default -> StatusResult.failure("LI.FI returned an unknown transfer status.");
    };
  }

  private URI statusUri(TransferStatusCandidate candidate) {
    UriComponentsBuilder builder = UriComponentsBuilder
        .fromUriString(properties.getBaseUrl())
        .path("/v1/status")
        .queryParam("txHash", candidate.transactionHash())
        .queryParam("fromChain", candidate.fromChainId())
        .queryParam("toChain", candidate.toChainId());
    String bridge = text(candidate.bridge());
    if (bridge.matches("^[A-Za-z0-9._:-]{1,80}$")) builder.queryParam("bridge", bridge);
    return builder.build().encode().toUri();
  }

  private String validTransactionIdentifier(String value) {
    String normalized = text(value);
    return normalized.matches("(?i)^(0x)?[0-9a-f]{64}$")
            || normalized.matches("^[1-9A-HJ-NP-Za-km-z]{80,90}$")
        ? normalized
        : null;
  }

  private String text(String value) {
    return value == null ? "" : value.trim();
  }

  public record StatusResult(
      boolean checked,
      String status,
      String providerStatus,
      String providerSubstatus,
      String destinationTransactionHash,
      String error) {
    static StatusResult checked(
        String status,
        String providerStatus,
        String providerSubstatus,
        String destinationTransactionHash) {
      return new StatusResult(true, status, providerStatus, providerSubstatus, destinationTransactionHash, null);
    }

    static StatusResult failure(String error) {
      return new StatusResult(false, null, null, null, null, error);
    }
  }
}
