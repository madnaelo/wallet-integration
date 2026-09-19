package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.revenue.RevenueModels.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class RevenueFixtures {
  static final ObjectMapper JSON = new ObjectMapper();
  static final String SECRET = "synthetic-test-secret-not-a-production-credential";
  static final String OWNER = "0x" + "1".repeat(40);
  static final String SELL = "0x" + "2".repeat(40);
  static final String TREASURY = "0x" + "3".repeat(40);
  static final String ROUTER = "0x" + "4".repeat(40);
  static final String BUY = "0x" + "5".repeat(40);
  static final String TX = "0x" + "6".repeat(64);
  static final String BLOCK = "0x" + "7".repeat(64);
  static Snapshot quote() {
    return new Snapshot(UUID.randomUUID(),"0x","provider-quote","","evm-same-chain",1,1,OWNER,OWNER,OWNER,
        new Token(SELL,"USDC",6),new Token(BUY,"USDT",6),new Token(SELL,"USDC",6),
        "1000000","5000000","4900000",20,"2000",TREASURY,"sell_amount_floor",ROUTER,"0",RevenueIntegrity.hash("0xabcd"));
  }
  static Envelope envelope(Snapshot quote) { return envelope(new Batch(UUID.randomUUID(),1,Instant.now().toEpochMilli(),
      quote == null ? List.of() : List.of(quote),List.of(new Outcome("0x","quoted")))); }
  static Envelope envelope(Batch batch) {
    try {
      String payload = JSON.writeValueAsString(batch);
      return new Envelope(payload,RevenueIntegrity.sign(payload,SECRET));
    } catch (Exception exception) { throw new IllegalStateException(exception); }
  }
  static RevenueProperties properties() { return new RevenueProperties(true,SECRET,Map.of()); }
  static Snapshot change(Snapshot quote, String field, Object value) {
    var node = JSON.valueToTree(quote);
    ((com.fasterxml.jackson.databind.node.ObjectNode) node).set(field,JSON.valueToTree(value));
    return JSON.convertValue(node,Snapshot.class);
  }
}
