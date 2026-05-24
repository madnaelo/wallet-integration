package com.wallet.swap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SwapBackendApplication {
  public static void main(String[] args) {
    SpringApplication.run(SwapBackendApplication.class, args);
  }
}
