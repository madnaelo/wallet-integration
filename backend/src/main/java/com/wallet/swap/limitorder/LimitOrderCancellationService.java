package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.limitorder.LimitOrderCancellationClient.CancellationResult;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCancellationPlanResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCancellationRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import com.wallet.swap.limitorder.LimitOrderRepository.CancellationCandidate;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderCancellationService {
  static final String LOCAL_MODE = "local";
  static final String COW_SIGNATURE_MODE = "cow_signature";
  static final String ONEINCH_TRANSACTION_MODE = "oneinch_transaction";
  static final String UNAVAILABLE_MODE = "unavailable";

  private final FeatureFlagService featureFlagService;
  private final LimitOrderRepository repository;
  private final LimitOrderCancellationClient cancellationClient;
  private final LimitOrderSignatureVerifier signatureVerifier;
  private final ObjectMapper objectMapper;

  public LimitOrderCancellationService(
      FeatureFlagService featureFlagService,
      LimitOrderRepository repository,
      LimitOrderCancellationClient cancellationClient,
      LimitOrderSignatureVerifier signatureVerifier,
      ObjectMapper objectMapper) {
    this.featureFlagService = featureFlagService;
    this.repository = repository;
    this.cancellationClient = cancellationClient;
    this.signatureVerifier = signatureVerifier;
    this.objectMapper = objectMapper;
  }

  public LimitOrderCancellationPlanResponse plan(String walletAddress, UUID id) {
    featureFlagService.requireLimitOrdersEnabled();
    return buildPlan(requireOwnedCandidate(walletAddress, id));
  }

  public LimitOrderResponse cancel(
      String walletAddress,
      UUID id,
      LimitOrderCancellationRequest request) {
    featureFlagService.requireLimitOrdersEnabled();
    CancellationCandidate candidate = requireOwnedCandidate(walletAddress, id);
    if (candidate.cancellationRequestedAt() != null || "cancelled".equals(candidate.executionStatus())) {
      return requireOwnedResponse(walletAddress, id);
    }

    if (isLocalCancellation(candidate)) {
      rejectUnexpectedAuthorization(request);
      return repository.cancelUnsubmitted(id, walletAddress)
          .orElseGet(() -> resolveConcurrentChange(walletAddress, id));
    }

    if (!isProviderActive(candidate.executionStatus())) {
      throw new ApiException(HttpStatus.CONFLICT, terminalReason(candidate.executionStatus()));
    }

    LimitOrderCancellationPlanResponse plan = buildPlan(candidate);
    if (COW_SIGNATURE_MODE.equals(plan.mode())) {
      requireOnlySignature(request);
      signatureVerifier.verifyTypedDataSigner(
          walletAddress,
          "OrderCancellation",
          request.signature(),
          plan.typedData());
      CancellationResult result = cancellationClient.cancelCow(
          candidate.chainId(),
          candidate.providerOrderId(),
          request.signature());
      if (!result.accepted()) {
        throw new ApiException(
            result.retryable() ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.CONFLICT,
            result.message());
      }
      return markProviderCancellation(walletAddress, id, null);
    }

    if (ONEINCH_TRANSACTION_MODE.equals(plan.mode())) {
      requireOnlyTransactionHash(request);
      return markProviderCancellation(walletAddress, id, request.transactionHash());
    }

    throw new ApiException(HttpStatus.CONFLICT, plan.reason());
  }

  private LimitOrderResponse markProviderCancellation(
      String walletAddress,
      UUID id,
      String transactionHash) {
    return repository.markProviderCancellationRequested(id, walletAddress, transactionHash)
        .orElseGet(() -> resolveConcurrentChange(walletAddress, id));
  }

  private LimitOrderCancellationPlanResponse buildPlan(CancellationCandidate candidate) {
    if (candidate.cancellationRequestedAt() != null) {
      return unavailable(candidate, "Cancellation is already being confirmed.");
    }
    if (isLocalCancellation(candidate)) {
      return new LimitOrderCancellationPlanResponse(
          LOCAL_MODE,
          candidate.chainId(),
          candidate.executionProvider(),
          candidate.orderHash(),
          candidate.providerOrderId(),
          null,
          null,
          null,
          "This saved order has not reached the provider and can be cancelled immediately.");
    }
    if (!isProviderActive(candidate.executionStatus())) {
      return unavailable(candidate, terminalReason(candidate.executionStatus()));
    }

    JsonNode savedPayload = validateSavedPayload(candidate);
    if (LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER.equals(candidate.executionProvider())) {
      String orderUid = validateCowOrderUid(candidate);
      return new LimitOrderCancellationPlanResponse(
          COW_SIGNATURE_MODE,
          candidate.chainId(),
          candidate.executionProvider(),
          candidate.orderHash(),
          orderUid,
          null,
          null,
          buildCowCancellationTypedData(candidate.chainId(), orderUid),
          "Your wallet must sign this cancellation. Signing does not move funds.");
    }
    if (LimitOrderCapabilityService.ONEINCH_PROVIDER.equals(candidate.executionProvider())) {
      String makerTraits = validateOneInchCancellation(candidate, savedPayload);
      return new LimitOrderCancellationPlanResponse(
          ONEINCH_TRANSACTION_MODE,
          candidate.chainId(),
          candidate.executionProvider(),
          candidate.orderHash(),
          candidate.providerOrderId(),
          LimitOrderProviderSupport.ONEINCH_LIMIT_ORDER_CONTRACT,
          makerTraits,
          null,
          "Your wallet must send an on-chain cancellation transaction. Network gas may apply.");
    }
    return unavailable(candidate, "This order provider does not support cancellation here.");
  }

  private JsonNode validateSavedPayload(CancellationCandidate candidate) {
    try {
      JsonNode root = objectMapper.readTree(candidate.signedPayloadJson());
      if (!root.isObject()
          || root.path("chainId").asLong(-1) != candidate.chainId()
          || !candidate.executionProvider().equals(root.path("provider").asText(""))) {
        throw savedIntegrityFailure();
      }
      String actualHash = LimitOrderPayloadIntegrity.sha256(root, objectMapper);
      if (candidate.signedPayloadHashVersion() >= LimitOrderPayloadIntegrity.CURRENT_VERSION
          && !actualHash.equalsIgnoreCase(candidate.signedPayloadHash())) {
        throw savedIntegrityFailure();
      }
      signatureVerifier.verify(
          candidate.walletAddress(),
          candidate.orderHash(),
          candidate.signature(),
          root.path("typedData"));
      return root;
    } catch (ApiException exception) {
      throw exception;
    } catch (JsonProcessingException | RuntimeException exception) {
      throw savedIntegrityFailure();
    }
  }

  private String validateCowOrderUid(CancellationCandidate candidate) {
    String uid = candidate.providerOrderId() == null
        ? ""
        : candidate.providerOrderId().trim().toLowerCase(Locale.ROOT);
    String wallet = candidate.walletAddress().replaceFirst("(?i)^0x", "").toLowerCase(Locale.ROOT);
    String expectedUid = (candidate.orderHash()
        + wallet
        + String.format("%08x", candidate.expiresAt().getEpochSecond()))
        .toLowerCase(Locale.ROOT);
    if (!uid.matches("^0x[0-9a-f]{112}$") || !uid.equals(expectedUid)) {
      throw savedIntegrityFailure();
    }
    return uid;
  }

  private String validateOneInchCancellation(CancellationCandidate candidate, JsonNode root) {
    JsonNode data = root.path("data");
    JsonNode message = root.path("typedData").path("message");
    String makerTraits = data.path("makerTraits").asText("");
    if (!data.isObject()
        || !message.isObject()
        || !sameAddress(data.path("maker").asText(""), candidate.walletAddress())
        || !data.path("maker").equals(message.path("maker"))
        || !data.path("makerTraits").equals(message.path("makerTraits"))) {
      throw savedIntegrityFailure();
    }
    OneInchMakerTraitsValidator.validate(makerTraits, candidate.expiresAt());
    return makerTraits;
  }

  private JsonNode buildCowCancellationTypedData(long chainId, String orderUid) {
    ObjectNode typedData = objectMapper.createObjectNode();
    ObjectNode types = typedData.putObject("types");
    ArrayNode domainFields = types.putArray("EIP712Domain");
    addField(domainFields, "name", "string");
    addField(domainFields, "version", "string");
    addField(domainFields, "chainId", "uint256");
    addField(domainFields, "verifyingContract", "address");
    ArrayNode cancellationFields = types.putArray("OrderCancellation");
    addField(cancellationFields, "orderUid", "bytes");
    typedData.put("primaryType", "OrderCancellation");
    ObjectNode domain = typedData.putObject("domain");
    domain.put("name", "Gnosis Protocol");
    domain.put("version", "v2");
    domain.put("chainId", chainId);
    domain.put("verifyingContract", LimitOrderProviderSupport.COW_SETTLEMENT_CONTRACT);
    typedData.putObject("message").put("orderUid", orderUid);
    return typedData;
  }

  private void addField(ArrayNode fields, String name, String type) {
    ObjectNode field = fields.addObject();
    field.put("name", name);
    field.put("type", type);
  }

  private CancellationCandidate requireOwnedCandidate(String walletAddress, UUID id) {
    return repository.findCancellationCandidate(id, walletAddress)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Limit order was not found."));
  }

  private LimitOrderResponse requireOwnedResponse(String walletAddress, UUID id) {
    return repository.findByIdForWallet(id, walletAddress)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Limit order was not found."));
  }

  private LimitOrderResponse resolveConcurrentChange(String walletAddress, UUID id) {
    CancellationCandidate latest = requireOwnedCandidate(walletAddress, id);
    if (latest.cancellationRequestedAt() != null
        || "cancelled".equals(latest.executionStatus())
        || "filled".equals(latest.executionStatus())
        || "expired".equals(latest.executionStatus())
        || ("failed".equals(latest.executionStatus()) && latest.providerOrderId() != null)) {
      return requireOwnedResponse(walletAddress, id);
    }
    throw new ApiException(
        HttpStatus.CONFLICT,
        "The order status changed while cancellation was starting. Refresh and try again.");
  }

  private LimitOrderCancellationPlanResponse unavailable(
      CancellationCandidate candidate,
      String reason) {
    return new LimitOrderCancellationPlanResponse(
        UNAVAILABLE_MODE,
        candidate.chainId(),
        candidate.executionProvider(),
        candidate.orderHash(),
        candidate.providerOrderId(),
        null,
        null,
        null,
        reason);
  }

  private boolean isLocalCancellation(CancellationCandidate candidate) {
    String status = candidate.executionStatus();
    return candidate.providerOrderId() == null
        && ("stored".equals(status) || "pending_submission".equals(status) || "failed".equals(status));
  }

  private boolean isProviderActive(String status) {
    return "submitted".equals(status) || "open".equals(status) || "partially_filled".equals(status);
  }

  private String terminalReason(String status) {
    return switch (status) {
      case "filled" -> "This order has already been filled.";
      case "expired" -> "This order has expired.";
      case "cancelled" -> "This order is already cancelled.";
      case "failed" -> "This order is no longer active.";
      default -> "This order cannot be cancelled in its current state.";
    };
  }

  private void rejectUnexpectedAuthorization(LimitOrderCancellationRequest request) {
    if (request == null) return;
    if (hasText(request.signature()) || hasText(request.transactionHash())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "This saved order does not need wallet authorization to cancel.");
    }
  }

  private void requireOnlySignature(LimitOrderCancellationRequest request) {
    if (request == null || !hasText(request.signature()) || hasText(request.transactionHash())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A wallet cancellation signature is required.");
    }
  }

  private void requireOnlyTransactionHash(LimitOrderCancellationRequest request) {
    if (request == null || !hasText(request.transactionHash()) || hasText(request.signature())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "A confirmed cancellation transaction is required.");
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private boolean sameAddress(String first, String second) {
    return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
  }

  private ApiException savedIntegrityFailure() {
    return new ApiException(
        HttpStatus.CONFLICT,
        "The saved order failed its integrity check and cannot be cancelled here.");
  }
}
