package com.wallet.swap.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class WalletMutationLock {
  private final JdbcTemplate jdbcTemplate;

  public WalletMutationLock(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void lock(String walletAddress) {
    jdbcTemplate.queryForObject(
        "SELECT wallet_address FROM wallet_users WHERE wallet_address = ? FOR UPDATE",
        String.class,
        walletAddress);
  }
}
