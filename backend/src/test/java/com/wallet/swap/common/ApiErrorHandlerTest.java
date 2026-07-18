package com.wallet.swap.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class ApiErrorHandlerTest {
  private final ApiErrorHandler handler = new ApiErrorHandler();

  @Test
  void mapsUnknownApiPathsToNotFound() {
    ResponseEntity<Map<String, String>> response = handler.handleNotFound(
        new NoResourceFoundException(HttpMethod.GET, "/api/unknown"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(response.getBody()).containsEntry("error", "Endpoint not found.");
  }

  @Test
  void mapsUnsupportedMethodsAndAdvertisesAllowedMethods() {
    HttpRequestMethodNotSupportedException exception = new HttpRequestMethodNotSupportedException(
        "POST", List.of("GET"));

    ResponseEntity<Map<String, String>> response = handler.handleMethodNotSupported(exception);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
    assertThat(response.getHeaders().getAllow()).containsExactly(HttpMethod.GET);
  }

  @Test
  void mapsUnsupportedMethodsWhenNoAllowedMethodsAreKnown() {
    ResponseEntity<Map<String, String>> response = handler.handleMethodNotSupported(
        new HttpRequestMethodNotSupportedException("TRACE"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
    assertThat(response.getHeaders().getAllow()).isEmpty();
  }

  @Test
  void mapsUnsupportedContentTypesToClientError() {
    ResponseEntity<Map<String, String>> response = handler.handleMediaTypeNotSupported(
        new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN, List.of(MediaType.APPLICATION_JSON)));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    assertThat(response.getBody()).containsEntry("error", "Request content type is not supported.");
  }
}
