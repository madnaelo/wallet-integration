package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.common.WalletMutationLock;
import com.wallet.swap.notification.NotificationModels.NotificationPreferenceResponse;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TelegramLinkCompletionService {
  private final TelegramLinkCodeRepository linkCodeRepository;
  private final NotificationPreferenceService preferenceService;
  private final WalletMutationLock walletMutationLock;

  public TelegramLinkCompletionService(
      TelegramLinkCodeRepository linkCodeRepository,
      NotificationPreferenceService preferenceService,
      WalletMutationLock walletMutationLock) {
    this.linkCodeRepository = linkCodeRepository;
    this.preferenceService = preferenceService;
    this.walletMutationLock = walletMutationLock;
  }

  @Transactional
  public NotificationPreferenceResponse complete(String walletAddress, UUID codeId, String telegramChatId) {
    walletMutationLock.lock(walletAddress);
    boolean codeIsActive = linkCodeRepository.findActiveForWallet(walletAddress).stream()
        .anyMatch(code -> code.id().equals(codeId));
    if (!codeIsActive) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Start Telegram connection again.");
    }

    linkCodeRepository.markConsumed(codeId);
    return preferenceService.connectTelegram(walletAddress, telegramChatId);
  }
}
