package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceRequest;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class NotificationPreferenceServiceTest {
  private static final String WALLET = "0x0000000000000000000000000000000000000001";

  @Mock
  private NotificationPreferenceRepository repository;

  private NotificationPreferenceService service;

  @BeforeEach
  void setUp() {
    service = new NotificationPreferenceService(repository, new NotificationProperties());
  }

  @Test
  void rejectsTelegramEnabledWithoutLinkedChat() {
    when(repository.find(WALLET)).thenReturn(Optional.empty());

    NotificationPreferenceRequest request = request(true);

    assertThatThrownBy(() -> service.save(WALLET, request))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("Connect Telegram");
    verify(repository, never()).upsert(any(), any(), any(), eq(true), anyInt(), anyInt(), anyInt());
  }

  @Test
  void preservesLinkedChatWhenSavingPreferences() {
    NotificationPreferenceRequest request = request(true);
    NotificationPreferenceResponse saved = response("12345", true);
    when(repository.find(WALLET)).thenReturn(Optional.of(response("12345", false)));
    when(repository.upsert(eq(WALLET), eq(request), eq("12345"), eq(true), anyInt(), anyInt(), anyInt()))
        .thenReturn(saved);

    NotificationPreferenceResponse result = service.save(WALLET, request);

    assertThat(result.telegramChatId()).isEqualTo("12345");
    assertThat(result.telegramEnabled()).isTrue();
  }

  @Test
  void linksTelegramOnlyThroughConnectFlow() {
    when(repository.find(WALLET)).thenReturn(Optional.empty());
    when(repository.upsert(eq(WALLET), any(), eq("77777"), eq(true), anyInt(), anyInt(), anyInt()))
        .thenReturn(response("77777", true));

    NotificationPreferenceResponse result = service.connectTelegram(WALLET, "77777");

    assertThat(result.telegramChatId()).isEqualTo("77777");
    assertThat(result.telegramEnabled()).isTrue();
  }

  private NotificationPreferenceRequest request(boolean telegramEnabled) {
    return new NotificationPreferenceRequest(
        null,
        false,
        telegramEnabled,
        100,
        false,
        500,
        360);
  }

  private NotificationPreferenceResponse response(String telegramChatId, boolean telegramEnabled) {
    return new NotificationPreferenceResponse(
        WALLET,
        null,
        false,
        telegramChatId,
        telegramEnabled,
        100,
        false,
        500,
        360);
  }
}
