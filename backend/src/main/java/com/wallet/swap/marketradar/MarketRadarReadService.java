package com.wallet.swap.marketradar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MarketRadarReadService {
  private final MarketRadarPolicy policy;
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;
  private final MarketRadarWatchBudget budget;

  public MarketRadarReadService(
      MarketRadarPolicy policy,
      JdbcTemplate jdbc,
      ObjectMapper json,
      MarketRadarWatchBudget budget) {
    this.policy = policy;
    this.jdbc = jdbc;
    this.json = json;
    this.budget = budget;
  }

  public List<Map<String, String>> markets(String query) {
    policy.requireEnabled();
    if (query == null || !query.matches("[A-Za-z0-9/.-]{0,32}"))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid market.");
    return jdbc.query(
        """
        SELECT pair_key,venues::text FROM market_radar.markets WHERE audience='commercial'
          AND discovered_at>? AND pair_key ILIKE ? ORDER BY pair_key LIMIT 100
        """,
        (rs, row) -> Map.of("key", rs.getString("pair_key")),
        System.currentTimeMillis() - 600000,
        "%" + query + "%");
  }

  @Transactional(timeout = 5)
  public JsonNode snapshot(String pair) {
    policy.requireEnabled();
    if (pair == null || !pair.matches(MarketRadarModels.PAIR_PATTERN))
      throw new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid market.");
    Boolean available =
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM market_radar.markets WHERE pair_key=? AND"
                + " audience='commercial' AND discovered_at>?)",
            Boolean.class,
            pair,
            System.currentTimeMillis() - 600000);
    if (!Boolean.TRUE.equals(available))
      throw new ApiException(
          HttpStatus.NOT_FOUND, "This market does not have enough current coverage.");
    budget.reserve(pair);
    var rows =
        jdbc.query(
            "SELECT snapshot::text FROM market_radar.latest WHERE pair_key=? AND"
                + " audience='commercial' AND observed_at>?",
            (rs, row) -> rs.getString(1),
            pair,
            System.currentTimeMillis() - 15000);
    if (rows.isEmpty())
      return json.createObjectNode()
          .put("status", "BUILDING")
          .put("message", "Building observations for this market.");
    try {
      JsonNode snapshot = json.readTree(rows.get(0));
      if (!snapshot.path("freshness").asText().equals("LIVE"))
        return json.createObjectNode().put("status", "UNAVAILABLE");
      for (JsonNode venue : snapshot.path("venues"))
        if (!policy.permits(venue.path("venue").asText()))
          throw new ApiException(
              HttpStatus.SERVICE_UNAVAILABLE, "Live market intelligence temporarily unavailable");
      return snapshot;
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE, "Live market intelligence temporarily unavailable");
    }
  }
}
