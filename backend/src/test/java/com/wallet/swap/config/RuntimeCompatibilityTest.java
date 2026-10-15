package com.wallet.swap.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(classes = RuntimeCompatibilityTest.TestApplication.class, properties = {
    "spring.config.location=optional:classpath:/runtime-compatibility-test.yml",
    "spring.http.converters.preferred-json-mapper=jackson2",
    "debug=false",
    "spring.flyway.enabled=false"
})
class RuntimeCompatibilityTest {
  @Autowired private WebApplicationContext context;
  @Autowired private ObjectMapper mapper;
  @Autowired private RestClient.Builder restClientBuilder;

  private static final String BODY = """
      {"amount":"1000000000000000001","at":"2026-10-15T12:00:00Z",
       "fee":0.123456789012345678,"quote":{"amount":"9007199254740993","routes":["0x"]}}
      """;

  @Test void productionConfigRetainsJsonCompatibilityAndPrivateErrors() {
    // Parse configuration without resolving imports or loading developer credentials.
    var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("application.yml"));
    var properties = yaml.getObject();
    assertThat(properties).containsEntry("spring.http.converters.preferred-json-mapper", "jackson2")
        .containsEntry("spring.web.error.include-message", "never")
        .containsEntry("spring.web.error.include-stacktrace", "never")
        .containsEntry("spring.web.error.include-exception", false);
  }

  @Test void mvcPreservesJsonNodesExactAmountsAndIsoTimestamps() throws Exception {
    var mvc = MockMvcBuilders.webAppContextSetup(context).build();
    String response = mvc.perform(post("/runtime-test").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(mapper.readValue(response, Payload.class)).isEqualTo(mapper.readValue(BODY, Payload.class));
    assertThat(mapper.readTree(response).path("at").asText()).isEqualTo("2026-10-15T12:00:00Z");
    assertThat(mapper.readTree(response).path("quote").path("amount").asText()).isEqualTo("9007199254740993");
  }

  @Test void mvcStillRejectsInvalidAndMalformedRequests() throws Exception {
    var mvc = MockMvcBuilders.webAppContextSetup(context).build();
    mvc.perform(post("/runtime-test").contentType(MediaType.APPLICATION_JSON).content(BODY.replace("1000000000000000001", "")))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/runtime-test").contentType(MediaType.APPLICATION_JSON).content("{"))
        .andExpect(status().isBadRequest());
  }

  @Test void autoConfiguredProviderClientUsesTheExistingJacksonNodeContract() throws Exception {
    var builder = restClientBuilder.clone();
    var server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://provider.invalid/fixture"))
        .andRespond(withSuccess(BODY, MediaType.APPLICATION_JSON));
    JsonNode result = builder.build().get().uri("https://provider.invalid/fixture").retrieve().body(JsonNode.class);
    assertThat(result).isEqualTo(mapper.readTree(BODY));
    server.verify();
  }

  @SpringBootConfiguration
  @EnableAutoConfiguration(excludeName = "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration")
  @Import(EchoController.class)
  static class TestApplication {}

  @RestController
  static class EchoController {
    @PostMapping("/runtime-test")
    Payload echo(@Valid @RequestBody Payload payload) { return payload; }
  }

  record Payload(@NotBlank String amount, Instant at, BigDecimal fee, JsonNode quote) {}
}
