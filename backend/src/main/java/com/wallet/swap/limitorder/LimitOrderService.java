package com.wallet.swap.limitorder;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityResponse;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderRequest;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderResponse;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LimitOrderService {
  private static final String ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  private static final String ONEINCH_ROUTER_V6 = "0x111111125421ca6dc452d289314280a0f8842a65";
  private static final String COW_SETTLEMENT_CONTRACT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  private static final String COW_EMPTY_APP_DATA_HASH =
      "0xb48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d";
  private static final Duration MAX_ORDER_LIFETIME = Duration.ofDays(7);
  private static final List<Eip712Field> DOMAIN_FIELDS = List.of(
      new Eip712Field("name", "string"),
      new Eip712Field("version", "string"),
      new Eip712Field("chainId", "uint256"),
      new Eip712Field("verifyingContract", "address"));
  private static final List<Eip712Field> ONEINCH_ORDER_FIELDS = List.of(
      new Eip712Field("salt", "uint256"),
      new Eip712Field("maker", "address"),
      new Eip712Field("receiver", "address"),
      new Eip712Field("makerAsset", "address"),
      new Eip712Field("takerAsset", "address"),
      new Eip712Field("makingAmount", "uint256"),
      new Eip712Field("takingAmount", "uint256"),
      new Eip712Field("makerTraits", "uint256"));
  private static final List<Eip712Field> COW_ORDER_FIELDS = List.of(
      new Eip712Field("sellToken", "address"),
      new Eip712Field("buyToken", "address"),
      new Eip712Field("receiver", "address"),
      new Eip712Field("sellAmount", "uint256"),
      new Eip712Field("buyAmount", "uint256"),
      new Eip712Field("validTo", "uint32"),
      new Eip712Field("appData", "bytes32"),
      new Eip712Field("feeAmount", "uint256"),
      new Eip712Field("kind", "string"),
      new Eip712Field("partiallyFillable", "bool"),
      new Eip712Field("sellTokenBalance", "string"),
      new Eip712Field("buyTokenBalance", "string"));

  private final LimitOrderCapabilityService capabilityService;
  private final FeatureFlagService featureFlagService;
  private final LimitOrderRepository repository;
  private final LimitOrderSubmissionCoordinator submissionCoordinator;
  private final LimitOrderSignatureVerifier signatureVerifier;
  private final ObjectMapper objectMapper;

  public LimitOrderService(
      LimitOrderCapabilityService capabilityService,
      FeatureFlagService featureFlagService,
      LimitOrderRepository repository,
      LimitOrderSubmissionCoordinator submissionCoordinator,
      LimitOrderSignatureVerifier signatureVerifier,
      ObjectMapper objectMapper) {
    this.capabilityService = capabilityService;
    this.featureFlagService = featureFlagService;
    this.repository = repository;
    this.submissionCoordinator = submissionCoordinator;
    this.signatureVerifier = signatureVerifier;
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

    JsonNode signedPayload = validateSignedPayload(walletAddress, request);
    String payloadHash = LimitOrderPayloadIntegrity.sha256(signedPayload, objectMapper);
    LimitOrderResponse saved = repository.findByOrderHash(request.orderHash())
        .map(existing -> requireIdempotentMatch(existing, walletAddress, request, payloadHash))
        .orElseGet(() -> repository
            .insertIfAbsent(
                walletAddress,
                request,
                capability.executionSupport(),
                LimitOrderTerms.CURRENT_VERSION,
                payloadHash)
            .orElseGet(() -> existingIdempotentOrder(walletAddress, request, payloadHash)));
    if (saved.executionStatus().equals("stored") || saved.executionStatus().equals("failed")) {
      repository.scheduleManualRetry(saved.id());
    }
    return submissionCoordinator.submitNow(saved.id()).orElse(saved);
  }

  private LimitOrderResponse existingIdempotentOrder(
      String walletAddress,
      LimitOrderRequest request,
      String payloadHash) {
    LimitOrderResponse existing = repository.findByOrderHash(request.orderHash())
        .orElseThrow(() -> new IllegalStateException("Limit order conflict could not be resolved."));
    return requireIdempotentMatch(existing, walletAddress, request, payloadHash);
  }

  private LimitOrderResponse requireIdempotentMatch(
      LimitOrderResponse existing,
      String walletAddress,
      LimitOrderRequest request,
      String payloadHash) {
    if (!existing.walletAddress().equalsIgnoreCase(walletAddress)
        || !existing.signedPayloadHash().equalsIgnoreCase(payloadHash)
        || !existing.executionProvider().equals(request.executionProvider().trim())) {
      throw new ApiException(HttpStatus.CONFLICT, "This signed limit order conflicts with an existing order.");
    }
    return existing;
  }

  private void validate(LimitOrderRequest request) {
    if (!request.termsAccepted()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accept the Limit Order terms before saving.");
    }
    if (!LimitOrderTerms.CURRENT_VERSION.equals(request.termsVersion())) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Limit Order terms have changed. Refresh this page and review them again.");
    }
    if (request.chainId() == null || request.chainId() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Network is required.");
    }
    if (!validDecimals(request.sellTokenDecimals()) || !validDecimals(request.buyTokenDecimals())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Token decimals are required.");
    }
    BigInteger sellAmount = positiveAmount(request.sellAmountRaw(), "Sell amount must be greater than zero.");
    BigInteger minBuyAmount = positiveAmount(
        request.minBuyAmountRaw(),
        "Minimum receive amount must be greater than zero.");
    Instant now = Instant.now();
    if (request.expiresAt() == null || !request.expiresAt().isAfter(now.plusSeconds(60))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Expiration must be at least one minute in the future.");
    }
    if (request.expiresAt().isAfter(now.plus(MAX_ORDER_LIFETIME).plusSeconds(60))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Limit orders can remain open for at most seven days.");
    }
    if (request.targetRate() == null || request.targetRate().signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target rate must be greater than zero.");
    }
    validateTargetRate(request, sellAmount, minBuyAmount);
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
    } catch (JsonProcessingException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order payload must be valid JSON.");
    }

    JsonNode data = root.path("data");
    if (!data.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order payload is missing order data.");
    }
    JsonNode typedData = root.path("typedData");
    JsonNode domain = typedData.path("domain");
    if (!domain.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order typed data is missing.");
    }
    long typedChainId = domain.path("chainId").asLong(-1);
    if (typedChainId != request.chainId()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order network does not match.");
    }
    if (root.path("chainId").asLong(-1) != request.chainId()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Saved order network does not match the signed terms.");
    }
    requireSameText(
        root.path("provider").asText(""),
        request.executionProvider(),
        "Saved order provider does not match the signed terms.");
    JsonNode message = typedData.path("message");

    if (LimitOrderCapabilityService.ONEINCH_PROVIDER.equals(request.executionProvider())) {
      requireSameText(
          root.path("version").asText(""),
          "1inch-limit-order-v4",
          "Signed order format is not supported.");
      validateOneInchPayload(walletAddress, request, data, typedData, domain, message);
    } else if (LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER.equals(request.executionProvider())) {
      requireSameText(
          root.path("version").asText(""),
          "cow-protocol-order-v1",
          "Signed order format is not supported.");
      validateCowPayload(walletAddress, request, data, typedData, domain, message);
    } else {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Limit order provider is not supported.");
    }
    signatureVerifier.verify(walletAddress, request.orderHash(), request.signature(), typedData);

    return root;
  }

  private void validateOneInchPayload(
      String walletAddress,
      LimitOrderRequest request,
      JsonNode data,
      JsonNode typedData,
      JsonNode domain,
      JsonNode message) {
    requireTypeSchema(typedData, message, domain, ONEINCH_ORDER_FIELDS);
    requireSameAddress(data.path("maker").asText(""), walletAddress, "Signed order maker must match the signed-in wallet.");
    requireSameAddress(data.path("makerAsset").asText(""), request.sellTokenAddress(), "Signed order sell token does not match.");
    requireSameAddress(data.path("takerAsset").asText(""), request.buyTokenAddress(), "Signed order buy token does not match.");
    requireSameText(data.path("makingAmount").asText(""), request.sellAmountRaw(), "Signed order sell amount does not match.");
    requireSameText(data.path("takingAmount").asText(""), request.minBuyAmountRaw(), "Signed order receive amount does not match.");
    requireMatchingFields(
        data,
        message,
        "maker",
        "makerAsset",
        "takerAsset",
        "receiver",
        "makingAmount",
        "takingAmount",
        "salt",
        "makerTraits");
    requireSameText(data.path("extension").asText(""), "0x", "Signed order extensions are not supported.");

    String receiver = data.path("receiver").asText("");
    if (!sameAddress(receiver, ZERO_ADDRESS) || !sameAddress(walletAddress, request.recipientAddress())) {
      requireSameAddress(receiver, request.recipientAddress(), "Signed order recipient does not match.");
    }

    requireSameAddress(
        domain.path("verifyingContract").asText(""),
        ONEINCH_ROUTER_V6,
        "Signed order verification contract is not supported.");
    requireSameText(domain.path("name").asText(""), "1inch Aggregation Router", "Signed order domain is not supported.");
    requireSameText(domain.path("version").asText(""), "6", "Signed order domain version is not supported.");
    OneInchMakerTraitsValidator.validate(data.path("makerTraits").asText(""), request.expiresAt());
  }

  private void validateCowPayload(
      String walletAddress,
      LimitOrderRequest request,
      JsonNode data,
      JsonNode typedData,
      JsonNode domain,
      JsonNode message) {
    requireTypeSchema(typedData, message, domain, COW_ORDER_FIELDS);
    requireSameAddress(data.path("from").asText(""), walletAddress, "Signed order owner must match the signed-in wallet.");
    requireSameAddress(data.path("sellToken").asText(""), request.sellTokenAddress(), "Signed order sell token does not match.");
    requireSameAddress(data.path("buyToken").asText(""), request.buyTokenAddress(), "Signed order buy token does not match.");
    requireSameAddress(data.path("receiver").asText(""), request.recipientAddress(), "Signed order recipient does not match.");
    requireSameText(data.path("sellAmount").asText(""), request.sellAmountRaw(), "Signed order sell amount does not match.");
    requireSameText(data.path("buyAmount").asText(""), request.minBuyAmountRaw(), "Signed order receive amount does not match.");
    requireSameText(data.path("feeAmount").asText(""), "0", "Signed order fee amount is not supported.");
    requireSameText(data.path("kind").asText(""), "sell", "Only sell limit orders are supported.");
    requireSameText(data.path("sellTokenBalance").asText(""), "erc20", "Only ERC-20 sell balances are supported.");
    requireSameText(data.path("buyTokenBalance").asText(""), "erc20", "Only ERC-20 buy balances are supported.");
    requireSameText(data.path("signingScheme").asText(""), "eip712", "Signed order method is not supported.");
    requireSameText(
        data.path("appData").asText(""),
        COW_EMPTY_APP_DATA_HASH,
        "Signed order application data is not supported.");
    requireMatchingFields(
        data,
        message,
        "sellToken",
        "buyToken",
        "receiver",
        "sellAmount",
        "buyAmount",
        "validTo",
        "appData",
        "feeAmount",
        "kind",
        "partiallyFillable",
        "sellTokenBalance",
        "buyTokenBalance");
    if (data.path("partiallyFillable").asBoolean(true)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Partially fillable limit orders are not supported yet.");
    }
    if (data.path("validTo").asLong(-1) != request.expiresAt().getEpochSecond()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order expiry does not match.");
    }
    requireSameAddress(
        domain.path("verifyingContract").asText(""),
        COW_SETTLEMENT_CONTRACT,
        "Signed order verification contract is not supported.");
    requireSameText(domain.path("name").asText(""), "Gnosis Protocol", "Signed order domain is not supported.");
    requireSameText(domain.path("version").asText(""), "v2", "Signed order domain version is not supported.");
  }

  private void requireTypeSchema(
      JsonNode typedData,
      JsonNode message,
      JsonNode domain,
      List<Eip712Field> orderFields) {
    if (!message.isObject() || !domain.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order typed data is incomplete.");
    }
    JsonNode types = typedData.path("types");
    requireFields(types.path("EIP712Domain"), DOMAIN_FIELDS);
    requireFields(types.path("Order"), orderFields);
    requireSameText(
        typedData.path("primaryType").asText(""),
        "Order",
        "Signed order type is not supported.");
  }

  private void requireFields(JsonNode actual, List<Eip712Field> expected) {
    if (!actual.isArray() || actual.size() != expected.size()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order type definition is not supported.");
    }
    for (int index = 0; index < expected.size(); index++) {
      Eip712Field field = expected.get(index);
      JsonNode actualField = actual.get(index);
      if (!field.name().equals(actualField.path("name").asText())
          || !field.type().equals(actualField.path("type").asText())) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order type definition is not supported.");
      }
    }
  }

  private void validateTargetRate(
      LimitOrderRequest request,
      BigInteger sellAmount,
      BigInteger minBuyAmount) {
    BigDecimal expectedRawBuyAmount = new BigDecimal(sellAmount)
        .movePointLeft(request.sellTokenDecimals())
        .multiply(request.targetRate())
        .movePointRight(request.buyTokenDecimals());
    BigInteger expected = expectedRawBuyAmount.setScale(0, RoundingMode.DOWN).toBigIntegerExact();
    if (!expected.equals(minBuyAmount)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target rate does not match the signed receive amount.");
    }
  }

  private BigInteger positiveAmount(String value, String message) {
    try {
      BigInteger amount = new BigInteger(value == null ? "" : value.trim());
      if (amount.signum() <= 0) throw new NumberFormatException("not positive");
      return amount;
    } catch (NumberFormatException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, message);
    }
  }

  private boolean validDecimals(Integer value) {
    return value != null && value >= 0 && value <= 30;
  }

  private void requireMatchingFields(JsonNode data, JsonNode message, String... fields) {
    if (!message.isObject()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order typed data is missing order terms.");
    }
    for (String field : fields) {
      if (!data.path(field).equals(message.path(field))) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Signed order terms do not match the submitted order.");
      }
    }
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

  private record Eip712Field(String name, String type) {}

}
