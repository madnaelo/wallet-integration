package com.wallet.swap.marketradar;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.marketradar.MarketRadarModels.AlertRequest;
import com.wallet.swap.marketradar.MarketRadarModels.AlertRule;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/market-radar")
public class MarketRadarController {
  private final AuthService auth;
  private final MarketRadarAlerts alerts;
  private final MarketRadarPolicy policy;
  private final MarketRadarReadService readService;

  public MarketRadarController(
      AuthService auth,
      MarketRadarAlerts alerts,
      MarketRadarPolicy policy,
      MarketRadarReadService readService) {
    this.auth = auth;
    this.alerts = alerts;
    this.policy = policy;
    this.readService = readService;
  }

  @GetMapping("/status")
  public Map<String, Boolean> status() {
    return Map.of("liveEnabled", policy.enabled());
  }

  @GetMapping("/markets")
  public List<Map<String, String>> markets(@RequestParam(defaultValue = "") String q) {
    return readService.markets(q);
  }

  @GetMapping("/snapshot")
  public com.fasterxml.jackson.databind.JsonNode snapshot(@RequestParam String pair) {
    return readService.snapshot(pair);
  }

  @GetMapping("/alerts")
  public List<AlertRule> list(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest request) {
    return alerts.list(auth.authenticateRequest(authorization, request));
  }

  @PostMapping("/alerts")
  public AlertRule save(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest request,
      @Valid @RequestBody AlertRequest body) {
    return alerts.save(auth.authenticateRequest(authorization, request), body);
  }

  @DeleteMapping("/alerts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @RequestHeader(name = "Authorization", required = false) String authorization,
      HttpServletRequest request,
      @PathVariable UUID id) {
    alerts.delete(auth.authenticateRequest(authorization, request), id);
  }
}
