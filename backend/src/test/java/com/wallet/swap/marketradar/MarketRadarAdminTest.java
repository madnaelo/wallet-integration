package com.wallet.swap.marketradar;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.wallet.swap.common.ApiErrorHandler;
import com.wallet.swap.config.FeatureProperties;
import com.wallet.swap.feature.AdminAuthService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MarketRadarAdminTest {
  @Test
  void internalFlagCannotEnableCommercialOrOtherVenues() {
    var internal = new MarketRadarInternalPolicy(true);
    var commercial = new MarketRadarPolicy(true);
    assertThat(internal.permits("binance")).isTrue();
    assertThat(internal.permits("bybit")).isFalse();
    assertThat(internal.permits("okx")).isFalse();
    assertThat(commercial.enabled()).isFalse();
    assertThat(commercial.permits("binance")).isFalse();
    assertThatThrownBy(new MarketRadarInternalPolicy(false)::requireEnabled)
        .hasMessageContaining("not enabled");
  }

  @Test
  void everyPrivateReadAuthenticatesBeforeAccessingResearch() throws Exception {
    var properties = new FeatureProperties();
    String key = "test-only-admin-key-".repeat(3);
    properties.setAdminApiKey(key);
    var read = mock(MarketRadarReadService.class);
    var controller =
        new MarketRadarAdminController(
            new AdminAuthService(properties), new MarketRadarInternalPolicy(true), read);
    var mvc =
        MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new ApiErrorHandler())
            .build();
    for (String path : new String[] {"/status", "/markets", "/snapshot?pair=ETH/USDT/SPOT"}) {
      mvc.perform(get("/api/admin/market-radar" + path)).andExpect(status().isUnauthorized());
      mvc.perform(get("/api/admin/market-radar" + path).header("X-Admin-Key", "wrong"))
          .andExpect(status().isUnauthorized());
      mvc.perform(
              get("/api/admin/market-radar" + path)
                  .header("Authorization", "Bearer wallet-session"))
          .andExpect(status().isUnauthorized());
    }
    verifyNoInteractions(read);
    mvc.perform(get("/api/admin/market-radar/status").header("X-Admin-Key", key))
        .andExpect(status().isOk());
    mvc.perform(get("/api/admin/market-radar/markets").header("X-Admin-Key", key))
        .andExpect(status().isOk());
    verify(read).researchMarkets("");
    mvc.perform(
            get("/api/admin/market-radar/snapshot?pair=ETH/USDT/SPOT").header("X-Admin-Key", key))
        .andExpect(status().isOk());
    verify(read).researchSnapshot("ETH/USDT/SPOT");
  }

  @Test
  void disabledPrivateFlagFailsClosedEvenWithValidAdminKey() {
    var properties = new FeatureProperties();
    properties.setAdminApiKey("test-key");
    var read = mock(MarketRadarReadService.class);
    var controller =
        new MarketRadarAdminController(
            new AdminAuthService(properties), new MarketRadarInternalPolicy(false), read);
    assertThatThrownBy(() -> controller.markets("test-key", ""))
        .hasMessageContaining("not enabled");
    verifyNoInteractions(read);
  }
}
