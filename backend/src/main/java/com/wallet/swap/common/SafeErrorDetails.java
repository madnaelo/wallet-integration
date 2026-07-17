package com.wallet.swap.common;

import java.util.LinkedHashSet;
import java.util.Set;

public final class SafeErrorDetails {
  private static final int MAX_CAUSE_DEPTH = 3;

  private SafeErrorDetails() {}

  public static String summarize(Throwable throwable) {
    if (throwable == null) return "";

    Set<String> types = new LinkedHashSet<>();
    Throwable current = throwable;
    for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
      String type = current.getClass().getSimpleName();
      types.add(type.isBlank() ? "Exception" : type);
      if (current.getCause() == current) break;
      current = current.getCause();
    }
    return String.join(" caused by ", types);
  }
}
