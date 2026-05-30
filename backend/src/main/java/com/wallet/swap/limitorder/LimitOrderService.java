package com.wallet.swap.limitorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.limitorder.LimitOrderSubmissionClient.LimitOrderSubmissionResult;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderService {
  private static final String ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  private static final String ONEINCH_ROUTER_V6 = "0x111111125421ca6dc452d289314280a0f8842a65";

  private final LimitOrderCapabilityService capabilityService;
  private final FeatureFlagService featureFlagService;
  private final LimitOrderRepository repository;
  private final LimitOrderSubmissionClient submissionClient;
  private final ObjectMapper objectMapper;

  public LimitOrderService(
      LimitOrderCapabilityService capabilityService,
      FeatureFlagService featureFlagService,
      LimitOrderRepository repository,
      LimitOrderSubmissionClient submissionClient,
      ObjectMapper objectMapper) {
    this.capabilityService = capabilityService;
    this.featureFlagService = featureFlagService;
    this.repository = repository;
    this.submissionClient = submissionClient;
    this.objectMapper = objectMapper;
  }

  public LimitOrderCapabilityResponse capability(LimitOrderCapabilityRequest request) {
    featureFlagService.requireLimitOrdersEnabled();
    return capabilityService.check(request);
  }

  public List<LimitOrderResponse> list(String walletAddress) {
    featureFlagService.requireLimitOrdersEnabled();
    return repository.listForWallet(walletAddress);
  }

  public LimitOrderResponse save(String walletAddress, LimitOrderRequest request) {
    featureFlagService.requireLimitOrdersEnabled();
    validate(request);
    LimitOrderCapabilityResponse capability = capabilityService.check(toCapabilityRequest(request));
    if (!capability.automaticExecutionSupported()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, capability.reason());
    }
    if (!capability.executionProvider().equals(request.executionProvider())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Limit order provider does not match the supported execution adapter.");
    }

    String payloadHash = sha256Hex(request.signedPayloadJson().trim());
    JsonNode orderData = validateSignedPayload(walletAddress, request);
    LimitOrderResponse saved = repository.insert(walletAddress, request, capability.executionSupport(), "stored", payloadHash);
    LimitOrderSubmissionResult result = submissionClient.submit(
        request.chainId(),
        request.orderHash().trim(),
        request.signature().trim(),
        orderData);
    if (result.submitted()) {
      return repository.updateSubmissionStatus(saved.id(), "submitted", null);
    }
    if (result.skipped()) {
      return repository.updateSubmissionStatus(saved.id(), "stored", result.message());
    }
    return repository.updateSubmissionStatus(saved.id(), "failed", result.message());
  }

  private void validate(LimitOrderRequest request) {
    if (!request.termsAccepted()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the Limit Order terms before saving.");
    }
    if (request.chainId() == null || request.chainId() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Network is required.");
    }
    if (request.sellTokenDecimals() == null || request.buyTokenDecimals() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Token decimals are required.");
    }
    if (request.sellAmountRaw() == null || request.sellAmountRaw().trim().equals("0")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Sell amount must be greater than zero.");
    }
    if (request.minBuyAmountRaw() == null || request.minBuyAmountRaw().trim().equals("0")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Minimum receive amount must be greater than zero.");
    }
    if (request.expiresAt() == null || !request.expiresAt().isAfter(Instant.now().plusSeconds(60))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Expiration must be at least one minute in the future.");
    }
    if (request.targetRate() == null || request.targetRate().signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target rate must be greater than zero.");
    }
    if (!looksLikeHash(request.orderHash())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Order hash must be a 32-byte hex value.");
    }
    if (!looksLikeSignature(request.signature())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Order signature is invalid.");
    }
    if (request.signedPayloadJson() == null || request.signedPayloadJson().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order payload is required.");
    }
  }

  private JsonNode validateSignedPayload(String walletAddress, LimitOrderRequest request) {
    JsonNode root;
    try {
      root = objectMapper.readTree(request.signedPayloadJson());
    } catch (Exception exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order payload must be valid JSON.");
    }

    JsonNode data = root.path("data");
    if (!data.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order payload is missing order data.");
    }
    requireSameAddress(data.path("maker").asText(""), walletAddress, "Signed order maker must match the signed-in wallet.");
    requireSameAddress(data.path("makerAsset").asText(""), request.sellTokenAddress(), "Signed order sell token does not match.");
    requireSameAddress(data.path("takerAsset").asText(""), request.buyTokenAddress(), "Signed order buy token does not match.");
    requireSameText(data.path("makingAmount").asText(""), request.sellAmountRaw(), "Signed order sell amount does not match.");
    requireSameText(data.path("takingAmount").asText(""), request.minBuyAmountRaw(), "Signed order receive amount does not match.");

    String receiver = data.path("receiver").asText("");
    if (!sameAddress(receiver, ZERO_ADDRESS) || !sameAddress(walletAddress, request.recipientAddress())) {
      requireSameAddress(receiver, request.recipientAddress(), "Signed order recipient does not match.");
    }

    JsonNode domain = root.path("typedData").path("domain");
    if (!domain.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order typed data is missing.");
    }
    long typedChainId = domain.path("chainId").asLong(-1);
    if (typedChainId != request.chainId()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order network does not match.");
    }
    requireSameAddress(
        domain.path("verifyingContract").asText(""),
        ONEINCH_ROUTER_V6,
        "Signed order verification contract is not supported.");

    return data;
  }

  private void requireSameAddress(String actual, String expected, String message) {
    if (!sameAddress(actual, expected)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, message);
    }
  }

  private boolean sameAddress(String first, String second) {
    return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
  }

  private void requireSameText(String actual, String expected, String message) {
    if (actual == null || expected == null || !actual.trim().equals(expected.trim())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, message);
    }
  }

  private LimitOrderCapabilityRequest toCapabilityRequest(LimitOrderRequest request) {
    return new LimitOrderCapabilityRequest(
        request.chainId(),
        request.sellTokenAddress(),
        request.sellTokenSymbol(),
        request.sellTokenDecimals(),
        request.buyTokenAddress(),
        request.buyTokenSymbol(),
        request.buyTokenDecimals());
  }

  private boolean looksLikeHash(String value) {
    return value != null && value.matches("(?i)^0x[0-9a-f]{64}$");
  }

  private boolean looksLikeSignature(String value) {
    return value != null && value.matches("(?i)^0x[0-9a-f]{130}$");
  }

  private String sha256Hex(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("SHA-256 is unavailable.", exception);
    }
  }
}
