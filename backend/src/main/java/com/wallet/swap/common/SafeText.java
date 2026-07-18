package com.wallet.swap.common;

public final class SafeText {
  public static final String DISPLAY_LABEL_PATTERN = "^[^\\p{Cc}\\p{Cf}]+$";
  public static final String IDENTIFIER_PATTERN = "^[^\\p{Cc}\\p{Cf}\\s]+$";

  private SafeText() {}
}
