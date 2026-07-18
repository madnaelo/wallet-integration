package com.wallet.swap.autoswap;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleRequest;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleTarget;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.feature.FeatureFlagService;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AutoSwapRuleServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final AutoSwapRuleRepository repository = mock(AutoSwapRuleRepository.class);
  private final WalletMutationLock walletMutationLock = mock(WalletMutationLock.class);
  private final AutoSwapRuleService service = new AutoSwapRuleService(
      featureFlagService,
      repository,
      walletMutationLock);

  @Test
  void checksFeatureFlagBeforeSaving() {
    AutoSwapRuleRequest request = evmRequest("2500", "above", "notify_to_confirm");

    service.save(WALLET, request);

    verify(featureFlagService).requirePriceAlertsEnabled();
  }

  @Test
  void rejectsTargetTooCloseToExistingActiveRule() {
    AutoSwapRuleRequest request = evmRequest("2509", "above", "notify_to_confirm");
    when(repository.listTargetsForPair(eq(WALLET), any()))
        .thenReturn(List.of(new AutoSwapRuleTarget(UUID.randomUUID(), new BigDecimal("2500"))));

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("at least 1% away");
  }

  @Test
  void storesEvmContractPairsAsConfirmationRules() {
    AutoSwapRuleRequest request = evmRequest("2525", "above", "notify_to_confirm");

    service.save(WALLET, request);

    verify(repository).insert(eq(WALLET), any(), eq("notify_to_confirm"), eq("confirmation_required"));
  }

  @Test
  void rejectsAutomaticExecutionMode() {
    AutoSwapRuleRequest request = nativeRequest("2525", "above", "auto_when_supported");

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("Invalid alert mode");
  }

  @Test
  void rejectsSlippageAboveTenPercent() {
    AutoSwapRuleRequest request = evmRequest("2525", "above", "notify_to_confirm", 1_001);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Slippage tolerance must be between 0% and 10%.");
  }

  @Test
  void rejectsNewAlertsAtThePerWalletLimit() {
    AutoSwapRuleRequest request = evmRequest("2525", "above", "notify_to_confirm");
    when(repository.countForWallet(WALLET)).thenReturn(250);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("price-alert limit");

    verify(walletMutationLock).lock(WALLET);
    verify(repository, never()).insert(any(), any(), any(), any());
  }

  private AutoSwapRuleRequest evmRequest(String thresholdRate, String direction, String executionMode) {
    return evmRequest(thresholdRate, direction, executionMode, 100);
  }

  private AutoSwapRuleRequest evmRequest(
      String thresholdRate,
      String direction,
      String executionMode,
      int slippageBps) {
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
        slippageBps,
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
