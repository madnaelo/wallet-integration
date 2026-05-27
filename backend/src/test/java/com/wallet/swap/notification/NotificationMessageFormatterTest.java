package com.wallet.swap.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapOpportunity;
import com.wallet.swap.autoswap.AutoSwapRuleModels.AutoSwapRuleCandidate;
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

    assertThat(body).contains("Open prefilled swap:");
    assertThat(body).contains(
        "https://wallet.example?chainId=1&sellToken=0xdAC17F958D2ee523a2206206994597C13D831ec7"
            + "&buyToken=ETH&sellAmountRaw=2286868739#swap");
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
    assertThat(formatter.body(opportunity)).contains("Loss protection alert triggered.");
    assertThat(formatter.body(opportunity)).contains("Current movement: -5%");
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

    assertThat(body).contains("Open prefilled swap:");
    assertThat(body).contains(
        "https://wallet.example?chainId=1&sellToken=ETH"
            + "&buyToken=0xdAC17F958D2ee523a2206206994597C13D831ec7#swap");
    assertThat(body).doesNotContain("sellAmountRaw=");
  }

  @Test
  void autoSwapAlertLinksToSelectedPairWithAmount() {
    NotificationMessageFormatter formatter = formatter("https://wallet.example");
    AutoSwapRuleCandidate candidate = autoSwapCandidate();

    String body = formatter.body(new AutoSwapOpportunity(
        candidate,
        new BigDecimal("2501"),
        new BigDecimal("2501"),
        BigDecimal.ONE));

    assertThat(body).contains("Wallet cannot sign transactions for you");
    assertThat(body).contains(
        "https://wallet.example?chainId=1&sellToken=ETH"
            + "&buyToken=0xdAC17F958D2ee523a2206206994597C13D831ec7&sellAmountRaw=1000000000000000000#swap");
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
        360);
  }

  private AutoSwapRuleCandidate autoSwapCandidate() {
    return new AutoSwapRuleCandidate(
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
        360);
  }
}
