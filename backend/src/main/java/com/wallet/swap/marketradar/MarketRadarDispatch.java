package com.wallet.swap.marketradar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.marketradar.MarketRadarModels.AlertType;
import com.wallet.swap.marketradar.MarketRadarModels.RadarNotification;
import com.wallet.swap.notification.NotificationOutboxRepository;
import com.wallet.swap.notification.NotificationPreferenceRepository;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class MarketRadarDispatch {
  private static final Logger LOG = LoggerFactory.getLogger(MarketRadarDispatch.class);
  private final MarketRadarPolicy policy;
  private final JdbcTemplate jdbc;
  private final NotificationPreferenceRepository preferences;
  private final NotificationOutboxRepository outbox;
  private final NotificationProperties properties;
  private final ObjectMapper json;
  private final TransactionTemplate transaction;
  private final AtomicBoolean running = new AtomicBoolean();

  public MarketRadarDispatch(
      MarketRadarPolicy policy,
      JdbcTemplate jdbc,
      NotificationPreferenceRepository preferences,
      NotificationOutboxRepository outbox,
      NotificationProperties properties,
      ObjectMapper json,
      PlatformTransactionManager transactions) {
    this.policy = policy;
    this.jdbc = jdbc;
    this.preferences = preferences;
    this.outbox = outbox;
    this.properties = properties;
    this.json = json;
    this.transaction = new TransactionTemplate(transactions);
    this.transaction.setTimeout(10);
  }

  @Scheduled(fixedDelayString = "${wallet.market-radar.alert-delay-ms:15000}")
  public void dispatch() {
    if (!policy.enabled() || !running.compareAndSet(false, true)) return;
    try {
      for (int i = 0; i < 3; i++) {
        if (!Boolean.TRUE.equals(transaction.execute(status -> dispatchBatch()))) break;
      }
    } catch (RuntimeException exception) {
      LOG.warn("Market Radar alert processing deferred; existing alert types are unaffected.");
    } finally {
      running.set(false);
    }
  }

  private boolean dispatchBatch() {
    jdbc.execute("SET LOCAL statement_timeout='2000ms'");
    jdbc.execute("SET LOCAL lock_timeout='500ms'");
    var events =
        jdbc.query(
            """
SELECT id,pair_key,event_type,payload::text,last_rule_id,observed_at FROM market_radar.events
WHERE audience='commercial' AND processed_at IS NULL ORDER BY observed_at LIMIT 1 FOR UPDATE SKIP LOCKED
""",
            (rs, row) ->
                new Event(
                    rs.getString("id"),
                    rs.getString("pair_key"),
                    rs.getString("event_type"),
                    rs.getString("payload"),
                    rs.getObject("last_rule_id", UUID.class),
                    rs.getLong("observed_at")));
    if (events.isEmpty()) return false;
    Event event = events.get(0);
    RadarNotification message = parse(event);
    if (message == null || System.currentTimeMillis() - event.observedAt() > 300000) {
      jdbc.update("UPDATE market_radar.events SET processed_at=now() WHERE id=?", event.id());
      return true;
    }
    var rules =
        jdbc.query(
            """
SELECT id,wallet_address,minimum_score,(last_notified_at IS NULL OR
  last_notified_at<=now()-cooldown_minutes*interval '1 minute') AS ready
FROM market_radar.alert_rules WHERE pair_key=? AND event_type=? AND (?::uuid IS NULL OR id>?::uuid)
ORDER BY id LIMIT 25 FOR UPDATE
""",
            (rs, row) ->
                new Target(
                    rs.getObject("id", UUID.class),
                    rs.getString("wallet_address"),
                    rs.getInt("minimum_score"),
                    rs.getBoolean("ready")),
            event.pair(),
            event.type(),
            event.cursor(),
            event.cursor());
    var formatted = MarketRadarMessages.push(properties, message);
    for (Target target : rules) {
      if (!target.ready() || message.qualifyingScore() < target.minimumScore()) continue;
      var preference = preferences.find(target.wallet());
      if (preference.isEmpty()) continue;
      var p = preference.get();
      boolean queued = false;
      String key = "radar:" + event.id() + ":" + target.id() + ":";
      String body = formatted.body() + "\n\n" + formatted.url();
      if (p.emailEnabled() && p.emailAddress() != null && properties.getEmail().isEnabled())
        queued |=
            outbox.enqueue(
                key + "email",
                "market_radar",
                "email",
                p.emailAddress(),
                formatted.title(),
                body,
                message);
      if (p.telegramEnabled() && p.telegramChatId() != null && properties.getTelegram().isEnabled())
        queued |=
            outbox.enqueue(
                key + "telegram",
                "market_radar",
                "telegram",
                p.telegramChatId(),
                formatted.title(),
                body,
                message);
      if (p.pushEnabled() && properties.getPush().isEnabled())
        queued |=
            outbox.enqueue(
                key + "push",
                "market_radar",
                "push",
                target.wallet(),
                formatted.title(),
                body,
                message);
      if (queued)
        jdbc.update(
            "UPDATE market_radar.alert_rules SET last_notified_at=now() WHERE id=?", target.id());
    }
    if (rules.size() < 25)
      jdbc.update("UPDATE market_radar.events SET processed_at=now() WHERE id=?", event.id());
    else
      jdbc.update(
          "UPDATE market_radar.events SET last_rule_id=? WHERE id=?",
          rules.get(rules.size() - 1).id(),
          event.id());
    return true;
  }

  private RadarNotification parse(Event event) {
    try {
      if (event.payload().length() > 131072
          || !event.pair().matches(MarketRadarModels.PAIR_PATTERN)) return null;
      JsonNode root = json.readTree(event.payload());
      JsonNode zone = root.path("zone");
      if (!root.path("pairKey").asText().equals(event.pair())
          || !root.path("type").asText().equals(event.type())) return null;
      int count = zone.path("venues").size();
      if (count < 1 || count > 3) return null;
      for (JsonNode venue : zone.path("venues"))
        if (!policy.permits(venue.path("venue").asText())) return null;
      int score = zone.path("strength").asInt(-1);
      BigDecimal lower = zone.path("lower").decimalValue(),
          upper = zone.path("upper").decimalValue();
      if (score < 0
          || score > 100
          || lower.signum() <= 0
          || lower.compareTo(upper) >= 0
          || upper.precision() > 40) return null;
      if (event.observedAt() > System.currentTimeMillis() + 2000) return null;
      int previousScore = root.path("previousStrength").asInt(score);
      if (previousScore < 0 || previousScore > 100) return null;
      return new RadarNotification(
          event.pair(),
          AlertType.valueOf(event.type()),
          zone.path("type").asText(),
          lower,
          upper,
          score,
          count,
          zone.path("lifecycle").asText(),
          event.observedAt(),
          event.id(),
          Math.max(score, previousScore));
    } catch (com.fasterxml.jackson.core.JsonProcessingException
        | IllegalArgumentException exception) {
      return null;
    }
  }

  private record Event(
      String id, String pair, String type, String payload, UUID cursor, long observedAt) {}

  private record Target(UUID id, String wallet, int minimumScore, boolean ready) {}
}
