package com.wallet.swap.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SafeErrorDetailsTest {
  @Test
  void reportsExceptionTypesWithoutSensitiveMessages() {
    IllegalStateException exception = new IllegalStateException(
        "Bearer secret-token",
        new IllegalArgumentException("https://provider.example/private"));

    String summary = SafeErrorDetails.summarize(exception);

    assertThat(summary).isEqualTo("IllegalStateException caused by IllegalArgumentException");
    assertThat(summary).doesNotContain("secret-token", "provider.example");
  }

  @Test
  void handlesMissingException() {
    assertThat(SafeErrorDetails.summarize(null)).isEmpty();
  }
}
