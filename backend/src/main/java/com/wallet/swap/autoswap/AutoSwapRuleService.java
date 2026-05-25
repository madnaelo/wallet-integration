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
  private static final Set<String> EXECUTION_MODES = Set.of("auto_when_supported", "notify_to_confirm");
  private static final String AUTO_SUPPORTED = "auto_supported";
  private static final String CONFIRMATION_REQUIRED = "confirmation_required";
  private static final String AUTO_WHEN_SUPPORTED = "auto_when_supported";
  private static final String NOTIFY_TO_CONFIRM = "notify_to_confirm";
  private static final BigDecimal MIN_TARGET_GAP_RATIO = new BigDecimal("0.01");
  private static final BigDecimal MIN_TARGET_GAP_FLOOR = new BigDecimal("0.000000000000000001");

  private final FeatureFlagService featureFlagService;
  private final AutoSwapRuleRepository repository;

  public AutoSwapRuleService(FeatureFlagService featureFlagService, AutoSwapRuleRepository repository) {
    this.featureFlagService = featureFlagService;
    this.repository = repository;
  }

  public List<AutoSwapRuleResponse> list(String walletAddress) {
    featureFlagService.requireAutoSwapEnabled();
    return repository.listForWallet(walletAddress);
  }

  public AutoSwapRuleResponse save(String walletAddress, AutoSwapRuleRequest request) {
    featureFlagService.requireAutoSwapEnabled();
    validate(request);
    AutoSwapRuleRequest normalized = normalized(request);
    validateTargetSpacing(walletAddress, normalized);

    String readiness = determineExecutionReadiness(normalized);
    String mode = normalizeExecutionMode(normalized.executionMode(), readiness);
    return repository.insert(walletAddress, normalized, mode, readiness);
  }

  public void delete(String walletAddress, UUID id) {
    featureFlagService.requireAutoSwapEnabled();
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
      throw new ApiException(HttpStatus.BAD_REQUEST, "Amount must be a positive base-unit value.");
    }
    if (new java.math.BigInteger(request.sellAmountRaw().trim()).signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Amount must be greater than zero.");
    }

    String direction = normalizeDirection(request.alertDirection());
    if (!ALERT_DIRECTIONS.contains(direction)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Auto Swap direction must be above or below.");
    }
    if (request.thresholdRate() == null || request.thresholdRate().signum() <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target rate must be greater than zero.");
    }
    if (request.slippageBps() == null || request.slippageBps() < 0 || request.slippageBps() > 10_000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Slippage tolerance must be between 0% and 100%.");
    }
    String executionMode = normalizeBlank(request.executionMode(), AUTO_WHEN_SUPPORTED);
    if (!EXECUTION_MODES.contains(executionMode)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid Auto Swap execution mode.");
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
            "Use a target at least 1% away from another Auto Swap rule for this pair and direction.");
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
        normalizeBlank(request.executionMode(), AUTO_WHEN_SUPPORTED));
  }

  private String normalizeExecutionMode(String requestedMode, String readiness) {
    String mode = normalizeBlank(requestedMode, AUTO_WHEN_SUPPORTED);
    if (!AUTO_SUPPORTED.equals(readiness)) return NOTIFY_TO_CONFIRM;
    return mode;
  }

  private String determineExecutionReadiness(AutoSwapRuleRequest request) {
    if (isEvmContractAddress(request.sellTokenAddress()) && isEvmContractAddress(request.buyTokenAddress())) {
      return AUTO_SUPPORTED;
    }
    return CONFIRMATION_REQUIRED;
  }

  private boolean isEvmContractAddress(String value) {
    return value != null && value.trim().matches("^0x[0-9a-fA-F]{40}$");
  }

  private String normalizeDirection(String direction) {
    return normalizeBlank(direction, "above");
  }

  private String normalizeBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim().toLowerCase();
  }
}
