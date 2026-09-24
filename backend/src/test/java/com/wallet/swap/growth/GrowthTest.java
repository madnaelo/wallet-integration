package com.wallet.swap.growth;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.feature.AdminAuthService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class GrowthTest {
  @Test void stripsPrivateAndUnboundedValues() {
    var a = GrowthAttribution.sanitize(new GrowthAttribution("/admin?wallet=private", "https://private.example/search?q=secret",
        "me@example.com", "0x" + "a".repeat(40), "a".repeat(64), "unapproved"));
    assertThat(a).isEqualTo(new GrowthAttribution("", "", "", "", "", "general"));
  }
  @Test void preservesOnlyKnownContext() {
    var a = GrowthAttribution.sanitize(new GrowthAttribution("/for-wallets", "google", "Outreach", "email", "pilot_sep", "branded-demo"));
    assertThat(a.utmSource()).isEqualTo("outreach"); assertThat(a.landingPage()).isEqualTo("/for-wallets");
  }
  @Test void absentAttributionIsValid() {
    assertThat(GrowthAttribution.sanitize(null).enquiryType()).isEqualTo("general");
  }
  @Test void rejectsInventedConversionsAndDemoEventsBeforePersistence() {
    var jdbc = mock(JdbcTemplate.class); var controller = new GrowthController(jdbc, mock(AdminAuthService.class));
    for (String event : new String[]{"enquiry_submitted", "paid", "wallet_login"}) {
      assertThatThrownBy(() -> controller.event(new GrowthController.Event(UUID.randomUUID(), event, "/business", null))).isInstanceOf(ApiException.class);
    }
    assertThatThrownBy(() -> controller.event(new GrowthController.Event(UUID.randomUUID(), "landing", "/demo", null))).isInstanceOf(ApiException.class);
    verifyNoInteractions(jdbc);
  }
  @Test void adminReportAuthenticatesBeforeDatabaseReads() {
    var jdbc = mock(JdbcTemplate.class); var auth = mock(AdminAuthService.class);
    doThrow(new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Denied")).when(auth).requireAdminApiKey(null);
    assertThatThrownBy(() -> new GrowthController(jdbc, auth).report(null, 30)).isInstanceOf(ApiException.class);
    verifyNoInteractions(jdbc);
  }
  @Test void boundsReportWindow() {
    var jdbc = mock(JdbcTemplate.class); var controller = new GrowthController(jdbc, mock(AdminAuthService.class));
    for (int days : new int[]{0, -1, 91, Integer.MAX_VALUE}) assertThatThrownBy(() -> controller.report("test", days)).isInstanceOf(ApiException.class);
    verifyNoInteractions(jdbc);
  }
}
