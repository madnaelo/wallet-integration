package com.wallet.swap.marketradar;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.marketradar.MarketRadarModels.*;
import com.wallet.swap.notification.NotificationOutboxRepository;
import com.wallet.swap.notification.NotificationPreferenceRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

class MarketRadarTest {
  @Test
  void publicFlagCannotGrantMarketDataRights() {
    var policy = new MarketRadarPolicy(true);
    assertThat(policy.enabled()).isFalse();
    assertThat(policy.permits("binance")).isFalse();
    assertThatThrownBy(policy::requireEnabled).hasMessageContaining("not available");
  }

  @Test
  void disabledCollectorsDoNotTouchTheSharedDatabaseOrExistingOutbox() {
    var jdbc = mock(JdbcTemplate.class);
    var outbox = mock(NotificationOutboxRepository.class);
    new MarketRadarDispatch(
            new MarketRadarPolicy(true),
            jdbc,
            mock(NotificationPreferenceRepository.class),
            outbox,
            new NotificationProperties(),
            new ObjectMapper(),
            mock(PlatformTransactionManager.class))
        .dispatch();
    verifyNoInteractions(jdbc, outbox);
  }

  @Test
  void deletionAlwaysScopesToAuthenticatedWalletEvenWhenFeatureIsOff() {
    var jdbc = mock(JdbcTemplate.class);
    var id = UUID.randomUUID();
    var alerts =
        new MarketRadarAlerts(
            new MarketRadarPolicy(false),
            jdbc,
            mock(WalletMutationLock.class),
            mock(MarketRadarWatchBudget.class));
    alerts.delete("wallet-a", id);
    verify(jdbc)
        .update(
            "DELETE FROM market_radar.alert_rules WHERE id=? AND wallet_address=?", id, "wallet-a");
  }

  @Test
  void eachNotificationIsAnalyticalAndLinksToTheMarketNotExecution() {
    var properties = new NotificationProperties();
    properties.setAppUrl("https://example.test/");
    for (var type : AlertType.values()) {
      var message =
          new RadarNotification(
              "TEST/USDT/SPOT",
              type,
              "SUPPLY",
              new BigDecimal("128.7"),
              new BigDecimal("130.1"),
              84,
              3,
              "ACTIVE",
              1,
              "event",
              84);
      var payload = MarketRadarMessages.push(properties, message);
      assertThat(payload.body())
          .contains("84/100", "not a guaranteed reversal")
          .doesNotContain("API", "SELL NOW", "BUY NOW");
      assertThat(payload.url())
          .isEqualTo("https://example.test/market-radar?pair=TEST%2FUSDT%2FSPOT");
      assertThat(payload.url()).doesNotContain("/swap", "execute");
    }
  }
}
