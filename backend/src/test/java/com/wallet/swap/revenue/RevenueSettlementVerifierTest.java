package com.wallet.swap.revenue;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.wallet.swap.revenue.RevenueFixtures.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.history.LifiTransferStatusClient;
import com.wallet.swap.revenue.RevenueModels.*;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.web3j.crypto.Hash;

class RevenueSettlementVerifierTest {
  private final RevenueRpcClient rpc = mock(RevenueRpcClient.class);
  private final LifiTransferStatusClient lifi = mock(LifiTransferStatusClient.class);
  private final RevenueSettlementVerifier verifier = new RevenueSettlementVerifier(rpc,lifi,JSON);
  private final Snapshot quote = quote();
  private final Instant now = Instant.now();
  private final Claim claim = new Claim(UUID.randomUUID(),quote.id(),UUID.randomUUID(),OWNER,TX,1,now);
  private ObjectNode receipt;

  @BeforeEach void rpcFixture() {
    when(rpc.supports(1)).thenReturn(true);
    when(rpc.call(1,"eth_chainId",List.of())).thenReturn(JSON.getNodeFactory().textNode("0x1"));
    ObjectNode tx = JSON.createObjectNode().put("hash",TX).put("from",OWNER).put("to",ROUTER).put("value","0x0")
        .put("input","0xabcd").put("blockHash",BLOCK);
    receipt = JSON.createObjectNode().put("transactionHash",TX).put("blockHash",BLOCK).put("blockNumber","0x64").put("status","0x1");
    var logs = receipt.putArray("logs");
    logs.add(transfer(SELL,OWNER,ROUTER,998000,0));
    logs.add(transfer(SELL,OWNER,TREASURY,2000,1));
    logs.add(transfer(BUY,ROUTER,OWNER,5000000,2));
    when(rpc.call(1,"eth_getTransactionByHash",List.of(TX))).thenReturn(tx);
    when(rpc.call(1,"eth_getTransactionReceipt",List.of(TX))).thenReturn(receipt);
    when(rpc.call(1,"eth_getBlockByNumber",List.of("finalized",false))).thenReturn(JSON.createObjectNode().put("number","0x78"));
    when(rpc.call(1,"eth_getBlockByNumber",List.of("0x64",false))).thenReturn(
        JSON.createObjectNode().put("hash",BLOCK).put("timestamp","0x"+Long.toHexString(now.getEpochSecond())));
  }
  @Test void recognizesOnlyAnExactFinalizedTreasuryTransfer() {
    Settlement result = verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now));
    assertThat(result.state()).isEqualTo(State.RECEIVED);
    assertThat(result.fee()).isEqualTo(BigInteger.valueOf(2000));
    assertThat(result.volume()).isEqualTo(BigInteger.valueOf(1000000));
    assertThat(result.swapConfirmed()).isTrue();
    assertThat(result.evidence().path("treasuryTransfers")).hasSize(1);
  }
  @Test void rejectsPositiveButWrongPayout() {
    ((ObjectNode) receipt.path("logs").get(1)).put("data","0x"+String.format("%064x",1999));
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now)).state()).isEqualTo(State.NOT_VERIFIED);
  }
  @Test void doesNotVerifyReorgedOrUnfinalizedTransactions() {
    when(rpc.call(1,"eth_getBlockByNumber",List.of("finalized",false))).thenReturn(JSON.createObjectNode().put("number","0x63"));
    Settlement result = verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now));
    assertThat(result.retry()).isTrue();
    assertThat(result.fee()).isNull();
    assertThat(result.swapConfirmed()).isFalse();
  }
  @Test void rejectsDifferentTransactionAndWrongChain() {
    Snapshot changed = change(quote,"dataHash",RevenueIntegrity.hash("0xdead"));
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(changed,now)).reason()).isEqualTo("transaction_binding_mismatch");
    when(rpc.call(1,"eth_chainId",List.of())).thenReturn(JSON.getNodeFactory().textNode("0xa"));
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now)).reason()).isEqualTo("rpc_chain_mismatch");
  }
  @Test void revertedReceiptIsFailureNotReceived() {
    receipt.put("status","0x0");
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now)).state()).isEqualTo(State.FAILED);
  }
  @Test void nativeFeesAndLifiCompletionDoNotInventFeeProof() {
    Snapshot nativeQuote = change(quote,"feeToken",new Token("ETH","ETH",18));
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(nativeQuote,now)).reason()).isEqualTo("native_fee_requires_trace_evidence");
    Snapshot lifiQuote = change(quote,"provider","lifi");
    when(lifi.check(any())).thenReturn(new LifiTransferStatusClient.StatusResult(true,"confirmed","DONE","COMPLETED",TX,null));
    Settlement result = verifier.verify(claim,new RevenueRepository.SignedQuote(lifiQuote,now));
    assertThat(result.state()).isEqualTo(State.NOT_VERIFIED);
    assertThat(result.swapConfirmed()).isTrue();
    assertThat(result.fee()).isNull();
  }
  @Test void netsTreasuryOutflowsAndIgnoresUnrelatedTokenEvents() {
    receipt.withArray("logs").add(transfer(SELL,TREASURY,ROUTER,1,3));
    receipt.withArray("logs").add(transfer(BUY,ROUTER,TREASURY,2000,4));
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now)).state()).isEqualTo(State.NOT_VERIFIED);
  }
  @Test void oldTransactionCannotBeReusedForNewQuote() {
    assertThat(verifier.verify(claim,new RevenueRepository.SignedQuote(quote,now.plusSeconds(90))).reason())
        .isEqualTo("outside_quote_binding_window");
  }
  private ObjectNode transfer(String token,String from,String to,long amount,int index) {
    ObjectNode log = JSON.createObjectNode().put("address",token).put("data","0x"+String.format("%064x",amount))
        .put("logIndex","0x"+Integer.toHexString(index));
    log.putArray("topics").add(Hash.sha3String("Transfer(address,address,uint256)"))
        .add("0x"+"0".repeat(24)+from.substring(2)).add("0x"+"0".repeat(24)+to.substring(2));
    return log;
  }
}
