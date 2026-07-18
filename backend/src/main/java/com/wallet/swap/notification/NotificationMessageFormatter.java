package com.wallet.swap.notification;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.pricealert.PriceAlertModels.PriceAlertOpportunity;
import com.wallet.swap.notification.FavoritePairModels.FavoritePairOpportunity;
import com.wallet.swap.notification.ReverseProfitModels.ReverseProfitOpportunity;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.net.URI;
import java.util.Enumeration;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class NotificationMessageFormatter {
  private final NotificationProperties properties;

  public NotificationMessageFormatter(NotificationProperties properties) {
    this.properties = properties;
  }

  public String subject(ReverseProfitOpportunity opportunity) {
    String prefix = opportunity.alertType().value().equals("loss")
        ? "Loss protection alert"
        : "Reverse swap opportunity";
    return "%s: %s to %s".formatted(
        prefix,
        opportunity.candidate().buyTokenSymbol(),
        opportunity.candidate().sellTokenSymbol());
  }

  public String subject(FavoritePairOpportunity opportunity) {
    return "Favorite pair alert: %s to %s".formatted(
        opportunity.candidate().sellTokenSymbol(),
        opportunity.candidate().buyTokenSymbol());
  }

  public String subject(PriceAlertOpportunity opportunity) {
    return "Swap alert: %s to %s".formatted(
        opportunity.candidate().sellTokenSymbol(),
        opportunity.candidate().buyTokenSymbol());
  }

  public String body(ReverseProfitOpportunity opportunity) {
    String swapUrl = reverseSwapUrl(opportunity);
    boolean lossAlert = opportunity.alertType().value().equals("loss");

    return """
        %s

        Original swap: %s %s to %s %s
        Estimated return now: %s %s
        Price movement: %s

        This is an estimate based on current market prices. Open Swap Assistant to review a fresh quote before swapping.

        Review this swap:
        %s
        """.formatted(
        lossAlert ? "Loss protection alert" : "Reverse swap opportunity",
        amount(opportunity.originalSellAmount()),
        opportunity.candidate().sellTokenSymbol(),
        amount(opportunity.receivedBuyAmount()),
        opportunity.candidate().buyTokenSymbol(),
        amount(opportunity.estimatedReverseSellAmount()),
        opportunity.candidate().sellTokenSymbol(),
        movementLabel(opportunity.profitBps()),
        swapUrl);
  }

  public String body(FavoritePairOpportunity opportunity) {
    String swapUrl = favoritePairSwapUrl(opportunity);
    String direction = "below".equals(opportunity.candidate().alertDirection()) ? "at or below" : "at or above";

    return """
        Favorite pair alert

        Pair: %s to %s
        Current rate: 1 %s = %s %s
        Target: %s %s %s

        This is an estimate based on current market prices. Open Swap Assistant to review a fresh quote before swapping.

        Review this swap:
        %s
        """.formatted(
        opportunity.candidate().sellTokenSymbol(),
        opportunity.candidate().buyTokenSymbol(),
        opportunity.candidate().sellTokenSymbol(),
        amount(opportunity.currentRate()),
        opportunity.candidate().buyTokenSymbol(),
        direction,
        amount(opportunity.candidate().targetRate()),
        opportunity.candidate().buyTokenSymbol(),
        swapUrl);
  }

  public String body(PriceAlertOpportunity opportunity) {
    String swapUrl = priceAlertUrl(opportunity);
    String direction = "below".equals(opportunity.candidate().alertDirection()) ? "at or below" : "at or above";

    return """
        Swap target reached.

        Pair: %s to %s
        Amount: %s %s
        Current rate: 1 %s = %s %s
        Target: %s %s %s
        Slippage tolerance: %s%%

        Swap Assistant cannot move funds on its own. Open the prefilled swap, review the live quote, and approve from your wallet.

        Review this swap:
        %s
        """.formatted(
        opportunity.candidate().sellTokenSymbol(),
        opportunity.candidate().buyTokenSymbol(),
        amount(toHuman(opportunity.candidate().sellAmountRaw(), opportunity.candidate().sellTokenDecimals())),
        opportunity.candidate().sellTokenSymbol(),
        opportunity.candidate().sellTokenSymbol(),
        amount(opportunity.currentRate()),
        opportunity.candidate().buyTokenSymbol(),
        direction,
        amount(opportunity.candidate().thresholdRate()),
        opportunity.candidate().buyTokenSymbol(),
        percent(opportunity.candidate().slippageBps()),
        swapUrl);
  }

  public PushNotificationPayload pushPayload(ReverseProfitOpportunity opportunity) {
    boolean lossAlert = opportunity.alertType().value().equals("loss");
    String body = lossAlert
        ? "%s to %s moved %s. Review a fresh quote before swapping.".formatted(
            opportunity.candidate().buyTokenSymbol(),
            opportunity.candidate().sellTokenSymbol(),
            movementLabel(opportunity.profitBps()))
        : "%s to %s may now return %s %s. Review a fresh quote before swapping.".formatted(
            opportunity.candidate().buyTokenSymbol(),
            opportunity.candidate().sellTokenSymbol(),
            amount(opportunity.estimatedReverseSellAmount()),
            opportunity.candidate().sellTokenSymbol());
    return new PushNotificationPayload(
        subject(opportunity),
        body,
        reverseSwapUrl(opportunity),
        "reverse-%s-%s".formatted(opportunity.candidate().swapHistoryId(), opportunity.alertType().value()));
  }

  public PushNotificationPayload pushPayload(FavoritePairOpportunity opportunity) {
    return new PushNotificationPayload(
        subject(opportunity),
        "%s to %s reached your target. Review a fresh quote before swapping.".formatted(
            opportunity.candidate().sellTokenSymbol(),
            opportunity.candidate().buyTokenSymbol()),
        favoritePairSwapUrl(opportunity),
        "favorite-%s-%s".formatted(opportunity.candidate().id(), opportunity.candidate().alertDirection()));
  }

  public PushNotificationPayload pushPayload(PriceAlertOpportunity opportunity) {
    return new PushNotificationPayload(
        subject(opportunity),
        "%s to %s reached your target. Open Swap Assistant to review and approve from your wallet.".formatted(
            opportunity.candidate().sellTokenSymbol(),
            opportunity.candidate().buyTokenSymbol()),
        priceAlertUrl(opportunity),
        "price-alert-%s-%s".formatted(opportunity.candidate().id(), opportunity.candidate().alertDirection()));
  }

  private String reverseSwapUrl(ReverseProfitOpportunity opportunity) {
    return swapUrl(
        opportunity.candidate().chainId(),
        opportunity.candidate().buyTokenAddress(),
        opportunity.candidate().sellTokenAddress(),
        rawAmount(opportunity.candidate().buyAmountRaw()));
  }

  private String favoritePairSwapUrl(FavoritePairOpportunity opportunity) {
    return swapUrl(
        opportunity.candidate().chainId(),
        opportunity.candidate().sellTokenAddress(),
        opportunity.candidate().buyTokenAddress(),
        "");
  }

  private String priceAlertUrl(PriceAlertOpportunity opportunity) {
    return swapUrl(
        opportunity.candidate().chainId(),
        opportunity.candidate().sellTokenAddress(),
        opportunity.candidate().buyTokenAddress(),
        rawAmount(new BigDecimal(opportunity.candidate().sellAmountRaw())));
  }

  private String swapUrl(long chainId, String sellToken, String buyToken, String sellAmountRaw) {
    UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(appBaseUrl())
        .replacePath("/swap")
        .replaceQuery(null)
        .fragment(null)
        .queryParam("chainId", chainId)
        .queryParam("sellToken", sellToken)
        .queryParam("buyToken", buyToken);

    if (sellAmountRaw != null && !sellAmountRaw.isBlank()) {
      builder.queryParam("sellAmountRaw", sellAmountRaw);
      builder.queryParam("autoQuote", "1");
    }

    return builder.toUriString();
  }

  private String appBaseUrl() {
    String defaultUrl = "http://localhost:3000";
    String configured = properties.getAppUrl() == null || properties.getAppUrl().isBlank()
        ? defaultUrl
        : properties.getAppUrl().trim();

    try {
      URI uri = URI.create(configured);
      if (uri.getScheme() == null || uri.getHost() == null) return defaultUrl;
      if (!isLocalHost(uri.getHost())) return configured;

      String lanAddress = firstUsableLanIpv4Address();
      if (lanAddress.isBlank()) return configured;

      return UriComponentsBuilder.fromUri(uri).host(lanAddress).toUriString();
    } catch (IllegalArgumentException exception) {
      return defaultUrl;
    }
  }

  private boolean isLocalHost(String host) {
    if (host == null) return false;
    String normalized = host.trim().toLowerCase(Locale.ROOT);
    return normalized.equals("localhost")
        || normalized.equals("127.0.0.1")
        || normalized.equals("0:0:0:0:0:0:0:1")
        || normalized.equals("::1");
  }

  private String firstUsableLanIpv4Address() {
    String fallback = "";
    try {
      Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
      while (interfaces.hasMoreElements()) {
        NetworkInterface networkInterface = interfaces.nextElement();
        if (!networkInterface.isUp() || networkInterface.isLoopback() || networkInterface.isVirtual()) continue;

        Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
        while (addresses.hasMoreElements()) {
          InetAddress address = addresses.nextElement();
          if (!(address instanceof Inet4Address ipv4Address)
              || ipv4Address.isLoopbackAddress()
              || ipv4Address.isLinkLocalAddress()) {
            continue;
          }

          if (ipv4Address.isSiteLocalAddress()) return ipv4Address.getHostAddress();
          if (fallback.isBlank()) fallback = ipv4Address.getHostAddress();
        }
      }
    } catch (SocketException exception) {
      return "";
    }

    return fallback;
  }

  private String amount(BigDecimal value) {
    return value.setScale(8, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
  }

  private String rawAmount(BigDecimal value) {
    if (value == null) return "";
    return value.setScale(0, RoundingMode.DOWN).toPlainString();
  }

  private BigDecimal toHuman(String rawAmount, int decimals) {
    BigDecimal amount = new BigDecimal(rawAmount);
    if (decimals <= 0) return amount;
    return amount.movePointLeft(decimals);
  }

  private String percent(int bps) {
    return BigDecimal.valueOf(bps)
        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
        .stripTrailingZeros()
        .toPlainString();
  }

  private String movementLabel(int bps) {
    String prefix = bps > 0 ? "+" : "";
    return "%s%s%%".formatted(prefix, percent(bps));
  }

  public record PushNotificationPayload(String title, String body, String url, String tag) {}
}
