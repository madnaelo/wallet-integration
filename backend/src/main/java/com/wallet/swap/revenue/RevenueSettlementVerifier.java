package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.history.LifiTransferStatusClient;
import com.wallet.swap.history.SwapHistoryRepository.TransferStatusCandidate;
import com.wallet.swap.revenue.RevenueModels.*;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public class RevenueSettlementVerifier {
  private static final String TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  private final RevenueRpcClient rpc;
  private final LifiTransferStatusClient lifi;
  private final ObjectMapper mapper;
  public RevenueSettlementVerifier(RevenueRpcClient rpc, LifiTransferStatusClient lifi, ObjectMapper mapper) {
    this.rpc = rpc;
    this.lifi = lifi;
    this.mapper = mapper;
  }

  public Settlement verify(Claim claim, RevenueRepository.SignedQuote signed) {
    Snapshot q = signed.snapshot();
    ObjectNode evidence = mapper.createObjectNode().put("adapter", "evm-receipt-v1")
        .put("quoteId", q.id().toString()).put("chain", q.sourceChain()).put("transactionHash", claim.txHash());
    if (!q.taker().matches("0x[0-9a-fA-F]{40}") || !claim.txHash().matches("0x[0-9a-fA-F]{64}")) {
      return unverified("unsupported_source_evidence", false, evidence);
    }
    if (!rpc.supports(q.sourceChain())) return unverified("chain_rpc_not_configured", false, evidence);
    if (!hex(rpc.call(q.sourceChain(), "eth_chainId", List.of()).asText()).equals(BigInteger.valueOf(q.sourceChain()))) {
      return unverified("rpc_chain_mismatch", false, evidence);
    }
    JsonNode tx = rpc.call(q.sourceChain(), "eth_getTransactionByHash", List.of(claim.txHash()));
    JsonNode receipt = rpc.call(q.sourceChain(), "eth_getTransactionReceipt", List.of(claim.txHash()));
    if (tx.isNull() || receipt.isNull()) return unverified("awaiting_transaction", true, evidence);
    if (!same(tx.path("hash").asText(), claim.txHash()) || !same(receipt.path("transactionHash").asText(), claim.txHash())
        || !same(tx.path("from").asText(), q.taker()) || !same(claim.wallet(), q.taker())
        || !same(tx.path("to").asText(), q.transactionTo())
        || !hex(tx.path("value").asText()).equals(new BigInteger(q.transactionValue()))
        || !RevenueIntegrity.hash(tx.path("input").asText().toLowerCase(Locale.ROOT)).equals(q.dataHash())) {
      return unverified("transaction_binding_mismatch", false, evidence);
    }
    if (tx.path("blockHash").isNull() || receipt.path("blockNumber").isMissingNode()) {
      return unverified("awaiting_inclusion", true, evidence);
    }
    JsonNode finalized = rpc.call(q.sourceChain(), "eth_getBlockByNumber", List.of("finalized", false));
    if (finalized.isNull() || hex(finalized.path("number").asText()).compareTo(hex(receipt.path("blockNumber").asText())) < 0) {
      return unverified("awaiting_finality", true, evidence);
    }
    JsonNode block = rpc.call(q.sourceChain(), "eth_getBlockByNumber", List.of(receipt.path("blockNumber").asText(), false));
    if (block.isNull() || !same(block.path("hash").asText(), receipt.path("blockHash").asText())
        || !same(tx.path("blockHash").asText(), receipt.path("blockHash").asText())) {
      return unverified("canonical_block_mismatch", true, evidence);
    }
    Instant included = Instant.ofEpochSecond(hex(block.path("timestamp").asText()).longValueExact());
    evidence.put("blockHash", block.path("hash").asText()).put("blockNumber", receipt.path("blockNumber").asText())
        .put("finalizedBlock", finalized.path("number").asText()).put("includedAt", included.toString())
        .put("receiptHash", RevenueIntegrity.hash(receipt.toString()));
    if (included.isBefore(signed.issuedAt().minusSeconds(30)) || included.isAfter(signed.issuedAt().plusSeconds(900))) {
      return unverified("outside_quote_binding_window", false, evidence);
    }
    if ("0x0".equals(receipt.path("status").asText())) {
      return new Settlement(State.FAILED,"transaction_reverted","evm_rpc",false,null,null,false,evidence);
    }
    if (!"0x1".equals(receipt.path("status").asText())) return unverified("unknown_receipt_status", false, evidence);

    BigInteger volume = contractToken(q.sellToken().address())
        ? netReceived(receipt, q.sellToken().address(), q.taker(), evidence, "sourceTransfers").negate() : null;
    if (volume != null && (volume.signum() <= 0 || volume.compareTo(new BigInteger(q.sellAmount())) > 0)) volume = null;
    boolean confirmed = false;
    if ("0x".equals(q.provider()) && q.sourceChain() == q.destinationChain() && contractToken(q.buyToken().address())) {
      BigInteger output = netReceived(receipt, q.buyToken().address(), q.recipient(), evidence, "destinationTransfers");
      confirmed = output.signum() > 0 && output.compareTo(new BigInteger(q.minimumAmount())) >= 0;
      evidence.put("receivedOutput", output.toString());
    }
    if ("lifi".equals(q.provider())) {
      var status = lifi.check(new TransferStatusCandidate(claim.id(), q.sourceChain(), q.destinationChain(),
          claim.txHash(), q.bridge(), claim.attempts(), claim.leaseToken()));
      evidence.put("providerStatus", status.providerStatus()).put("providerSubstatus", status.providerSubstatus())
          .put("destinationTransactionHash", status.destinationTransactionHash());
      confirmed = status.checked() && "confirmed".equals(status.status()) && "COMPLETED".equals(status.providerSubstatus());
      boolean pending = !status.checked() || "submitted".equals(status.status());
      return new Settlement(State.NOT_VERIFIED, "lifi_fee_has_no_transaction_scoped_proof", "evm_rpc+lifi_status",
          pending, null, confirmed ? volume : null, confirmed, evidence);
    }
    if (!contractToken(q.feeToken().address())) {
      return new Settlement(State.NOT_VERIFIED,"native_fee_requires_trace_evidence","evm_rpc",false,null,
          confirmed ? volume : null,confirmed,evidence);
    }
    BigInteger received = netReceived(receipt, q.feeToken().address(), q.beneficiary(), evidence, "treasuryTransfers");
    evidence.put("treasuryNetReceived", received.toString()).put("feeToken", q.feeToken().address())
        .put("beneficiary", q.beneficiary()).put("configuredBps", q.feeBps()).put("expectedFee", q.expectedFee());
    if (!received.equals(new BigInteger(q.expectedFee()))) {
      return new Settlement(State.NOT_VERIFIED,"fee_transfer_amount_mismatch","evm_rpc",false,null,
          confirmed ? volume : null,confirmed,evidence);
    }
    return new Settlement(State.RECEIVED,"finalized_exact_treasury_transfer","evm_rpc",false,received,
        confirmed ? volume : null,confirmed,evidence);
  }

  static BigInteger netReceived(JsonNode receipt, String token, String address, ObjectNode evidence, String key) {
    BigInteger total = BigInteger.ZERO;
    var transfers = evidence.putArray(key);
    for (JsonNode log : receipt.path("logs")) {
      JsonNode topics = log.path("topics");
      if (!same(log.path("address").asText(), token) || topics.size() != 3
          || !same(topics.path(0).asText(), TRANSFER) || log.path("removed").asBoolean(false)) continue;
      String from = topicAddress(topics.path(1).asText());
      String to = topicAddress(topics.path(2).asText());
      if (!same(from, address) && !same(to, address)) continue;
      if (!log.path("data").asText().matches("0x[0-9a-fA-F]{64}")) throw new IllegalArgumentException("Invalid transfer data.");
      BigInteger amount = hex(log.path("data").asText());
      if (same(to, address)) total = total.add(amount);
      if (same(from, address)) total = total.subtract(amount);
      transfers.addObject().put("index", log.path("logIndex").asText()).put("from", from).put("to", to).put("amount", amount.toString());
    }
    return total;
  }

  private Settlement unverified(String reason, boolean retry, ObjectNode evidence) {
    return new Settlement(State.NOT_VERIFIED,reason,"evm_rpc",retry,null,null,false,evidence);
  }
  static BigInteger hex(String value) {
    if (!value.matches("0x[0-9a-fA-F]{1,64}")) throw new IllegalArgumentException("Invalid RPC integer.");
    return new BigInteger(value.substring(2),16);
  }
  private static String topicAddress(String value) {
    if (!value.matches("0x0{24}[0-9a-fA-F]{40}")) throw new IllegalArgumentException("Invalid indexed address.");
    return "0x" + value.substring(26);
  }
  private static boolean contractToken(String value) {
    return value.matches("0x[0-9a-fA-F]{40}") && !"native".equals(RevenueIntegrity.assetKey(value));
  }
  private static boolean same(String a, String b) { return !a.isBlank() && a.equalsIgnoreCase(b); }
}
