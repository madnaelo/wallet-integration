package com.wallet.swap.autoswap;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleResponse;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleTarget;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AutoSwapRuleService {
  private static final Set<String> ALERT_DIRECTIONS = Set.of("above", "below");
  private static final String CONFIRMATION_REQUIRED = "confirmation_required";
  private static final String NOTIFY_TO_CONFIRM = "notify_to_confirm";
  private static final Set<String> EXECUTION_MODES = Set.of(NOTIFY_TO_CONFIRM);
  private static final BigDecimal MIN_TARGET_GAP_RATIO = new BigDecimal("0.01");
  private static final BigDecimal MIN_TARGET_GAP_FLOOR = new BigDecimal("0.000000000000000001");

  private final FeatureFlagService featureFlagService;
  private final AutoSwapRuleRepository repository;

  public AutoSwapRuleService(FeatureFlagService featureFlagService, AutoSwapRuleRepository repository) {
    this.featureFlagService = featureFlagService;
    this.repository = repository;
  }

  public List<AutoSwapRuleResponse> list(String walletAddress) {
    featureFlagService.requirePriceAlertsEnabled();
    return repository.listForWallet(walletAddress);
  }

  public AutoSwapRuleResponse save(String walletAddress, AutoSwapRuleRequest request) {
    featureFlagService.requirePriceAlertsEnabled();
    validate(request);
    AutoSwapRuleRequest normalized = normalized(request);
    validateTargetSpacing(walletAddress, normalized);

    return repository.insert(walletAddress, normalized, NOTIFY_TO_CONFIRM, CONFIRMATION_REQUIRED);
  }

  public void delete(String walletAddress, UUID id) {
    featureFlagService.requirePriceAlertsEnabled();
    repository.delete(walletAddress, id);
  }

  private void validate(AutoSwapRuleRequest request) {
    if (request.chainId() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Network is required.");
    }
    if (request.sellTokenAddress() == null || request.buyTokenAddress() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose two different tokens.");
    }
    if (request.sellTokenDecimals() == null || request.buyTokenDecimals() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Token decimals are required.");
    }
    if (request.sellTokenAddress().trim().equalsIgnoreCase(request.buyTokenAddress().trim())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose two different tokens.");
    }
    if (request.sellAmountRaw() == null || !request.sellAmountRaw().trim().matches("^[0-9]+$")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Enter a valid amount.");
    }
    if (new java.math.BigInteger(request.sellAmountRaw().trim()).signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Amount must be greater than zero.");
    }

    String direction = normalizeDirection(request.alertDirection());
    if (!ALERT_DIRECTIONS.contains(direction)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Alert direction must be above or below.");
    }
    if (request.thresholdRate() == null || request.thresholdRate().signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target rate must be greater than zero.");
    }
    if (request.slippageBps() == null || request.slippageBps() < 0 || request.slippageBps() > 1_000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Slippage tolerance must be between 0% and 10%.");
    }
    String executionMode = normalizeBlank(request.executionMode(), NOTIFY_TO_CONFIRM);
    if (!EXECUTION_MODES.contains(executionMode)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid alert mode.");
    }
    if (request.recipientAddress() == null || request.recipientAddress().isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Recipient address is required.");
    }
  }

  private void validateTargetSpacing(String walletAddress, AutoSwapRuleRequest request) {
    for (AutoSwapRuleTarget existing : repository.listTargetsForPair(walletAddress, request)) {
      BigDecimal existingTarget = existing.thresholdRate();
      BigDecimal minimumGap = existingTarget.min(request.thresholdRate())
          .multiply(MIN_TARGET_GAP_RATIO)
          .setScale(18, RoundingMode.HALF_UP)
          .max(MIN_TARGET_GAP_FLOOR);
      BigDecimal actualGap = existingTarget.subtract(request.thresholdRate()).abs();
      if (actualGap.compareTo(minimumGap) < 0) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "Use a target at least 1% away from another alert for this pair and direction.");
      }
    }
  }

  private AutoSwapRuleRequest normalized(AutoSwapRuleRequest request) {
    return new AutoSwapRuleRequest(
        request.chainId(),
        request.sellTokenAddress().trim(),
        request.sellTokenSymbol().trim(),
        request.sellTokenDecimals(),
        request.buyTokenAddress().trim(),
        request.buyTokenSymbol().trim(),
        request.buyTokenDecimals(),
        request.sellAmountRaw().trim(),
        request.thresholdRate(),
        normalizeDirection(request.alertDirection()),
        request.slippageBps(),
        request.recipientAddress().trim(),
        NOTIFY_TO_CONFIRM);
  }

  private String normalizeDirection(String direction) {
    return normalizeBlank(direction, "above");
  }

  private String normalizeBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim().toLowerCase();
  }
}
