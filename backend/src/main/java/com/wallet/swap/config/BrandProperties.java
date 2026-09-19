package com.wallet.swap.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix="wallet.brand")
public record BrandProperties(String name) {
  public BrandProperties {
    name = name == null || name.isBlank() ? "Swap Assistant" : name.trim();
    if (!name.matches("[A-Za-z0-9][A-Za-z0-9 &._-]{0,39}")) throw new IllegalArgumentException("Invalid plain-text brand name.");
  }
  public String render(String text) { return text.replace("Swap Assistant",name); }
}
