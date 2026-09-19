package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class RevenueRpcClient {
  private static final int MAX_RESPONSE = 2 * 1024 * 1024;
  private final Map<Long, URI> endpoints;
  private final RestClient client;
  private final ObjectMapper mapper;

  public RevenueRpcClient(RevenueProperties properties, RestClient.Builder builder, ObjectMapper mapper) {
    Map<Long, URI> configured = new HashMap<>();
    properties.rpcUrls().forEach((chain, value) -> {
      if (value == null || value.isBlank()) return;
      URI uri = URI.create(value);
      if (chain <= 0 || !"https".equals(uri.getScheme()) || uri.getHost() == null
          || uri.getUserInfo() != null || uri.getFragment() != null) {
        throw new IllegalArgumentException("Revenue RPC endpoints must be explicitly configured HTTPS URLs.");
      }
      configured.put(chain, uri);
    });
    endpoints = Map.copyOf(configured);
    this.mapper = mapper;
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(4));
    factory.setReadTimeout(Duration.ofSeconds(8));
    client = builder.requestFactory(factory).build();
  }
  public boolean supports(long chain) { return endpoints.containsKey(chain); }
  public JsonNode call(long chain, String method, List<?> params) {
    URI endpoint = endpoints.get(chain);
    if (endpoint == null) throw new IllegalStateException("Revenue RPC is not configured for this chain.");
    return client.post().uri(endpoint).body(Map.of("jsonrpc","2.0","id",1,"method",method,"params",params))
        .exchange((request, response) -> {
          if (!response.getStatusCode().is2xxSuccessful()) throw new IOException("Revenue RPC unavailable.");
          byte[] bytes = response.getBody().readNBytes(MAX_RESPONSE + 1);
          if (bytes.length > MAX_RESPONSE) throw new IOException("Revenue RPC response too large.");
          JsonNode body = mapper.readTree(bytes);
          if (body == null || body.has("error") || body.path("id").asInt(-1) != 1 || !body.has("result")) {
            throw new IOException("Revenue RPC returned an invalid response.");
          }
          return body.get("result");
        });
  }
}
