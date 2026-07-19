package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkCode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class TelegramLinkCompletionServiceTest {
  private static final String WALLET = "0x1111111111111111111111111111111111111111";

  @Test
  void consumesActiveCodeAndLinksTelegramInsideTheWalletMutationBoundary() {
    TelegramLinkCodeRepository repository = mock(TelegramLinkCodeRepository.class);
    NotificationPreferenceService preferences = mock(NotificationPreferenceService.class);
    WalletMutationLock walletMutationLock = mock(WalletMutationLock.class);
    TelegramLinkCompletionService service = new TelegramLinkCompletionService(
        repository,
        preferences,
        walletMutationLock);
    UUID codeId = UUID.randomUUID();
    TelegramLinkCode code = new TelegramLinkCode(
        codeId,
        WALLET,
        "ABCDEFGHJKLM",
        Instant.now().plusSeconds(600),
        null,
        Instant.now());
    NotificationPreferenceResponse expected = new NotificationPreferenceResponse(
        WALLET, null, false, "22", true, false, 0, 100, false, 500, 360);
    when(repository.findActiveForWallet(WALLET)).thenReturn(List.of(code));
    when(preferences.connectTelegram(WALLET, "22")).thenReturn(expected);

    NotificationPreferenceResponse response = service.complete(WALLET, codeId, "22");

    assertThat(response).isSameAs(expected);
    InOrder order = inOrder(walletMutationLock, repository, preferences);
    order.verify(walletMutationLock).lock(WALLET);
    order.verify(repository).findActiveForWallet(WALLET);
    order.verify(repository).markConsumed(codeId);
    order.verify(preferences).connectTelegram(WALLET, "22");
  }

  @Test
  void rejectsAConsumedOrExpiredCodeAfterTakingTheWalletLock() {
    TelegramLinkCodeRepository repository = mock(TelegramLinkCodeRepository.class);
    NotificationPreferenceService preferences = mock(NotificationPreferenceService.class);
    WalletMutationLock walletMutationLock = mock(WalletMutationLock.class);
    TelegramLinkCompletionService service = new TelegramLinkCompletionService(
        repository,
        preferences,
        walletMutationLock);
    UUID codeId = UUID.randomUUID();
    when(repository.findActiveForWallet(WALLET)).thenReturn(List.of());

    assertThatThrownBy(() -> service.complete(WALLET, codeId, "22"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("Start Telegram connection again");

    verify(walletMutationLock).lock(WALLET);
    verify(repository, never()).markConsumed(codeId);
    verify(preferences, never()).connectTelegram(WALLET, "22");
  }
}
