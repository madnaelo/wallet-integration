package com.wallet.swap.revenue;

import com.wallet.swap.auth.AuthService;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.AdminAuthService;
import com.wallet.swap.revenue.RevenueModels.Envelope;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class RevenueController {
  private final RevenueService service;
  private final RevenueRepository repository;
  private final AdminAuthService admin;
  private final AuthService auth;
  public RevenueController(RevenueService service, RevenueRepository repository, AdminAuthService admin, AuthService auth) {
    this.service = service;
    this.repository = repository;
    this.admin = admin;
    this.auth = auth;
  }

  @PostMapping("/api/internal/revenue/quotes")
  public Map<String, Boolean> ingest(@Valid @RequestBody Envelope envelope) {
    service.ingest(envelope);
    return Map.of("stored", true);
  }

  @PostMapping("/api/revenue/quotes/{id}/review")
  public Map<String, Boolean> review(@PathVariable UUID id,
      @RequestHeader(name="Authorization", required=false) String authorization, HttpServletRequest request) {
    service.review(auth.authenticateRequest(authorization, request), id);
    return Map.of("stored", true);
  }

  @GetMapping("/api/admin/revenue")
  public Map<String, Object> report(@RequestHeader(name="X-Admin-Key", required=false) String key,
      @RequestParam Instant from, @RequestParam Instant until, @RequestParam(defaultValue="day") String bucket) {
    admin.requireAdminApiKey(key);
    window(from, until);
    if (!Set.of("day","week","month").contains(bucket)) throw invalid();
    return repository.report(from, until, bucket);
  }

  @GetMapping("/api/admin/revenue/records")
  public List<Map<String, Object>> records(@RequestHeader(name="X-Admin-Key", required=false) String key,
      @RequestParam Instant from, @RequestParam Instant until, @RequestParam(defaultValue="0") int offset) {
    admin.requireAdminApiKey(key);
    window(from, until);
    if (offset < 0 || offset > 10000) throw invalid();
    return repository.records(from, until, offset);
  }

  @GetMapping("/api/admin/revenue/records/{id}/evidence")
  public List<Map<String, Object>> evidence(@RequestHeader(name="X-Admin-Key", required=false) String key, @PathVariable UUID id) {
    admin.requireAdminApiKey(key);
    return repository.evidence(id);
  }

  private void window(Instant from, Instant until) {
    if (!until.isAfter(from) || Duration.between(from, until).compareTo(Duration.ofDays(93)) > 0
        || until.isAfter(Instant.now().plusSeconds(60))) throw invalid();
  }
  private ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "Choose a valid reporting window of at most 93 days."); }
}
