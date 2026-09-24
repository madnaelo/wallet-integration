package com.wallet.swap.growth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.wallet.swap.contact.ContactSubmissionRepository;
import com.wallet.swap.feature.AdminAuthService;
import com.wallet.swap.ops.ExpiredDataRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfEnvironmentVariable(named="REVENUE_TEST_DATABASE_URL", matches="jdbc:postgresql://.+/(wallet_ci|wallet_revenue_test)")
class GrowthDatabaseTest {
  private static String schema;
  private static JdbcTemplate root;
  private static JdbcTemplate jdbc;

  @BeforeAll static void migrateIsolatedSchema() {
    String url = System.getenv("REVENUE_TEST_DATABASE_URL");
    String user = System.getenv("REVENUE_TEST_DATABASE_USERNAME");
    String password = System.getenv("REVENUE_TEST_DATABASE_PASSWORD");
    schema = "growth_test_" + UUID.randomUUID().toString().replace("-", "");
    root = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
    root.execute("CREATE SCHEMA " + schema);
    var source = new DriverManagerDataSource(url + "?currentSchema=" + schema, user, password);
    Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
        .placeholders(Map.of("marketRadarSchema", schema + "_radar")).cleanDisabled(true).load().migrate();
    jdbc = new JdbcTemplate(source);
  }

  @AfterAll static void cleanupOwnSchemasOnly() {
    if (root != null && schema != null && schema.matches("growth_test_[0-9a-f]{32}")) {
      root.execute("DROP SCHEMA IF EXISTS " + schema + "_radar CASCADE");
      root.execute("DROP SCHEMA " + schema + " CASCADE");
    }
  }

  @BeforeEach void clearOwnTestData() { jdbc.execute("TRUNCATE growth_events, contact_submissions"); }

  @Test void eventRetriesDoNotDoubleCountAndCleanupIsBounded() {
    var controller = new GrowthController(jdbc, mock(AdminAuthService.class));
    var event = new GrowthController.Event(UUID.randomUUID(), "landing", "/business", null);
    controller.event(event); controller.event(event);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM growth_events", Integer.class)).isEqualTo(1);
    controller.event(new GrowthController.Event(UUID.randomUUID(), "demo_cta", "/business", null));
    jdbc.execute("UPDATE growth_events SET created_at=now()-interval '91 days'");
    controller.event(new GrowthController.Event(UUID.randomUUID(), "landing", "/for-wallets", null));
    var retention = new ExpiredDataRepository(jdbc);
    assertThat(retention.deleteOldGrowthEvents(Instant.now().minus(90, ChronoUnit.DAYS), 1)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM growth_events", Integer.class)).isEqualTo(2);
    assertThat(controller.report("test-only", 30).get("events").toString()).contains("/for-wallets").doesNotContain("/business");
  }

  @Test void contactAttributionRoundTripsWithoutChangingDedupeOrCountingBrowserConversions() {
    var contacts = new ContactSubmissionRepository(jdbc);
    UUID id = UUID.randomUUID();
    assertThat(contacts.insert(id, "test-dedupe", "Test", "qa@example.test", "partnership", "Synthetic test enquiry")).isTrue();
    var attribution = GrowthAttribution.sanitize(new GrowthAttribution("/for-web3-agencies", "github", "outreach", "email", "agency_pilot", "branded-demo"));
    contacts.saveAttribution(id, attribution);
    assertThat(contacts.insert(UUID.randomUUID(), "test-dedupe", "Test", "qa@example.test", "partnership", "Synthetic test enquiry")).isFalse();
    assertThat(contacts.list(null, 10)).hasSize(1);
    assertThat(contacts.list(null, 10).get(0).attribution()).isEqualTo(attribution);
    var controller = new GrowthController(jdbc, mock(AdminAuthService.class));
    assertThat(controller.report("test-only", 30).get("enquiries").toString()).contains("submissions=1", "branded-demo");
    contacts.updateStatus(id, "spam");
    assertThat(controller.report("test-only", 30).get("enquiries").toString()).isEqualTo("[]");
  }
}
