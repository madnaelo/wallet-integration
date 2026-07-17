package com.wallet.swap.limitorder;

import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class LimitOrderStatusWorker {
  private static final Logger log = LoggerFactory.getLogger(LimitOrderStatusWorker.class);

  private final LimitOrderStatusCoordinator coordinator;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public LimitOrderStatusWorker(LimitOrderStatusCoordinator coordinator) {
    this.coordinator = coordinator;
  }

  @Scheduled(fixedDelayString = "${wallet.limit-orders.status-check-fixed-delay-ms:30000}")
  public void reconcileDue() {
    if (!running.compareAndSet(false, true)) return;
    try {
      coordinator.reconcileDue();
    } catch (Exception exception) {
      log.error("Limit order status worker failed.", exception);
    } finally {
      running.set(false);
    }
  }
}
