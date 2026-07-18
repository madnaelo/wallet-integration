package com.wallet.swap.ops;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class OperationalMetricsServiceTest {
  @Test
  void tracksAndClearsCurrentPriceFetchDegradation() {
    OperationalMetricsService metrics = new OperationalMetricsService();

    metrics.recordPriceFetchBatches(3, 1, new IllegalStateException("provider unavailable"));

    assertThat(metrics.snapshot().priceFetchBatchesAttempted()).isEqualTo(3);
    assertThat(metrics.snapshot().priceFetchBatchesFailed()).isEqualTo(1);
    assertThat(metrics.snapshot().lastPriceFetchError()).isEqualTo("IllegalStateException");

    metrics.recordPriceFetchBatches(0, 0, null);
    assertThat(metrics.snapshot().lastPriceFetchError()).isEqualTo("IllegalStateException");

    metrics.recordPriceFetchBatches(2, 0, null);

    assertThat(metrics.snapshot().priceFetchBatchesAttempted()).isEqualTo(5);
    assertThat(metrics.snapshot().priceFetchBatchesFailed()).isEqualTo(1);
    assertThat(metrics.snapshot().lastPriceFetchError()).isBlank();
  }
}
