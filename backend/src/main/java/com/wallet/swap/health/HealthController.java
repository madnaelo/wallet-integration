package com.wallet.swap.health;

import com.wallet.swap.ops.OperationalMetricsService;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
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
  private final String appVersion;
  private final String gitCommit;
  private final String deployedAt;

  public HealthController(
      DataSource dataSource,
      OperationalMetricsService metricsService,
      @Value("${APP_VERSION:local}") String appVersion,
      @Value("${GIT_COMMIT:}") String gitCommit,
      @Value("${DEPLOYED_AT:}") String deployedAt) {
    this.dataSource = dataSource;
    this.metricsService = metricsService;
    this.appVersion = appVersion;
    this.gitCommit = gitCommit;
    this.deployedAt = deployedAt;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, Object>> health() {
    Map<String, Object> response = new LinkedHashMap<>();
    Map<String, Object> database = checkDatabase();
    OperationalMetricsService.OpsSnapshot snapshot = metricsService.snapshot();
    boolean healthy = "ok".equals(database.get("status"));

    response.put("status", healthy ? "ok" : "degraded");
    response.put("checkedAt", Instant.now());
    response.put("build", Map.of(
        "version", blankToLocal(appVersion),
        "commit", nullToBlank(gitCommit),
        "deployedAt", nullToBlank(deployedAt)));
    response.put("uptimeSeconds", snapshot.uptimeSeconds());
    response.put("database", database);
    response.put("notifications", Map.of(
        "monitorRuns", snapshot.monitorRuns(),
        "monitorFailures", snapshot.monitorFailures(),
        "priceFetchBatchesFailed", snapshot.priceFetchBatchesFailed(),
        "lastMonitorCompletedAt", snapshot.lastMonitorCompletedAt() == null ? "" : snapshot.lastMonitorCompletedAt()));
    return ResponseEntity.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(response);
  }

  private Map<String, Object> checkDatabase() {
    try (Connection connection = dataSource.getConnection();
        PreparedStatement statement = connection.prepareStatement("SELECT 1");
        ResultSet resultSet = statement.executeQuery()) {
      boolean ok = resultSet.next() && resultSet.getInt(1) == 1;
      return Map.of("status", ok ? "ok" : "degraded");
    } catch (SQLException exception) {
      return Map.of("status", "degraded", "error", "database check failed");
    }
  }

  private String blankToLocal(String value) {
    return value == null || value.isBlank() ? "local" : value.trim();
  }

  private String nullToBlank(String value) {
    return value == null ? "" : value.trim();
  }
}
