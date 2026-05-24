package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FavoritePairServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  private final FavoritePairRepository repository = mock(FavoritePairRepository.class);
  private final FavoritePairService service = new FavoritePairService(repository);

  @Test
  void rejectsTargetTooCloseToExistingAlertForSamePairAndDirection() {
    FavoritePairRequest request = request("2509", "above", true);
    when(repository.listTargetsForPair(eq(WALLET), any(), eq(null)))
        .thenReturn(List.of(new FavoritePairRepository.FavoritePairTarget(UUID.randomUUID(), new BigDecimal("2500"))));

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("at least 1% away");
  }

  @Test
  void allowsSamePairWhenTargetIsAtLeastOnePercentAway() {
    FavoritePairRequest request = request("2525", "above", true);
    when(repository.listTargetsForPair(eq(WALLET), any(), eq(null)))
        .thenReturn(List.of(new FavoritePairRepository.FavoritePairTarget(UUID.randomUUID(), new BigDecimal("2500"))));

    service.save(WALLET, request);

    verify(repository).insert(eq(WALLET), any());
  }

  @Test
  void rejectsDuplicateUntargetedFavoriteForSamePair() {
    FavoritePairRequest request = request(null, "above", false);
    when(repository.existsUntargetedForPair(eq(WALLET), any(), eq(null))).thenReturn(true);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("already saved");
  }

  private FavoritePairRequest request(String targetRate, String direction, boolean alertsEnabled) {
    return new FavoritePairRequest(
        1L,
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ETH",
        18,
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "USDT",
        6,
        targetRate == null ? null : new BigDecimal(targetRate),
        direction,
        alertsEnabled);
  }
}
