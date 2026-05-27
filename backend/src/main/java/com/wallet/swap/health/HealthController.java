package com.wallet.swap.health;

import com.wallet.swap.ops.OperationalMetricsService;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {
  private final DataSource dataSource;
  private final OperationalMetricsService metricsService;

  public HealthController(DataSource dataSource, OperationalMetricsService metricsService) {
    this.dataSource = dataSource;
    this.metricsService = metricsService;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, Object>> health() {
    Map<String, Object> response = new LinkedHashMap<>();
    Map<String, Object> database = checkDatabase();
    OperationalMetricsService.OpsSnapshot snapshot = metricsService.snapshot();
    boolean healthy = "ok".equals(database.get("status"));

    response.put("status", healthy ? "ok" : "degraded");
    response.put("checkedAt", Instant.now());
    response.put("uptimeSeconds", snapshot.uptimeSeconds());
    response.put("database", database);
    response.put("notifications", Map.of(
        "monitorRuns", snapshot.monitorRuns(),
        "monitorFailures", snapshot.monitorFailures(),
        "lastMonitorCompletedAt", snapshot.lastMonitorCompletedAt() == null ? "" : snapshot.lastMonitorCompletedAt()));
    return ResponseEntity.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(response);
  }

  private Map<String, Object> checkDatabase() {
    try (Connection connection = dataSource.getConnection();
        PreparedStatement statement = connection.prepareStatement("SELECT 1");
        ResultSet resultSet = statement.executeQuery()) {
      boolean ok = resultSet.next() && resultSet.getInt(1) == 1;
      return Map.of("status", ok ? "ok" : "degraded");
    } catch (Exception exception) {
      return Map.of("status", "degraded", "error", "database check failed");
    }
  }
}
