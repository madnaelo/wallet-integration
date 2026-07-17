package com.wallet.swap.limitorder;

import com.wallet.swap.feature.FeatureFlagService;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class LimitOrderSubmissionWorker {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderSubmissionWorker.class);

  private final LimitOrderSubmissionCoordinator coordinator;
  private final FeatureFlagService featureFlagService;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public LimitOrderSubmissionWorker(
      LimitOrderSubmissionCoordinator coordinator,
      FeatureFlagService featureFlagService) {
    this.coordinator = coordinator;
    this.featureFlagService = featureFlagService;
  }

  @Scheduled(fixedDelayString = "${wallet.limit-orders.submission-retry-fixed-delay-ms:30000}")
  public void submitDue() {
    if (!featureFlagService.isLimitOrdersEnabled()) return;
    if (!running.compareAndSet(false, true)) return;
    try {
      coordinator.submitDue();
    } catch (Exception exception) {
      log.error("Limit order submission worker failed.", exception);
    } finally {
      running.set(false);
    }
  }
}
