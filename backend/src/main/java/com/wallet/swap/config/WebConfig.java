package com.wallet.swap.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@EnableConfigurationProperties({
    ApiProperties.class,
    AuthProperties.class,
    FeatureProperties.class,
    LimitOrderProperties.class,
    MaintenanceProperties.class,
    NotificationProperties.class
})
public class WebConfig implements WebMvcConfigurer {
  private final ApiProperties apiProperties;

  public WebConfig(ApiProperties apiProperties) {
    this.apiProperties = apiProperties;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    List<String> origins = Arrays.stream(apiProperties.getCorsAllowedOrigins().split(","))
        .map(String::trim)
        .filter(origin -> !origin.isBlank())
        .toList();

    if (origins.contains("*")) {
      registry.addMapping("/api/**")
          .allowedOriginPatterns("*")
          .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
          .allowedHeaders("Authorization", "Content-Type", "X-Admin-Key", RequestCorrelationFilter.HEADER_NAME)
          .exposedHeaders(RequestCorrelationFilter.HEADER_NAME)
          .allowCredentials(false)
          .maxAge(3600);
      return;
    }

    registry.addMapping("/api/**")
        .allowedOrigins(origins.toArray(String[]::new))
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("Authorization", "Content-Type", "X-Admin-Key", RequestCorrelationFilter.HEADER_NAME)
        .exposedHeaders(RequestCorrelationFilter.HEADER_NAME)
        .allowCredentials(true)
        .maxAge(3600);
  }
}
