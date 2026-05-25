package com.wallet.swap.autoswap;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleTarget;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.FeatureFlagService;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AutoSwapRuleServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final AutoSwapRuleRepository repository = mock(AutoSwapRuleRepository.class);
  private final AutoSwapRuleService service = new AutoSwapRuleService(featureFlagService, repository);

  @Test
  void checksFeatureFlagBeforeSaving() {
    AutoSwapRuleRequest request = evmRequest("2500", "above", "auto_when_supported");

    service.save(WALLET, request);

    verify(featureFlagService).requireAutoSwapEnabled();
  }

  @Test
  void rejectsTargetTooCloseToExistingActiveRule() {
    AutoSwapRuleRequest request = evmRequest("2509", "above", "auto_when_supported");
    when(repository.listTargetsForPair(eq(WALLET), any()))
        .thenReturn(List.of(new AutoSwapRuleTarget(UUID.randomUUID(), new BigDecimal("2500"))));

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("at least 1% away");
  }

  @Test
  void storesEvmContractPairsAsAutoSupportedWhenRequested() {
    AutoSwapRuleRequest request = evmRequest("2525", "above", "auto_when_supported");

    service.save(WALLET, request);

    verify(repository).insert(eq(WALLET), any(), eq("auto_when_supported"), eq("auto_supported"));
  }

  @Test
  void storesNativeOrNonContractPairsAsConfirmationRules() {
    AutoSwapRuleRequest request = nativeRequest("2525", "above", "auto_when_supported");

    service.save(WALLET, request);

    verify(repository).insert(eq(WALLET), any(), eq("notify_to_confirm"), eq("confirmation_required"));
  }

  private AutoSwapRuleRequest evmRequest(String thresholdRate, String direction, String executionMode) {
    return new AutoSwapRuleRequest(
        1L,
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "WETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        "1000000000000000000",
        new BigDecimal(thresholdRate),
        direction,
        100,
        "0x0000000000000000000000000000000000000001",
        executionMode);
  }

  private AutoSwapRuleRequest nativeRequest(String thresholdRate, String direction, String executionMode) {
    return new AutoSwapRuleRequest(
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        "1000000000000000000",
        new BigDecimal(thresholdRate),
        direction,
        100,
        "0x0000000000000000000000000000000000000001",
        executionMode);
  }
}
