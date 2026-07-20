package com.wallet.swap.history;

import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SwapTransferStatusWorker {
  private static final Logger log = LoggerFactory.getLogger(SwapTransferStatusWorker.class);

  private final SwapTransferStatusCoordinator coordinator;
  private final AtomicBoolean running = new AtomicBoolean(false);

  public SwapTransferStatusWorker(SwapTransferStatusCoordinator coordinator) {
    this.coordinator = coordinator;
  }

  @Scheduled(fixedDelayString = "${wallet.lifi.status-check-fixed-delay-ms:10000}")
  public void reconcileDue() {
    if (!running.compareAndSet(false, true)) return;
    try {
      coordinator.reconcileDue();
    } catch (Exception exception) {
      log.error("Swap delivery status worker failed.", exception);
    } finally {
      running.set(false);
    }
  }
}
