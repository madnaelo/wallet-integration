package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ApiRequestGuardFilterTest {
  @Test
  void rejectsRequestsWithOversizedContentLength() throws Exception {
    ApiProperties properties = new ApiProperties();
    properties.setMaxRequestBodyBytes(4);
    ApiRequestGuardFilter filter = new ApiRequestGuardFilter(properties);
    MockHttpServletRequest request = apiRequest("POST", "/api/auth/nonce", "203.0.113.10");
    request.setContentType(MediaType.APPLICATION_JSON_VALUE);
    request.setContent("{\"x\":1}".getBytes(StandardCharsets.UTF_8));
    MockHttpServletResponse response = new MockHttpServletResponse();
    AtomicBoolean chainCalled = new AtomicBoolean(false);

    filter.doFilter(request, response, flaggingChain(chainCalled));

    assertThat(chainCalled).isFalse();
    assertThat(response.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE.value());
    assertThat(response.getContentAsString()).contains("Request body is too large.");
  }

  @Test
  void appliesSeparateRateLimitForAuthEndpoints() throws Exception {
    ApiProperties properties = new ApiProperties();
    properties.setAuthRateLimitMaxRequests(1);
    properties.setRateLimitWindowMs(60_000);
    ApiRequestGuardFilter filter = new ApiRequestGuardFilter(properties);
    AtomicBoolean chainCalled = new AtomicBoolean(false);

    MockHttpServletResponse firstResponse = new MockHttpServletResponse();
    filter.doFilter(apiRequest("POST", "/api/auth/nonce", "203.0.113.20"), firstResponse, flaggingChain(chainCalled));
    assertThat(firstResponse.getStatus()).isEqualTo(HttpStatus.OK.value());
    assertThat(chainCalled).isTrue();

    chainCalled.set(false);
    MockHttpServletResponse secondResponse = new MockHttpServletResponse();
    filter.doFilter(apiRequest("POST", "/api/auth/nonce", "203.0.113.20"), secondResponse, flaggingChain(chainCalled));

    assertThat(chainCalled).isFalse();
    assertThat(secondResponse.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    assertThat(secondResponse.getHeader("Retry-After")).isNotBlank();
  }

  @Test
  void doesNotRateLimitHealthChecks() throws Exception {
    ApiProperties properties = new ApiProperties();
    properties.setRateLimitMaxRequests(1);
    ApiRequestGuardFilter filter = new ApiRequestGuardFilter(properties);
    AtomicBoolean chainCalled = new AtomicBoolean(false);

    filter.doFilter(apiRequest("GET", "/api/health", "203.0.113.30"), new MockHttpServletResponse(), flaggingChain(chainCalled));
    chainCalled.set(false);
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(apiRequest("GET", "/api/health", "203.0.113.30"), response, flaggingChain(chainCalled));

    assertThat(chainCalled).isTrue();
    assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
  }

  @Test
  void ignoresForwardedForFromUntrustedRemoteAddress() throws Exception {
    ApiProperties properties = new ApiProperties();
    properties.setAuthRateLimitMaxRequests(1);
    properties.setRateLimitWindowMs(60_000);
    ApiRequestGuardFilter filter = new ApiRequestGuardFilter(properties);

    MockHttpServletResponse firstResponse = new MockHttpServletResponse();
    MockHttpServletRequest firstRequest = apiRequest("POST", "/api/auth/nonce", "203.0.113.40");
    firstRequest.addHeader("X-Forwarded-For", "198.51.100.10");
    filter.doFilter(firstRequest, firstResponse, flaggingChain(new AtomicBoolean(false)));
    assertThat(firstResponse.getStatus()).isEqualTo(HttpStatus.OK.value());

    MockHttpServletResponse secondResponse = new MockHttpServletResponse();
    MockHttpServletRequest secondRequest = apiRequest("POST", "/api/auth/nonce", "203.0.113.40");
    secondRequest.addHeader("X-Forwarded-For", "198.51.100.11");
    filter.doFilter(secondRequest, secondResponse, flaggingChain(new AtomicBoolean(false)));

    assertThat(secondResponse.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
  }

  @Test
  void usesForwardedForFromTrustedPrivateProxy() throws Exception {
    ApiProperties properties = new ApiProperties();
    properties.setAuthRateLimitMaxRequests(1);
    properties.setRateLimitWindowMs(60_000);
    ApiRequestGuardFilter filter = new ApiRequestGuardFilter(properties);

    MockHttpServletResponse firstResponse = new MockHttpServletResponse();
    MockHttpServletRequest firstRequest = apiRequest("POST", "/api/auth/nonce", "10.0.0.5");
    firstRequest.addHeader("X-Forwarded-For", "198.51.100.20");
    filter.doFilter(firstRequest, firstResponse, flaggingChain(new AtomicBoolean(false)));
    assertThat(firstResponse.getStatus()).isEqualTo(HttpStatus.OK.value());

    MockHttpServletResponse secondResponse = new MockHttpServletResponse();
    MockHttpServletRequest secondRequest = apiRequest("POST", "/api/auth/nonce", "10.0.0.5");
    secondRequest.addHeader("X-Forwarded-For", "198.51.100.21");
    filter.doFilter(secondRequest, secondResponse, flaggingChain(new AtomicBoolean(false)));
    assertThat(secondResponse.getStatus()).isEqualTo(HttpStatus.OK.value());

    MockHttpServletResponse thirdResponse = new MockHttpServletResponse();
    MockHttpServletRequest thirdRequest = apiRequest("POST", "/api/auth/nonce", "10.0.0.5");
    thirdRequest.addHeader("X-Forwarded-For", "198.51.100.20");
    filter.doFilter(thirdRequest, thirdResponse, flaggingChain(new AtomicBoolean(false)));
    assertThat(thirdResponse.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
  }

  private MockHttpServletRequest apiRequest(String method, String path, String remoteAddr) {
    MockHttpServletRequest request = new MockHttpServletRequest(method, path);
    request.setRemoteAddr(remoteAddr);
    return request;
  }

  private FilterChain flaggingChain(AtomicBoolean chainCalled) {
    return (ServletRequest request, ServletResponse response) -> chainCalled.set(true);
  }
}
