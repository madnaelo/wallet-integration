package com.wallet.swap.notification;

import com.wallet.swap.common.ApiException;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkCode;
import com.wallet.swap.notification.TelegramLinkModels.TelegramLinkStartResponse;
import com.wallet.swap.notification.TelegramNotificationSender.TelegramIncomingMessage;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class TelegramLinkService {
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();
  private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
  private static final int CODE_LENGTH = 12;

  private final NotificationProperties properties;
  private final TelegramLinkCodeRepository linkCodeRepository;
  private final TelegramNotificationSender telegramSender;
  private final TelegramLinkCompletionService completionService;

  public TelegramLinkService(
      NotificationProperties properties,
      TelegramLinkCodeRepository linkCodeRepository,
      TelegramNotificationSender telegramSender,
      TelegramLinkCompletionService completionService) {
    this.properties = properties;
    this.linkCodeRepository = linkCodeRepository;
    this.telegramSender = telegramSender;
    this.completionService = completionService;
  }

  public TelegramLinkStartResponse start(String walletAddress) {
    if (!telegramSender.isEnabled()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram connection is not available right now.");
    }

    String code = generateCode();
    Instant expiresAt = Instant.now().plus(Math.max(1, properties.getTelegramLinkTtlMinutes()), ChronoUnit.MINUTES);
    linkCodeRepository.save(walletAddress, code, expiresAt);

    String botUsername = telegramSender.getBotUsername()
        .orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram bot is not configured."));
    String deepLink = UriComponentsBuilder
        .fromUriString("https://t.me/{botUsername}")
        .queryParam("start", code)
        .build(botUsername)
        .toString();

    return new TelegramLinkStartResponse(code, botUsername, deepLink, expiresAt);
  }

  public NotificationModels.NotificationPreferenceResponse complete(String walletAddress) {
    List<TelegramLinkCode> activeCodes = linkCodeRepository.findActiveForWallet(walletAddress);
    if (activeCodes.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Start Telegram connection again.");
    }

    List<TelegramIncomingMessage> messages = telegramSender.getRecentMessages();
    for (TelegramLinkCode code : activeCodes) {
      Pattern startPattern = Pattern.compile(
          "^/start(?:@[A-Za-z0-9_]+)?\\s+" + Pattern.quote(code.code()) + "$",
          Pattern.CASE_INSENSITIVE);
      for (TelegramIncomingMessage message : messages) {
        String text = message.text().trim();
        if (!startPattern.matcher(text).matches()) continue;

        return completionService.complete(walletAddress, code.id(), message.chatId());
      }
    }

    throw new ApiException(HttpStatus.NOT_FOUND, "No Telegram confirmation found yet.");
  }

  private String generateCode() {
    StringBuilder code = new StringBuilder(CODE_LENGTH);
    for (int i = 0; i < CODE_LENGTH; i += 1) {
      code.append(CODE_ALPHABET[SECURE_RANDOM.nextInt(CODE_ALPHABET.length)]);
    }
    return code.toString();
  }
}
