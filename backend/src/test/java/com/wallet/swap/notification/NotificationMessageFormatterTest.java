package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertCandidate;
import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairCandidate;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.ReverseAlertType;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitCandidate;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class NotificationMessageFormatterTest {
  @Test
  void reverseProfitAlertLinksToPrefilledReverseSwap() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    ReverseProfitCandidate candidate = reverseCandidate();

    String body = formatter.body(new ReverseProfitOpportunity(
        candidate,
        new BigDecimal("1"),
        new BigDecimal("2286.868739"),
        new BigDecimal("1.02"),
        new BigDecimal("2286"),
        BigDecimal.ONE,
        new BigDecimal("1020000000000000000"),
        200,
        ReverseAlertType.PROFIT));

    assertThat(body).contains("Review this swap:");
    assertThat(body).contains(
        "https://wallet.example/swap?chainId=1&sellToken=0xdAC17F958D2ee523a2206206994597C13D831ec7"
            + "&buyToken=ETH&sellAmountRaw=2286868739&autoQuote=1");
  }

  @Test
  void reverseLossAlertUsesLossProtectionText() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    ReverseProfitCandidate candidate = reverseCandidate();

    ReverseProfitOpportunity opportunity = new ReverseProfitOpportunity(
        candidate,
        new BigDecimal("1"),
        new BigDecimal("2286.868739"),
        new BigDecimal("0.95"),
        new BigDecimal("2400"),
        BigDecimal.ONE,
        new BigDecimal("950000000000000000"),
        -500,
        ReverseAlertType.LOSS);

    assertThat(formatter.subject(opportunity)).startsWith("Loss protection alert");
    assertThat(formatter.body(opportunity)).contains("Loss protection alert");
    assertThat(formatter.body(opportunity)).contains("Price movement: -5%");
  }

  @Test
  void favoritePairAlertLinksToSelectedPairWithoutAmount() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    FavoritePairCandidate candidate = favoriteCandidate();

    String body = formatter.body(new FavoritePairOpportunity(
        candidate,
        new BigDecimal("2501"),
        new BigDecimal("2501"),
        BigDecimal.ONE));

    assertThat(body).contains("Review this swap:");
    assertThat(body).contains(
        "https://wallet.example/swap?chainId=1&sellToken=ETH"
            + "&buyToken=0xdAC17F958D2ee523a2206206994597C13D831ec7");
    assertThat(body).doesNotContain("sellAmountRaw=");
  }

  @Test
  void pushPayloadUsesPrefilledSwapLink() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    FavoritePairCandidate candidate = favoriteCandidate();

    NotificationMessageFormatter.PushNotificationPayload payload = formatter.pushPayload(new FavoritePairOpportunity(
        candidate,
        new BigDecimal("2501"),
        new BigDecimal("2501"),
        BigDecimal.ONE));

    assertThat(payload.title()).contains("Favorite pair alert");
    assertThat(payload.body()).contains("reached your target");
    assertThat(payload.url()).isEqualTo(
        "https://wallet.example/swap?chainId=1&sellToken=ETH"
            + "&buyToken=0xdAC17F958D2ee523a2206206994597C13D831ec7");
  }

  @Test
  void priceAlertLinksToSelectedPairWithAmount() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    PriceAlertCandidate candidate = priceAlertCandidate();

    String body = formatter.body(new PriceAlertOpportunity(
        candidate,
        new BigDecimal("2501"),
        new BigDecimal("2501"),
        BigDecimal.ONE));

    assertThat(body).contains("Swap Assistant cannot move funds on its own");
    assertThat(body).contains(
        "https://wallet.example/swap?chainId=1&sellToken=ETH"
            + "&buyToken=0xdAC17F958D2ee523a2206206994597C13D831ec7&sellAmountRaw=1000000000000000000&autoQuote=1");
  }

  private NotificationMessageFormatter formatter(String appUrl) {
    NotificationProperties properties = new NotificationProperties();
    properties.setAppUrl(appUrl);
    return new NotificationMessageFormatter(properties);
  }

  private ReverseProfitCandidate reverseCandidate() {
    return new ReverseProfitCandidate(
        UUID.randomUUID(),
        "0x1234567890123456789012345678901234567890",
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        new BigDecimal("1000000000000000000"),
        new BigDecimal("2286868739"),
        100,
        false,
        500,
        360,
        "user@example.com",
        false,
        null,
        null,
        "12345",
        true,
        null,
        null,
        false,
        null,
        null,
        null);
  }

  private FavoritePairCandidate favoriteCandidate() {
    return new FavoritePairCandidate(
        UUID.randomUUID(),
        "0x1234567890123456789012345678901234567890",
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        new BigDecimal("2500"),
        "above",
        "user@example.com",
        false,
        null,
        "12345",
        true,
        null,
        false,
        null,
        360);
  }

  private PriceAlertCandidate priceAlertCandidate() {
    return new PriceAlertCandidate(
        UUID.randomUUID(),
        "0x1234567890123456789012345678901234567890",
        1L,
        "ETH",
        "ETH",
        18,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "USDT",
        6,
        "1000000000000000000",
        new BigDecimal("2500"),
        "above",
        100,
        "0x1234567890123456789012345678901234567890",
        "notify_to_confirm",
        "confirmation_required",
        "user@example.com",
        false,
        null,
        "12345",
        true,
        null,
        false,
        null,
        360);
  }
}
