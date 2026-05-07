package com.wallet.swap.auth;

import java.util.Locale;
import java.util.regex.Pattern;

public final class WalletAddress {
  private static final Pattern ETH_ADDRESS = Pattern.compile("^0x[a-fA-F0-9]{40}$");

  private WalletAddress() {}

  public static String normalize(String address) {
    if (address == null || !ETH_ADDRESS.matcher(address).matches()) {
      throw new IllegalArgumentException("Invalid wallet address.");
    }
    return address.toLowerCase(Locale.ROOT);
  }
}
