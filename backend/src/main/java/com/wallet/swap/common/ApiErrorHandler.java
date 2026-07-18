package com.wallet.swap.common;

import com.wallet.swap.config.RequestCorrelationFilter;
import jakarta.validation.ConstraintViolationException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrorHandler {
  private static final Logger LOG = LoggerFactory.getLogger(ApiErrorHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, String>> handleApiException(ApiException exception) {
    if (exception.getStatus().is5xxServerError()) logUnexpected(exception);
    return ResponseEntity.status(exception.getStatus()).body(errorBody(exception.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException exception) {
    FieldError first = exception.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
    String message = first == null ? "Invalid request." : first.getField() + ": " + first.getDefaultMessage();
    return ResponseEntity.badRequest().body(errorBody(message));
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<Map<String, String>> handleConstraintViolation(ConstraintViolationException exception) {
    return ResponseEntity.badRequest().body(errorBody("Invalid request."));
  }

  @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
  public ResponseEntity<Map<String, String>> handleMalformedRequest(Exception exception) {
    return ResponseEntity.badRequest().body(errorBody("Invalid request."));
  }

  @ExceptionHandler({MethodArgumentTypeMismatchException.class, ServletRequestBindingException.class})
  public ResponseEntity<Map<String, String>> handleRequestBinding(Exception exception) {
    return ResponseEntity.badRequest().body(errorBody("Invalid request."));
  }

  @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
  public ResponseEntity<Map<String, String>> handleNotFound(Exception exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody("Endpoint not found."));
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<Map<String, String>> handleMethodNotSupported(
    HttpRequestMethodNotSupportedException exception) {
    ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
    Set<HttpMethod> supportedMethods = exception.getSupportedHttpMethods();
    if (supportedMethods != null && !supportedMethods.isEmpty()) {
      response.allow(supportedMethods.toArray(HttpMethod[]::new));
    }
    return response.body(errorBody("Request method is not supported."));
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  public ResponseEntity<Map<String, String>> handleMediaTypeNotSupported(
      HttpMediaTypeNotSupportedException exception) {
    return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
        .body(errorBody("Request content type is not supported."));
  }

  @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
  public ResponseEntity<Map<String, String>> handleMediaTypeNotAcceptable(
      HttpMediaTypeNotAcceptableException exception) {
    return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE)
        .body(errorBody("Requested response type is not supported."));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, String>> handleUnexpected(Exception exception) {
    logUnexpected(exception);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorBody("Unexpected server error."));
  }

  private Map<String, String> errorBody(String message) {
    Map<String, String> body = new LinkedHashMap<>();
    body.put("error", message);
    String requestId = MDC.get(RequestCorrelationFilter.MDC_KEY);
    if (requestId != null && !requestId.isBlank()) body.put("requestId", requestId);
    return body;
  }

  private void logUnexpected(Exception exception) {
    List<String> stack = Arrays.stream(exception.getStackTrace())
        .limit(20)
        .map(StackTraceElement::toString)
        .toList();
    LOG.error(
        "Unexpected API failure. requestId={}, exceptionType={}, stack={}",
        MDC.get(RequestCorrelationFilter.MDC_KEY),
        exception.getClass().getName(),
        stack);
  }
}
