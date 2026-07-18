package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkCode;
import com.wallet.swap.notification.TelegramNotificationSender.TelegramIncomingMessage;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TelegramLinkServiceTest {
  @Test
  void linksOnlyAnExactTelegramStartCommand() {
    TelegramLinkCodeRepository repository = mock(TelegramLinkCodeRepository.class);
    TelegramNotificationSender sender = mock(TelegramNotificationSender.class);
    NotificationPreferenceService preferences = mock(NotificationPreferenceService.class);
    TelegramLinkService service = new TelegramLinkService(
        new NotificationProperties(),
        repository,
        sender,
        preferences);
    UUID codeId = UUID.randomUUID();
    String wallet = "0x1111111111111111111111111111111111111111";
    TelegramLinkCode code = new TelegramLinkCode(
        codeId,
        wallet,
        "ABCDEFGHJKLM",
        Instant.now().plusSeconds(600),
        null,
        Instant.now());
    NotificationPreferenceResponse expected = new NotificationPreferenceResponse(
        wallet, null, false, "22", true, false, 0, 100, false, 500, 360);
    when(repository.findActiveForWallet(wallet)).thenReturn(List.of(code));
    when(sender.getRecentMessages()).thenReturn(List.of(
        new TelegramIncomingMessage("11", "Please use ABCDEFGHJKLM"),
        new TelegramIncomingMessage("22", "/start ABCDEFGHJKLM")));
    when(preferences.connectTelegram(wallet, "22")).thenReturn(expected);

    NotificationPreferenceResponse response = service.complete(wallet);

    assertThat(response).isSameAs(expected);
    verify(repository).markConsumed(codeId);
    verify(preferences).connectTelegram(wallet, "22");
  }
}
