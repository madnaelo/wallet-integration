package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;

class BrandPropertiesTest {
  @Test void supportsOneConsistentBrandWithoutChangingDefaultIdentity() {
    assertThat(new BrandProperties(null).name()).isEqualTo("Swap Assistant");
    assertThat(new BrandProperties("River Swap").render("Sign in to Swap Assistant."))
        .isEqualTo("Sign in to River Swap.");
  }
  @Test void rejectsHeaderInjectionAndMarkup() {
    assertThatThrownBy(() -> new BrandProperties("Example\r\nBcc:other@example.test")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new BrandProperties("<script>alert(1)</script>")).isInstanceOf(IllegalArgumentException.class);
  }
}
