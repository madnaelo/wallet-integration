package com.wallet.swap.ops;

import com.wallet.swap.feature.AdminAuthService;
import com.wallet.swap.ops.OperationalMetricsService.OpsSnapshot;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ops")
public class AdminOperationsController {
  private final AdminAuthService adminAuthService;
  private final OperationalMetricsService metricsService;

  public AdminOperationsController(AdminAuthService adminAuthService, OperationalMetricsService metricsService) {
    this.adminAuthService = adminAuthService;
    this.metricsService = metricsService;
  }

  @GetMapping("/summary")
  public OpsSnapshot summary(@RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey) {
    adminAuthService.requireAdminApiKey(adminApiKey);
    return metricsService.snapshot();
  }
}
