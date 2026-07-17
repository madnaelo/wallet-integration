package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestCorrelationFilterTest {
  private final RequestCorrelationFilter filter = new RequestCorrelationFilter();

  @Test
  void propagatesSafeRequestIdAndClearsLoggingContext() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
    request.addHeader(RequestCorrelationFilter.HEADER_NAME, "client-request-123");
    MockHttpServletResponse response = new MockHttpServletResponse();
    AtomicReference<String> requestIdInChain = new AtomicReference<>();

    filter.doFilter(
        request,
        response,
        (servletRequest, servletResponse) ->
            requestIdInChain.set(MDC.get(RequestCorrelationFilter.MDC_KEY)));

    assertThat(requestIdInChain).hasValue("client-request-123");
    assertThat(response.getHeader(RequestCorrelationFilter.HEADER_NAME)).isEqualTo("client-request-123");
    assertThat(MDC.get(RequestCorrelationFilter.MDC_KEY)).isNull();
  }

  @Test
  void replacesUnsafeRequestId() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
    request.addHeader(RequestCorrelationFilter.HEADER_NAME, "unsafe request value");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response, (servletRequest, servletResponse) -> {});

    String generated = response.getHeader(RequestCorrelationFilter.HEADER_NAME);
    assertThat(generated).isNotBlank();
    assertThat(UUID.fromString(generated)).isNotNull();
  }
}
