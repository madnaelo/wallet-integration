package com.wallet.swap.revenue;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.wallet.swap.revenue.RevenueFixtures.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wallet.swap.history.LifiTransferStatusClient;
import com.wallet.swap.revenue.RevenueModels.*;
import jakarta.validation.Validation;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(named="REVENUE_TEST_DATABASE_URL", matches="jdbc:postgresql://.+/(wallet_ci|wallet_revenue_test)")
class RevenueDatabaseTest {
  private static final String TX_B = "0x" + "8".repeat(64);
  private static String schema;
  private static JdbcTemplate jdbc;
  private static JdbcTemplate root;
  private static RevenueRepository repository;
  private static RevenueIntegrity integrity;
  private static TransactionTemplate transaction;
  private static int migratedLegacyRecords;
  private static boolean legacyAmountsUnverified;

  @BeforeAll static void database() {
    String url = System.getenv("REVENUE_TEST_DATABASE_URL");
    String user = System.getenv("REVENUE_TEST_DATABASE_USERNAME");
    String password = System.getenv("REVENUE_TEST_DATABASE_PASSWORD");
    schema = "revenue_test_" + UUID.randomUUID().toString().replace("-","");
    root = new JdbcTemplate(new DriverManagerDataSource(url,user,password));
    root.execute("CREATE SCHEMA " + schema);
    var source = new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);
    Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("29").cleanDisabled(true).load().migrate();
    jdbc = new JdbcTemplate(source);
    jdbc.update("INSERT INTO wallet_users(wallet_address) VALUES (?),(?)",OWNER,TREASURY);
    jdbc.update("""
        INSERT INTO swap_history(id,wallet_address,chain_id,buy_chain_id,tx_hash,status,
          sell_token_address,sell_token_symbol,sell_token_decimals,buy_token_address,buy_token_symbol,buy_token_decimals,
          sell_amount_raw,buy_amount_raw,aggregator)
        SELECT gen_random_uuid(),CASE WHEN i=1 THEN ? ELSE ? END,1,1,
          CASE WHEN i=3 THEN 'dry-run' ELSE ? END,CASE WHEN i=3 THEN 'dry_run' ELSE 'confirmed' END,
          ?,'USDC',6,?,'USDT',6,1000000,5000000,'0x' FROM generate_series(1,3) AS i
        """,OWNER,TREASURY,TX,SELL,BUY);
    Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("30").cleanDisabled(true).load().migrate();
    // Exercise an existing V30 installation before applying the quote-reuse upgrade.
    Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).cleanDisabled(true).load().migrate();
    migratedLegacyRecords = jdbc.queryForObject("SELECT count(*) FROM revenue_records",Integer.class);
    legacyAmountsUnverified = jdbc.queryForObject("""
        SELECT bool_and(state='NOT_VERIFIED' AND quote_id IS NULL AND verified_fee IS NULL AND next_check_at IS NULL)
        FROM revenue_records
        """,Boolean.class);
    transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
    integrity = new RevenueIntegrity(properties(),JSON,Validation.buildDefaultValidatorFactory().getValidator());
    repository = new RevenueRepository(jdbc,JSON,integrity);
  }
  @AfterAll static void cleanup() {
    if (root != null && schema != null && schema.matches("revenue_test_[0-9a-f]{32}")) root.execute("DROP SCHEMA "+schema+" CASCADE");
  }
  @BeforeEach void emptyOwnTestSchema() {
    jdbc.execute("TRUNCATE revenue_settlement_evidence,revenue_records,revenue_provider_attempts,revenue_quotes,revenue_quote_batches,swap_history CASCADE");
    jdbc.update("INSERT INTO wallet_users(wallet_address) VALUES (?) ON CONFLICT DO NOTHING",OWNER);
  }

  @Test void migrationAndIdempotentIngestionPreserveSignedOrigin() {
    Snapshot quote = quote();
    Envelope envelope = envelope(quote);
    upload(envelope); upload(envelope);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_quotes",Integer.class)).isEqualTo(1);
    assertThat(repository.loadQuote(quote.id()).snapshot()).isEqualTo(quote);
    jdbc.update("UPDATE revenue_quote_batches SET payload=replace(payload,'2000','2001')");
    assertThatThrownBy(() -> repository.loadQuote(quote.id())).hasMessageContaining("signature");
  }
  @Test void legacyMigrationDeduplicatesTransactionsAndDoesNotTrustBrowserConfirmation() {
    assertThat(migratedLegacyRecords).isEqualTo(1);
    assertThat(legacyAmountsUnverified).isTrue();
  }
  @Test void submittedRecordsAreIdempotentAndCannotCountOneTransactionTwice() {
    Snapshot quote = quote(); upload(envelope(quote));
    UUID history = history(TX);
    repository.bind(history,quote.id(),OWNER,1,TX);
    repository.bind(history,quote.id(),OWNER,1,TX);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_records",Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT state FROM revenue_records",String.class)).isEqualTo("EXPECTED");
    assertThatThrownBy(() -> repository.bind(UUID.randomUUID(),quote.id(),OWNER,1,TX)).hasMessageContaining("conflicts");
  }
  @Test void cachedQuoteBindsTwoTransactionsAndEachNeedsItsOwnFinalizedProof() {
    Snapshot quote = quote(); upload(envelope(quote));
    repository.review(quote.id(),OWNER);
    UUID historyA = history(TX);
    UUID historyB = history(TX_B);
    repository.bind(historyA,quote.id(),OWNER,1,TX);
    repository.bind(historyB,quote.id(),OWNER,1,TX_B);
    repository.bind(historyA,quote.id(),OWNER,1,TX);
    assertThatThrownBy(() -> repository.bind(historyB,quote.id(),OWNER,1,TX)).hasMessageContaining("conflicts");
    assertThatThrownBy(() -> repository.bind(historyA,quote.id(),OWNER,1,"0x"+"9".repeat(64))).hasMessageContaining("conflicts");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_records WHERE state='EXPECTED'",Integer.class)).isEqualTo(2);
    assertThat(fees().get("expected")).isEqualTo("4000");
    assertThat(fees().get("received")).isNull();

    RevenueRpcClient rpc = mock(RevenueRpcClient.class);
    rpcTransaction(rpc,TX,2000,"0x64");
    rpcTransaction(rpc,TX_B,2000,"0x65");
    RevenueSettlementVerifier verifier = new RevenueSettlementVerifier(rpc,mock(LifiTransferStatusClient.class),JSON);
    for (int i=0; i<2; i++) {
      Claim claim = reconcileNext(verifier);
      var evidence = repository.evidence(claim.id());
      assertThat(evidence).hasSize(1);
      assertThat(evidence.get(0).get("source")).isEqualTo("evm_rpc");
      assertThat(evidence.get(0).get("state")).isEqualTo("RECEIVED");
      assertThat(evidence.get(0).get("evidence").toString()).contains(quote.id().toString(),claim.txHash());
    }
    verify(rpc).call(1,"eth_getTransactionReceipt",List.of(TX));
    verify(rpc).call(1,"eth_getTransactionReceipt",List.of(TX_B));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_records WHERE state='RECEIVED'",Integer.class)).isEqualTo(2);
    assertThat(repository.claim()).isNull();
    repository.bind(historyA,quote.id(),OWNER,1,TX);
    assertThat(fees().get("received")).isEqualTo("4000");
    assertThat(fees().get("accrued")).isNull();
    Map<String,Object> report = report();
    assertThat(report.get("funnel")).isEqualTo(Map.of("quote_requests",1L,"quoted_routes",1L,
        "reviewed_routes",1L,"submitted_routes",2L,"independently_confirmed_routes",2L));
    Map<?,?> volume = (Map<?,?>) ((List<?>) report.get("volumeGroups")).get(0);
    assertThat(volume.get("confirmed_swaps")).isEqualTo(2L);
    assertThat(volume.get("amount")).isEqualTo("2000000");
  }
  @ParameterizedTest
  @ValueSource(strings={"wrong_fee","unfinalized","reused_receipt","different_calldata","different_owner","outside_window"})
  void reusedQuoteCannotBorrowTheOtherTransactionsProof(String failure) {
    Snapshot quote = quote(); upload(envelope(quote));
    repository.bind(history(TX),quote.id(),OWNER,1,TX);
    repository.bind(history(TX_B),quote.id(),OWNER,1,TX_B);
    RevenueRpcClient rpc = mock(RevenueRpcClient.class);
    rpcTransaction(rpc,TX,2000,"0x64");
    ObjectNode receiptB = rpcTransaction(rpc,TX_B,failure.equals("wrong_fee") ? 1999 : 2000,
        failure.equals("unfinalized") ? "0x79" : "0x65");
    switch (failure) {
      case "reused_receipt" -> receiptB.put("transactionHash",TX);
      case "different_calldata" -> ((ObjectNode) rpc.call(1,"eth_getTransactionByHash",List.of(TX_B))).put("input","0xdead");
      case "different_owner" -> ((ObjectNode) rpc.call(1,"eth_getTransactionByHash",List.of(TX_B))).put("from",TREASURY);
      case "outside_window" -> ((ObjectNode) rpc.call(1,"eth_getBlockByNumber",List.of("0x65",false)))
          .put("timestamp","0x"+Long.toHexString(Instant.now().minusSeconds(3600).getEpochSecond()));
      default -> { }
    }
    RevenueSettlementVerifier verifier = new RevenueSettlementVerifier(rpc,mock(LifiTransferStatusClient.class),JSON);
    reconcileNext(verifier); reconcileNext(verifier);
    assertThat(jdbc.queryForObject("SELECT state FROM revenue_records WHERE transaction_hash=?",String.class,TX)).isEqualTo("RECEIVED");
    assertThat(jdbc.queryForObject("SELECT state FROM revenue_records WHERE transaction_hash=?",String.class,TX_B)).isEqualTo("NOT_VERIFIED");
    assertThat(fees().get("received")).isEqualTo("2000");
    assertThat(fees().get("not_verified")).isEqualTo(1L);
    assertThat(repository.claim()).isNull();

    if (failure.equals("unfinalized")) {
      when(rpc.call(1,"eth_getBlockByNumber",List.of("finalized",false)))
          .thenReturn(JSON.createObjectNode().put("number","0x80"));
      jdbc.update("UPDATE revenue_records SET next_check_at=now() WHERE transaction_hash=?",TX_B);
      Claim retry = reconcileNext(verifier);
      assertThat(retry.txHash()).isEqualTo(TX_B);
      assertThat(repository.evidence(retry.id())).hasSize(2);
      assertThat(fees().get("received")).isEqualTo("4000");
      assertThat(fees().get("not_verified")).isEqualTo(0L);
    }
  }
  @Test void simultaneousWorkersCannotOwnTheSameLeaseAndStaleWorkersCannotFinish() throws Exception {
    Snapshot quote = quote(); upload(envelope(quote));
    repository.bind(history(TX),quote.id(),OWNER,1,TX);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var first = pool.submit(() -> transaction.execute(status -> repository.claim()));
      var second = pool.submit(() -> transaction.execute(status -> repository.claim()));
      Claim a = first.get(); Claim b = second.get();
      assertThat((a == null ? 0 : 1) + (b == null ? 0 : 1)).isEqualTo(1);
      Claim owned = a == null ? b : a;
      Claim stale = new Claim(owned.id(),owned.quoteId(),UUID.randomUUID(),OWNER,TX,1,Instant.now());
      Settlement received = received();
      transaction.executeWithoutResult(status -> repository.finish(stale,received));
      assertThat(jdbc.queryForObject("SELECT state FROM revenue_records",String.class)).isEqualTo("EXPECTED");
      transaction.executeWithoutResult(status -> repository.finish(owned,received));
      transaction.executeWithoutResult(status -> repository.finish(owned,received));
      assertThat(jdbc.queryForObject("SELECT state FROM revenue_records",String.class)).isEqualTo("RECEIVED");
      assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_settlement_evidence",Integer.class)).isEqualTo(1);
    } finally { pool.shutdownNow(); }
  }
  @Test void failedProofStaysUnverifiedAndRetriesStopAtTheBudget() {
    Snapshot quote = quote(); upload(envelope(quote));
    repository.bind(history(TX),quote.id(),OWNER,1,TX);
    jdbc.update("UPDATE revenue_records SET attempts=11");
    Claim claim = repository.claim();
    transaction.executeWithoutResult(status -> repository.finish(claim,new Settlement(State.NOT_VERIFIED,"pending","test_fixture",
        true,null,null,false,JSON.createObjectNode().put("pending",true))));
    assertThat(jdbc.queryForObject("SELECT state FROM revenue_records",String.class)).isEqualTo("NOT_VERIFIED");
    assertThat(jdbc.queryForObject("SELECT next_check_at IS NULL FROM revenue_records",Boolean.class)).isTrue();
    assertThat(repository.claim()).isNull();
  }
  @Test void reportsKeepTokenAmountsAndFunnelStagesSeparate() {
    Snapshot quote = quote(); upload(envelope(quote));
    repository.review(quote.id(),OWNER);
    repository.bind(history(TX),quote.id(),OWNER,1,TX);
    var before = repository.report(Instant.now().minusSeconds(60),Instant.now().plusSeconds(1),"day");
    assertThat(before.toString()).contains("expected=2000","accrued=null","received=null","reviewed_routes=1");
    Claim claim = repository.claim();
    transaction.executeWithoutResult(status -> repository.finish(claim,received()));
    var after = repository.report(Instant.now().minusSeconds(60),Instant.now().plusSeconds(1),"day");
    assertThat(after.toString()).contains("received=2000","amount=1000000","independently_confirmed_routes=1");
    assertThat(repository.records(Instant.now().minusSeconds(60),Instant.now().plusSeconds(1),0)).hasSize(1);
    assertThat(repository.evidence(claim.id())).hasSize(1);
  }
  @Test void transactionRollbackLeavesNeitherHistoryNorRevenuePartialWrites() {
    Snapshot quote = quote(); upload(envelope(quote));
    assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
      repository.bind(history(TX),quote.id(),OWNER,1,TX);
      throw new IllegalStateException("simulate later failure");
    })).hasMessageContaining("simulate");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM swap_history",Integer.class)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM revenue_records",Integer.class)).isZero();
  }

  private void upload(Envelope envelope) {
    transaction.executeWithoutResult(status -> repository.ingest(envelope,integrity.verify(envelope,true)));
  }
  private Map<String,Object> report() {
    return repository.report(Instant.now().minusSeconds(60),Instant.now().plusSeconds(1),"day");
  }
  private Map<?,?> fees() {
    List<?> groups = (List<?>) report().get("feeGroups");
    assertThat(groups).hasSize(1);
    return (Map<?,?>) groups.get(0);
  }
  private Claim reconcileNext(RevenueSettlementVerifier verifier) {
    Claim claim = transaction.execute(status -> repository.claim());
    assertThat(claim).isNotNull();
    Settlement settlement = verifier.verify(claim,repository.loadQuote(claim.quoteId()));
    transaction.executeWithoutResult(status -> repository.finish(claim,settlement));
    return claim;
  }
  private ObjectNode rpcTransaction(RevenueRpcClient rpc,String hash,long fee,String blockNumber) {
    when(rpc.supports(1)).thenReturn(true);
    when(rpc.call(1,"eth_chainId",List.of())).thenReturn(JSON.getNodeFactory().textNode("0x1"));
    String blockHash = hash.equals(TX) ? BLOCK : "0x"+"a".repeat(64);
    when(rpc.call(1,"eth_getTransactionByHash",List.of(hash))).thenReturn(JSON.createObjectNode()
        .put("hash",hash).put("from",OWNER).put("to",ROUTER).put("value","0x0").put("input","0xabcd").put("blockHash",blockHash));
    ObjectNode receipt = JSON.createObjectNode().put("transactionHash",hash).put("blockHash",blockHash)
        .put("blockNumber",blockNumber).put("status","0x1");
    receipt.putArray("logs").add(transfer(SELL,OWNER,ROUTER,1000000-fee,0))
        .add(transfer(SELL,OWNER,TREASURY,fee,1)).add(transfer(BUY,ROUTER,OWNER,5000000,2));
    when(rpc.call(1,"eth_getTransactionReceipt",List.of(hash))).thenReturn(receipt);
    when(rpc.call(1,"eth_getBlockByNumber",List.of("finalized",false))).thenReturn(JSON.createObjectNode().put("number","0x78"));
    when(rpc.call(1,"eth_getBlockByNumber",List.of(blockNumber,false))).thenReturn(JSON.createObjectNode()
        .put("hash",blockHash).put("timestamp","0x"+Long.toHexString(Instant.now().getEpochSecond())));
    return receipt;
  }
  private UUID history(String hash) {
    UUID id = UUID.randomUUID();
    jdbc.update("""
        INSERT INTO swap_history(id,wallet_address,chain_id,buy_chain_id,tx_hash,status,
          sell_token_address,sell_token_symbol,sell_token_decimals,buy_token_address,buy_token_symbol,buy_token_decimals,
          sell_amount_raw,buy_amount_raw,aggregator)
        VALUES (?,?,1,1,?,'confirmed',?,'USDC',6,?,'USDT',6,1000000,5000000,'0x')
        """,id,OWNER,hash,SELL,BUY);
    return id;
  }
  private Settlement received() {
    return new Settlement(State.RECEIVED,"fixture_only","synthetic_test",false,BigInteger.valueOf(2000),
        BigInteger.valueOf(1000000),true,JSON.createObjectNode().put("fixture",true));
  }
}
