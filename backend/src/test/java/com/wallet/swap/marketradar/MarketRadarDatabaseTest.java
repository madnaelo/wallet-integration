package com.wallet.swap.marketradar;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.marketradar.MarketRadarModels.*;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.NotificationOutboxRepository;
import com.wallet.swap.notification.NotificationPreferenceRepository;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(
    named = "REVENUE_TEST_DATABASE_URL",
    matches =
        "jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/(wallet_ci|wallet_revenue_test)")
class MarketRadarDatabaseTest {
  private static final String WALLET = "0x" + "a".repeat(40);
  private static JdbcTemplate jdbc;
  private static JdbcTemplate root;
  private static String schema;
  private static TransactionTemplate transaction;
  private static DataSourceTransactionManager transactions;
  private static MarketRadarPolicy policy;
  private static MarketRadarAlerts alerts;
  private static final ObjectMapper JSON = new ObjectMapper();

  @BeforeAll
  static void migrate() {
    String url = System.getenv("REVENUE_TEST_DATABASE_URL"),
        user = System.getenv("REVENUE_TEST_DATABASE_USERNAME"),
        password = System.getenv("REVENUE_TEST_DATABASE_PASSWORD");
    schema = "radar_test_" + UUID.randomUUID().toString().replace("-", "");
    root = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
    root.execute("CREATE SCHEMA " + schema);
    var source = new DriverManagerDataSource(url + "?currentSchema=" + schema, user, password);
    Flyway.configure()
        .dataSource(source)
        .schemas(schema)
        .defaultSchema(schema)
        .placeholders(Map.of("marketRadarSchema", "market_radar"))
        .cleanDisabled(true)
        .load()
        .migrate();
    jdbc = new JdbcTemplate(source);
    transactions = new DataSourceTransactionManager(source);
    transaction = new TransactionTemplate(transactions);
    policy = mock(MarketRadarPolicy.class);
    when(policy.enabled()).thenReturn(true);
    when(policy.permits("binance")).thenReturn(true);
    alerts =
        new MarketRadarAlerts(
            policy, jdbc, new WalletMutationLock(jdbc), new MarketRadarWatchBudget(jdbc, 2));
    jdbc.update("INSERT INTO wallet_users(wallet_address) VALUES(?)", WALLET);
  }

  @AfterAll
  static void cleanup() {
    if (root != null && schema != null && schema.matches("radar_test_[0-9a-f]{32}")) {
      root.execute("DROP SCHEMA IF EXISTS market_radar CASCADE");
      root.execute("DROP SCHEMA " + schema + " CASCADE");
    }
  }

  @BeforeEach
  void reset() {
    jdbc.execute(
        "TRUNCATE"
            + " market_radar.latest,market_radar.alert_rules,market_radar.watches,market_radar.events,notification_outbox");
    jdbc.update(
        "INSERT INTO market_radar.latest(pair_key,audience,observed_at,snapshot)"
            + " VALUES('TEST/USDT/SPOT','commercial',?,?::jsonb)",
        System.currentTimeMillis(),
        "{\"freshness\":\"LIVE\",\"coverage\":\"NORMAL_COVERAGE\"}");
  }

  private AlertRule rule(AlertType type) {
    return transaction.execute(
        status -> alerts.save(WALLET, new AlertRequest("TEST/USDT/SPOT", type, 60, 60)));
  }

  @Test
  void walletScopedIdempotencyAndSubscriptionBudget() {
    var first = rule(AlertType.SUPPLY_APPROACHED);
    var second = rule(AlertType.SUPPLY_APPROACHED);
    assertThat(second.id()).isEqualTo(first.id());
    assertThat(alerts.list(WALLET)).hasSize(1);
    assertThat(alerts.list("other-wallet")).isEmpty();
    alerts.delete("other-wallet", first.id());
    assertThat(alerts.list(WALLET)).hasSize(1);
    var budget = new MarketRadarWatchBudget(jdbc, 1);
    assertThatThrownBy(
            () -> transaction.executeWithoutResult(status -> budget.reserve("OTHER/USDT/SPOT")))
        .hasMessageContaining("full");
    alerts.delete(WALLET, first.id());
    assertThat(alerts.list(WALLET)).isEmpty();
  }

  @Test
  void staleOrResearchOnlyDataCannotCreateAlerts() {
    jdbc.update("UPDATE market_radar.latest SET audience='research'");
    assertThatThrownBy(() -> rule(AlertType.SUPPLY_APPROACHED)).hasMessageContaining("coverage");
    assertThat(alerts.list(WALLET)).isEmpty();
  }

  @Test
  void materialEventsUseExistingOutboxOnceAndRespectCooldowns() throws Exception {
    rule(AlertType.ZONE_WEAKENED);
    var preferences = mock(NotificationPreferenceRepository.class);
    when(preferences.find(WALLET))
        .thenReturn(
            Optional.of(
                new NotificationPreferenceResponse(
                    WALLET, "test@example.test", true, "123", true, true, 1, 100, false, 500, 60)));
    var properties = new NotificationProperties();
    properties.getEmail().setEnabled(true);
    properties.getTelegram().setEnabled(true);
    properties.getPush().setEnabled(true);
    var dispatch =
        new MarketRadarDispatch(
            policy,
            jdbc,
            preferences,
            new NotificationOutboxRepository(jdbc, JSON),
            properties,
            JSON,
            transactions);
    for (int i = 0; i < 2; i++) {
      String id = String.valueOf(i).repeat(64);
      var payload =
          JSON.createObjectNode()
              .put("id", id)
              .put("pairKey", "TEST/USDT/SPOT")
              .put("type", "ZONE_WEAKENED")
              .put("previousStrength", 84);
      var zone =
          payload
              .putObject("zone")
              .put("strength", 43)
              .put("lower", 128.7)
              .put("upper", 130.1)
              .put("type", "SUPPLY")
              .put("lifecycle", "WEAKENING");
      zone.putArray("venues").addObject().put("venue", "binance");
      jdbc.update(
          "INSERT INTO market_radar.events(id,pair_key,audience,observed_at,event_type,payload)"
              + " VALUES(?,'TEST/USDT/SPOT','commercial',?,'ZONE_WEAKENED',?::jsonb)",
          id,
          System.currentTimeMillis(),
          JSON.writeValueAsString(payload));
      dispatch.dispatch();
      dispatch.dispatch();
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM notification_outbox WHERE notification_kind='market_radar'",
                Integer.class))
        .isEqualTo(3);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM market_radar.events WHERE processed_at IS NOT NULL",
                Integer.class))
        .isEqualTo(2);
  }
}
