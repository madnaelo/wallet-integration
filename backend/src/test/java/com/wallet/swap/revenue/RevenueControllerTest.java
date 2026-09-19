package com.wallet.swap.revenue;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.wallet.swap.auth.AuthService;
import com.wallet.swap.config.FeatureProperties;
import com.wallet.swap.feature.AdminAuthService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RevenueControllerTest {
  private final RevenueRepository repository = mock(RevenueRepository.class);
  private RevenueController controller() {
    FeatureProperties properties = new FeatureProperties();
    properties.setAdminApiKey("synthetic-admin-key-for-tests");
    return new RevenueController(mock(RevenueService.class),repository,new AdminAuthService(properties),mock(AuthService.class));
  }
  @Test void everyAdminReadRequiresTheAdminKey() {
    RevenueController controller = controller();
    Instant end = Instant.now();
    assertThatThrownBy(() -> controller.report(null,end.minusSeconds(60),end,"day")).hasMessageContaining("Missing admin");
    assertThatThrownBy(() -> controller.records("wrong",end.minusSeconds(60),end,0)).hasMessageContaining("Invalid admin");
    assertThatThrownBy(() -> controller.evidence(null,UUID.randomUUID())).hasMessageContaining("Missing admin");
    verifyNoInteractions(repository);
  }
  @Test void rejectsUnboundedReportingAndSqlLikeBucketValues() {
    RevenueController controller = controller();
    Instant end = Instant.now();
    assertThatThrownBy(() -> controller.report("synthetic-admin-key-for-tests",end.minusSeconds(86400*94L),end,"day"))
        .hasMessageContaining("93 days");
    assertThatThrownBy(() -> controller.report("synthetic-admin-key-for-tests",end.minusSeconds(60),end,"day');drop table x;--"))
        .hasMessageContaining("valid reporting");
    verifyNoInteractions(repository);
  }
}
