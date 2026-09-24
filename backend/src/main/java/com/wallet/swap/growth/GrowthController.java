package com.wallet.swap.growth;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.AdminAuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class GrowthController {
  private final JdbcTemplate jdbc;
  private final AdminAuthService auth;
  public GrowthController(JdbcTemplate jdbc, AdminAuthService auth) { this.jdbc = jdbc; this.auth = auth; }
  public record Event(@NotNull UUID id, @NotNull @Size(max=20) String event,
      @NotNull @Size(max=100) String page, @Valid GrowthAttribution attribution) {}

  @PostMapping("/api/growth/events")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void event(@Valid @RequestBody Event request) {
    if (!java.util.Set.of("landing", "demo_cta", "contact_opened").contains(request.event())
        || !GrowthAttribution.PAGES.contains(request.page()) || request.page().equals("/demo")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported event.");
    }
    var a = GrowthAttribution.sanitize(request.attribution());
    jdbc.update("""
        INSERT INTO growth_events(id,event,page,landing_page,referrer_group,utm_source,utm_medium,utm_campaign)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING
        """, request.id(), request.event(), request.page(), a.landingPage(), a.referrer(), a.utmSource(), a.utmMedium(), a.utmCampaign());
  }

  @GetMapping("/api/admin/growth")
  public Map<String, Object> report(@RequestHeader(name="X-Admin-Key", required=false) String key,
      @RequestParam(defaultValue="30") int days) {
    auth.requireAdminApiKey(key);
    if (days < 1 || days > 90) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose 1 to 90 days.");
    var events = jdbc.queryForList("""
        SELECT event, page, utm_source, utm_medium, utm_campaign, count(*) AS observations
        FROM growth_events WHERE created_at >= now() - (? * interval '1 day')
        GROUP BY event,page,utm_source,utm_medium,utm_campaign ORDER BY observations DESC LIMIT 200
        """, days);
    var enquiries = jdbc.queryForList("""
        SELECT enquiry_type, utm_source, utm_campaign, count(*) AS submissions
        FROM contact_submissions WHERE created_at >= now() - (? * interval '1 day') AND status <> 'spam'
        GROUP BY enquiry_type,utm_source,utm_campaign ORDER BY submissions DESC LIMIT 200
        """, days);
    return Map.of("days", days, "events", events, "enquiries", enquiries, "groupLimit", 200,
        "note", "Anonymous observations, not unique people or verified prospects. Enquiries include test submissions; qualify them manually. Demo views are not tracked inside the isolated demo.");
  }
}
