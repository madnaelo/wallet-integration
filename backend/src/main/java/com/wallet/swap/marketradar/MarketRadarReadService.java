package com.wallet.swap.marketradar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MarketRadarReadService {
  private final MarketRadarPolicy policy;
  private final MarketRadarInternalPolicy internal;
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;
  private final MarketRadarWatchBudget budget;

  public MarketRadarReadService(
      MarketRadarPolicy policy,
      MarketRadarInternalPolicy internal,
      JdbcTemplate jdbc,
      ObjectMapper json,
      MarketRadarWatchBudget budget) {
    this.policy = policy;
    this.internal = internal;
    this.jdbc = jdbc;
    this.json = json;
    this.budget = budget;
  }

  public List<Map<String, String>> markets(String query) {
    policy.requireEnabled();
    return markets(query, "commercial", false);
  }

  public List<Map<String, String>> researchMarkets(String query) {
    internal.requireEnabled();
    return markets(query, "research", true);
  }

  private List<Map<String, String>> markets(String query, String audience, boolean binanceOnly) {
    if (query == null || !query.matches("[A-Za-z0-9/.-]{0,32}"))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid market.");
    return jdbc.query(
        """
        SELECT m.pair_key FROM market_radar.markets m
        LEFT JOIN market_radar.latest l ON l.pair_key=m.pair_key AND l.audience=m.audience
        WHERE m.audience=? AND m.discovered_at>? AND m.pair_key ILIKE ?
          AND (NOT ? OR m.venues='["binance"]'::jsonb)
        ORDER BY (COALESCE(l.observed_at,0)>?) DESC,m.pair_key LIMIT 100
        """,
        (rs, row) -> Map.of("key", rs.getString("pair_key")),
        audience,
        System.currentTimeMillis() - 600000,
        "%" + query + "%",
        binanceOnly,
        System.currentTimeMillis() - 15000);
  }

  @Transactional(timeout = 5)
  public JsonNode snapshot(String pair) {
    policy.requireEnabled();
    return snapshot(pair, "commercial", policy::permits);
  }

  @Transactional(timeout = 5)
  public JsonNode researchSnapshot(String pair) {
    internal.requireEnabled();
    return snapshot(pair, "research", internal::permits);
  }

  private JsonNode snapshot(String pair, String audience, Predicate<String> permits) {
    if (pair == null || !pair.matches(MarketRadarModels.PAIR_PATTERN))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid market.");
    Boolean available =
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM market_radar.markets WHERE pair_key=? AND audience=? AND"
                + " discovered_at>? AND (?<>'research' OR venues='[\"binance\"]'::jsonb))",
            Boolean.class,
            pair,
            audience,
            System.currentTimeMillis() - 600000,
            audience);
    if (!Boolean.TRUE.equals(available))
      throw new ApiException(
          HttpStatus.NOT_FOUND, "This market does not have enough current coverage.");
    if ("research".equals(audience)) budget.reserveResearch(pair);
    else budget.reserve(pair);
    var rows =
        jdbc.query(
            "SELECT snapshot::text FROM market_radar.latest WHERE pair_key=? AND"
                + " audience=? AND observed_at>? AND octet_length(snapshot::text)<=131072",
            (rs, row) -> rs.getString(1),
            pair,
            audience,
            System.currentTimeMillis() - 15000);
    if (rows.isEmpty())
      return json.createObjectNode()
          .put("status", "BUILDING")
          .put("message", "Building observations for this market.");
    try {
      JsonNode snapshot = json.readTree(rows.get(0));
      if (!snapshot.path("freshness").asText().equals("LIVE"))
        return json.createObjectNode().put("status", "UNAVAILABLE");
      if (!snapshot.isObject()
          || !snapshot.path("venues").isArray()
          || snapshot.path("venues").isEmpty()
          || snapshot.path("observedAt").asLong() < System.currentTimeMillis() - 15000
          || snapshot.path("observedAt").asLong() > System.currentTimeMillis() + 5000)
        throw unavailable();
      validateVenues(snapshot.path("venues"), permits);
      for (String field : List.of("supplyZones", "demandZones", "previousZones")) {
        if (!snapshot.path(field).isArray()) throw unavailable();
        for (JsonNode zone : snapshot.path(field)) {
          if (!zone.path("venues").isArray() || zone.path("venues").isEmpty()) throw unavailable();
          validateVenues(zone.path("venues"), permits);
        }
      }
      // Only engine-derived output, never arbitrary collector data or raw books.
      var result = ((com.fasterxml.jackson.databind.node.ObjectNode) snapshot).deepCopy();
      result.retain(
          List.of(
              "instrument",
              "referencePrice",
              "observedAt",
              "freshness",
              "calculatedAt",
              "coverage",
              "reason",
              "scoringVersion",
              "scoringConfiguration",
              "supplyZones",
              "demandZones",
              "previousZones",
              "venues",
              "cvd",
              "volumeProfile",
              "priceStructure",
              "scoreMeaning"));
      return result;
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "Live market intelligence temporarily unavailable");
    }
  }

  private void validateVenues(JsonNode venues, Predicate<String> permits) {
    for (JsonNode venue : venues)
      if (!permits.test(venue.path("venue").asText())) throw unavailable();
  }

  private ApiException unavailable() {
    return new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE, "Live market intelligence temporarily unavailable");
  }
}
