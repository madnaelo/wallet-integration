package com.wallet.swap.limitorder;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.feature.FeatureFlagService;
import org.junit.jupiter.api.Test;

class LimitOrderSubmissionWorkerTest {
  private final LimitOrderSubmissionCoordinator coordinator = mock(LimitOrderSubmissionCoordinator.class);
  private final FeatureFlagService featureFlagService = mock(FeatureFlagService.class);
  private final LimitOrderSubmissionWorker worker =
      new LimitOrderSubmissionWorker(coordinator, featureFlagService);

  @Test
  void submitsDueOrdersOnlyWhileTheFeatureAndProviderSubmissionAreEnabled() {
    when(featureFlagService.isLimitOrdersEnabled()).thenReturn(true);

    worker.submitDue();

    verify(coordinator).submitDue();
  }

  @Test
  void leavesQueuedOrdersUntouchedWhileTheFeatureIsDisabled() {
    when(featureFlagService.isLimitOrdersEnabled()).thenReturn(false);

    worker.submitDue();

    verify(coordinator, never()).submitDue();
  }
}
