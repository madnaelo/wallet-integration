package com.wallet.swap.marketradar;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.swap.feature.AdminAuthService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/market-radar")
public class MarketRadarAdminController {
  private final AdminAuthService auth;
  private final MarketRadarInternalPolicy internal;
  private final MarketRadarReadService read;

  public MarketRadarAdminController(
      AdminAuthService auth, MarketRadarInternalPolicy internal, MarketRadarReadService read) {
    this.auth = auth;
    this.internal = internal;
    this.read = read;
  }

  @GetMapping("/status")
  public Map<String, Object> status(
      @RequestHeader(name = "X-Admin-Key", required = false) String key) {
    authorize(key);
    return Map.of(
        "mode",
        "PRIVATE / INTERNAL LIVE DATA",
        "audience",
        "research",
        "venues",
        List.of("binance"));
  }

  @GetMapping("/markets")
  public List<Map<String, String>> markets(
      @RequestHeader(name = "X-Admin-Key", required = false) String key,
      @RequestParam(defaultValue = "") String q) {
    authorize(key);
    return read.researchMarkets(q);
  }

  @GetMapping("/snapshot")
  public JsonNode snapshot(
      @RequestHeader(name = "X-Admin-Key", required = false) String key,
      @RequestParam String pair) {
    authorize(key);
    return read.researchSnapshot(pair);
  }

  private void authorize(String key) {
    auth.requireAdminApiKey(key);
    internal.requireEnabled();
  }
}
