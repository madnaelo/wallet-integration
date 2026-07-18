package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import com.wallet.swap.limitorder.LimitOrderRepository.SubmissionCandidate;
import com.wallet.swap.limitorder.LimitOrderSubmissionClient.LimitOrderSubmissionResult;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderSubmissionCoordinator {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderSubmissionCoordinator.class);

  private final LimitOrderRepository repository;
  private final LimitOrderSubmissionClient submissionClient;
  private final LimitOrderProperties properties;
  private final ObjectMapper objectMapper;
  private final LimitOrderSignatureVerifier signatureVerifier;

  public LimitOrderSubmissionCoordinator(
      LimitOrderRepository repository,
      LimitOrderSubmissionClient submissionClient,
      LimitOrderProperties properties,
      ObjectMapper objectMapper,
      LimitOrderSignatureVerifier signatureVerifier) {
    this.repository = repository;
    this.submissionClient = submissionClient;
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.signatureVerifier = signatureVerifier;
  }

  public Optional<LimitOrderResponse> submitNow(UUID id) {
    if (!properties.isOrderbookSubmissionEnabled()) return repository.findById(id);
    return repository.claimById(id, maxAttempts(), lockTtl()).map(this::submitClaimed);
  }

  public void submitDue() {
    repository.markExpiredPending();
    if (!properties.isOrderbookSubmissionEnabled()) return;
    int batchSize = Math.max(1, properties.getSubmissionBatchSize());
    for (int processed = 0; processed < batchSize; processed++) {
      List<SubmissionCandidate> candidates = repository.claimDue(1, maxAttempts(), lockTtl());
      if (candidates.isEmpty()) return;
      submitClaimed(candidates.get(0));
    }
  }

  LimitOrderResponse submitClaimed(SubmissionCandidate candidate) {
    LimitOrderSubmissionResult result;
    String verifiedPayloadHash = candidate.signedPayloadHash();
    int verifiedPayloadHashVersion = candidate.signedPayloadHashVersion();
    try {
      JsonNode root = objectMapper.readTree(candidate.signedPayloadJson());
      JsonNode data = root.path("data");
      String actualPayloadHash = LimitOrderPayloadIntegrity.sha256(root, objectMapper);
      if (candidate.signedPayloadHashVersion() >= LimitOrderPayloadIntegrity.CURRENT_VERSION
          && !actualPayloadHash.equalsIgnoreCase(candidate.signedPayloadHash())) {
        result = LimitOrderSubmissionResult.failure(
            "The saved signed order failed its integrity check and cannot be submitted.",
            false);
      } else if (!data.isObject()) {
        result = LimitOrderSubmissionResult.failure(
            "The saved signed order is invalid and cannot be submitted.",
            false);
      } else if (root.path("chainId").asLong(-1) != candidate.chainId()
          || !candidate.executionProvider().equals(root.path("provider").asText(""))) {
        result = LimitOrderSubmissionResult.failure(
            "The saved signed order failed its integrity check and cannot be submitted.",
            false);
      } else {
        signatureVerifier.verify(
            candidate.walletAddress(),
            candidate.orderHash(),
            candidate.signature(),
            root.path("typedData"));
        verifiedPayloadHash = actualPayloadHash;
        verifiedPayloadHashVersion = LimitOrderPayloadIntegrity.CURRENT_VERSION;
        result = submissionClient.submit(
            candidate.chainId(),
            candidate.executionProvider(),
            candidate.orderHash(),
            candidate.signature(),
            data);
      }
    } catch (JsonProcessingException | RuntimeException exception) {
      log.warn("Could not prepare saved limit order {} for submission.", candidate.id(), exception);
      result = LimitOrderSubmissionResult.failure(
          "The saved signed order is invalid and cannot be submitted.",
          false);
    }

    String status = result.submitted() ? "submitted" : result.skipped() ? "stored" : "failed";
    Instant nextAttemptAt = nextAttemptAt(candidate, result);
    Optional<LimitOrderResponse> completed = repository.completeSubmission(
        candidate,
        status,
        result.submitted() ? null : result.message(),
        result.providerOrderId(),
        nextAttemptAt,
        verifiedPayloadHash,
        verifiedPayloadHashVersion);
    return completed.orElseGet(() -> repository.findById(candidate.id())
        .orElseThrow(() -> new IllegalStateException("Limit order disappeared during submission.")));
  }

  private Instant nextAttemptAt(SubmissionCandidate candidate, LimitOrderSubmissionResult result) {
    if (result.submitted() || !result.retryable() || candidate.attempts() >= maxAttempts()) return null;
    Duration delay = retryDelay(candidate.attempts());
    Instant next = Instant.now().plus(delay);
    return next.isBefore(candidate.expiresAt()) ? next : null;
  }

  private Duration retryDelay(int attempts) {
    long multiplier = 1L << Math.min(7, Math.max(0, attempts - 1));
    return Duration.ofSeconds(Math.min(3_600, 30 * multiplier));
  }

  private int maxAttempts() {
    return Math.max(1, properties.getSubmissionMaxAttempts());
  }

  private Duration lockTtl() {
    long minimum = Math.max(15L, properties.getRequestTimeoutSeconds() * 3L + 5L);
    return Duration.ofSeconds(Math.max(minimum, properties.getSubmissionLockTtlSeconds()));
  }

}
