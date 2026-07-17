package com.wallet.swap.limitorder;

final class LimitOrderProviderSupport {
  static final String COW_SETTLEMENT_CONTRACT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  static final String ONEINCH_LIMIT_ORDER_CONTRACT = "0x111111125421ca6dc452d289314280a0f8842a65";

  private LimitOrderProviderSupport() {}

  static String cowNetworkPath(long chainId) {
    return switch ((int) chainId) {
      case 1 -> "mainnet";
      case 56 -> "bnb";
      case 100 -> "xdai";
      case 137 -> "polygon";
      case 8453 -> "base";
      case 9745 -> "plasma";
      case 42161 -> "arbitrum_one";
      case 43114 -> "avalanche";
      case 57073 -> "ink";
      case 59144 -> "linea";
      default -> null;
    };
  }
}
