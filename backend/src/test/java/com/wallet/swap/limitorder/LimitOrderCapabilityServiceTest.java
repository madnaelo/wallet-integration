package com.wallet.swap.limitorder;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.config.LimitOrderProperties;
import com.wallet.swap.limitorder.LimitOrderModels.LimitOrderCapabilityRequest;
import org.junit.jupiter.api.Test;

class LimitOrderCapabilityServiceTest {
  private static final String WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  private static final String USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  private final LimitOrderProperties properties = enabledProperties();
  private final LimitOrderCapabilityService service = new LimitOrderCapabilityService(properties);

  @Test
  void prefersCowProtocolWhenChainIsSupported() {
    var response = service.check(request(1L, WETH, USDT));

    assertThat(response.automaticExecutionSupported()).isTrue();
    assertThat(response.executionProvider()).isEqualTo(LimitOrderCapabilityService.COW_PROTOCOL_PROVIDER);
  }

  @Test
  void fallsBackToOneInchWhenCowDoesNotSupportChain() {
    var response = service.check(request(10L, WETH, USDT));

    assertThat(response.automaticExecutionSupported()).isTrue();
    assertThat(response.executionProvider()).isEqualTo(LimitOrderCapabilityService.ONEINCH_PROVIDER);
  }

  @Test
  void doesNotOfferOneInchWhenCommercialAccessIsDisabled() {
    properties.setOneinchOrderbookEnabled(false);

    var response = service.check(request(10L, WETH, USDT));

    assertThat(response.automaticExecutionSupported()).isFalse();
    assertThat(response.executionProvider()).isEqualTo("none");
  }

  @Test
  void keepsNativeAssetsOnAlerts() {
    var response = service.check(request(1L, "eth", USDT));

    assertThat(response.automaticExecutionSupported()).isFalse();
    assertThat(response.executionProvider()).isEqualTo("none");
  }

  private LimitOrderCapabilityRequest request(long chainId, String sellToken, String buyToken) {
    return new LimitOrderCapabilityRequest(
        chainId,
        sellToken,
        "SELL",
        18,
        buyToken,
        "BUY",
        6);
  }

  private static LimitOrderProperties enabledProperties() {
    var properties = new LimitOrderProperties();
    properties.setOneinchOrderbookEnabled(true);
    return properties;
  }
}
