package com.wallet.swap.marketradar;

import com.wallet.swap.config.NotificationProperties;
import com.wallet.swap.marketradar.MarketRadarModels.RadarNotification;
import com.wallet.swap.notification.NotificationMessageFormatter.PushNotificationPayload;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public final class MarketRadarMessages {
  private MarketRadarMessages() {}

  public static PushNotificationPayload push(
      NotificationProperties properties, RadarNotification message) {
    String action =
        switch (message.eventType()) {
          case SUPPLY_APPROACHED -> "is approaching an observed supply zone";
          case DEMAND_APPROACHED -> "is approaching an observed demand zone";
          case ZONE_STRENGTHENED -> "has a strengthening liquidity zone";
          case ZONE_WEAKENED -> "has a weakening liquidity zone";
          case ZONE_BROKEN -> "has moved through a previously observed liquidity zone";
          case BUYER_ABSORPTION_INCREASED ->
              "shows increased buying through visible selling liquidity";
          case SELLER_ABSORPTION_INCREASED ->
              "shows increased selling through visible buying liquidity";
        };
    String pair = message.pairKey().replace("/SPOT", "");
    String body =
        pair
            + " "
            + action
            + " at "
            + message.lower().stripTrailingZeros().toPlainString()
            + " to "
            + message.upper().stripTrailingZeros().toPlainString()
            + ". Structural strength "
            + message.structuralScore()
            + "/100; "
            + message.venueCount()
            + " venues contributing."
            + " Observed structure, not a guaranteed reversal or instruction to trade.";
    String base = properties.getAppUrl().replaceAll("/+$", "");
    String url =
        base + "/market-radar?pair=" + URLEncoder.encode(message.pairKey(), StandardCharsets.UTF_8);
    return new PushNotificationPayload(
        "Market Radar: " + pair, body, url, "radar-" + message.eventId());
  }
}
