package com.wallet.swap.revenue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.swap.common.ApiException;
import com.wallet.swap.revenue.RevenueModels.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class RevenueRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final RevenueIntegrity integrity;

  public RevenueRepository(JdbcTemplate jdbc, ObjectMapper mapper, RevenueIntegrity integrity) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.integrity = integrity;
  }

  @Transactional
  public void ingest(Envelope envelope, Batch batch) {
    int inserted = jdbc.update("""
        INSERT INTO revenue_quote_batches(id, issued_at, payload, signature) VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
        """, batch.id(), time(batch.issuedAt()), envelope.payload(), envelope.signature());
    if (inserted == 0) {
      String signature = jdbc.queryForObject("SELECT signature FROM revenue_quote_batches WHERE id=?", String.class, batch.id());
      if (!envelope.signature().equals(signature)) throw conflict();
      return;
    }
    for (Snapshot q : batch.quotes()) {
      jdbc.update("""
          INSERT INTO revenue_quotes(id,batch_id,provider,source_chain,destination_chain,owner_address,snapshot,quoted_at)
          VALUES (?,?,?,?,?,?,?::jsonb,?)
          """, q.id(), batch.id(), q.provider(), q.sourceChain(), q.destinationChain(),
          q.owner().toLowerCase(java.util.Locale.ROOT), json(q), time(batch.issuedAt()));
    }
    for (Outcome outcome : batch.outcomes()) {
      jdbc.update("""
          INSERT INTO revenue_provider_attempts(batch_id,provider,outcome,occurred_at) VALUES (?,?,?,?)
          """, batch.id(), outcome.provider(), outcome.outcome(), time(batch.issuedAt()));
    }
  }

  public SignedQuote loadQuote(UUID id) {
    List<Envelope> envelopes = jdbc.query("""
        SELECT b.payload,b.signature FROM revenue_quotes q JOIN revenue_quote_batches b ON b.id=q.batch_id WHERE q.id=?
        """, (rs, row) -> new Envelope(rs.getString(1), rs.getString(2)), id);
    if (envelopes.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Quote evidence was not found. Refresh the quote.");
    Batch batch = integrity.verify(envelopes.get(0), false);
    Snapshot snapshot = batch.quotes().stream().filter(q -> q.id().equals(id)).findFirst().orElseThrow(this::conflict);
    return new SignedQuote(snapshot, Instant.ofEpochMilli(batch.issuedAt()));
  }

  public void review(UUID quoteId, String wallet) {
    jdbc.update("""
        UPDATE revenue_quotes SET reviewed_at=COALESCE(reviewed_at,now()), reviewed_by=?
        WHERE id=? AND owner_address=?
        """, wallet, quoteId, wallet);
  }

  public void bind(UUID historyId, UUID quoteId, String wallet, long chain, String txHash) {
    String state = quoteId == null ? "NOT_VERIFIED" : "EXPECTED";
    String reason = quoteId == null ? "missing_server_quote" : "awaiting_independent_evidence";
    int inserted = jdbc.update("""
        INSERT INTO revenue_records(id,history_id,quote_id,wallet_address,source_chain,transaction_hash,state,reason,next_check_at)
        VALUES (?,?,?,?,?,?,?,?,CASE WHEN ?::uuid IS NULL THEN NULL ELSE now() END)
        ON CONFLICT DO NOTHING
        """, UUID.randomUUID(), historyId, quoteId, wallet, chain, txHash, state, reason, quoteId);
    if (inserted == 0) {
      List<Boolean> matches = jdbc.query("""
          SELECT history_id=? AND wallet_address=? AND quote_id IS NOT DISTINCT FROM ?::uuid
          FROM revenue_records WHERE source_chain=? AND transaction_hash=?
          """, (rs, row) -> rs.getBoolean(1), historyId, wallet, quoteId, chain, txHash);
      if (matches.size() != 1 || !matches.get(0)) throw conflict();
    }
  }

  @Transactional
  public Claim claim() {
    UUID lease = UUID.randomUUID();
    List<Claim> claims = jdbc.query("""
        WITH due AS (
          SELECT id FROM revenue_records
          WHERE next_check_at<=now() AND attempts<12 AND (lease_until IS NULL OR lease_until<now())
          ORDER BY next_check_at LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        UPDATE revenue_records r SET lease_token=?,lease_until=now()+interval '120 seconds',attempts=attempts+1
        FROM due WHERE r.id=due.id
        RETURNING r.id,r.quote_id,r.lease_token,r.wallet_address,r.transaction_hash,r.attempts,r.created_at
        """, (rs, row) -> new Claim(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
          rs.getObject(3, UUID.class), rs.getString(4), rs.getString(5), rs.getInt(6), rs.getTimestamp(7).toInstant()), lease);
    return claims.isEmpty() ? null : claims.get(0);
  }

  @Transactional
  public void finish(Claim claim, Settlement result) {
    boolean retry = result.retry() && claim.attempts() < 12 && claim.createdAt().isAfter(Instant.now().minusSeconds(86400));
    State state = result.retry() && !retry ? State.NOT_VERIFIED : result.state();
    String reason = result.retry() && !retry ? "verification_retry_budget_exhausted" : result.reason();
    Instant next = retry ? Instant.now().plusSeconds(Math.min(3600, 30L << Math.min(claim.attempts(), 7))) : null;
    int updated = jdbc.update("""
        UPDATE revenue_records SET state=?,reason=?,verified_fee=?,confirmed_volume=?,swap_verified_at=?,
          next_check_at=?,lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE id=? AND lease_token=? AND lease_until>now()
        """, state.name(), reason, result.fee() == null ? null : new java.math.BigDecimal(result.fee()),
        result.volume() == null ? null : new java.math.BigDecimal(result.volume()),
        result.swapConfirmed() ? Timestamp.from(Instant.now()) : null, next == null ? null : Timestamp.from(next),
        claim.id(), claim.leaseToken());
    if (updated == 0) return;
    String evidence = json(result.evidence());
    jdbc.update("""
        INSERT INTO revenue_settlement_evidence(revenue_id,source,state,evidence,evidence_hash)
        VALUES (?,?,?,?::jsonb,?) ON CONFLICT DO NOTHING
        """, claim.id(), result.source(), state.name(), evidence, RevenueIntegrity.hash(result.source() + state + evidence));
  }

  @Transactional(readOnly = true, timeout = 10)
  public Map<String, Object> report(Instant from, Instant until, String bucket) {
    Timestamp start = Timestamp.from(from);
    Timestamp end = Timestamp.from(until);
    List<Map<String, Object>> fees = jdbc.queryForList("""
        SELECT date_trunc(?,r.created_at,'UTC') AS period,q.provider,q.source_chain AS chain,
          q.snapshot->'feeToken'->>'address' AS token,q.snapshot->'feeToken'->>'symbol' AS symbol,
          (q.snapshot->'feeToken'->>'decimals')::int AS decimals,
          count(*) AS submitted,
          sum((q.snapshot->>'expectedFee')::numeric)::text AS expected,
          sum(r.verified_fee) FILTER (WHERE r.state='ACCRUED')::text AS accrued,
          sum(r.verified_fee) FILTER (WHERE r.state='RECEIVED')::text AS received,
          count(*) FILTER (WHERE r.state='NOT_VERIFIED') AS not_verified,
          count(*) FILTER (WHERE r.state='FAILED') AS failed
        FROM revenue_records r JOIN revenue_quotes q ON q.id=r.quote_id
        WHERE r.created_at>=? AND r.created_at<?
        GROUP BY 1,2,3,4,5,6 ORDER BY 1 DESC,2,3,4 LIMIT 1000
        """, bucket, start, end);
    List<Map<String, Object>> volume = jdbc.queryForList("""
        SELECT q.provider,q.source_chain AS chain,q.snapshot->'sellToken'->>'address' AS token,
          q.snapshot->'sellToken'->>'symbol' AS symbol,(q.snapshot->'sellToken'->>'decimals')::int AS decimals,
          count(*) AS confirmed_swaps,count(r.confirmed_volume) AS measured_swaps,sum(r.confirmed_volume)::text AS amount
        FROM revenue_records r JOIN revenue_quotes q ON q.id=r.quote_id
        WHERE r.created_at>=? AND r.created_at<? AND r.swap_verified_at IS NOT NULL
        GROUP BY 1,2,3,4,5 ORDER BY 1,2,3 LIMIT 1000
        """, start, end);
    Map<String, Object> funnel = jdbc.queryForMap("""
        SELECT count(*) AS quoted_routes,count(DISTINCT q.batch_id) AS quote_requests,
          count(q.reviewed_at) AS reviewed_routes,count(r.id) AS submitted_routes,
          count(r.swap_verified_at) AS independently_confirmed_routes
        FROM revenue_quotes q LEFT JOIN revenue_records r ON r.quote_id=q.id
        WHERE q.quoted_at>=? AND q.quoted_at<?
        """, start, end);
    List<Map<String, Object>> failures = jdbc.queryForList("""
        SELECT provider,outcome,count(*) AS count FROM revenue_provider_attempts
        WHERE occurred_at>=? AND occurred_at<? GROUP BY provider,outcome ORDER BY provider,outcome
        """, start, end);
    Long untracked = jdbc.queryForObject("""
        SELECT count(*) FROM revenue_records WHERE quote_id IS NULL AND created_at>=? AND created_at<?
        """, Long.class, start, end);
    return Map.of("from", from, "until", until, "feeGroups", fees, "volumeGroups", volume,
        "funnel", funnel, "providerOutcomes", failures, "untrackedSubmissions", java.util.Objects.requireNonNullElse(untracked, Long.valueOf(0)),
        "groupLimit", 1000);
  }

  @Transactional(readOnly = true, timeout = 10)
  public List<Map<String, Object>> records(Instant from, Instant until, int offset) {
    return jdbc.queryForList("""
        SELECT r.id,r.quote_id,r.state,r.reason,r.attempts,r.created_at,r.updated_at,r.swap_verified_at,
          q.provider,r.source_chain,q.destination_chain,r.transaction_hash,
          q.snapshot->>'expectedFee' AS expected,r.verified_fee::text AS verified_fee,
          (q.snapshot->'feeToken')::text AS fee_token
        FROM revenue_records r LEFT JOIN revenue_quotes q ON q.id=r.quote_id
        WHERE r.created_at>=? AND r.created_at<? ORDER BY r.created_at DESC,r.id DESC LIMIT 100 OFFSET ?
        """, Timestamp.from(from), Timestamp.from(until), offset);
  }

  @Transactional(readOnly = true, timeout = 10)
  public List<Map<String, Object>> evidence(UUID id) {
    return jdbc.queryForList("""
        SELECT source,state,evidence::text AS evidence,evidence_hash,checked_at FROM revenue_settlement_evidence
        WHERE revenue_id=? ORDER BY id DESC LIMIT 20
        """, id);
  }

  @Transactional
  public void expireUnclaimed() {
    jdbc.update("""
        WITH stopped AS (
          UPDATE revenue_records SET state='NOT_VERIFIED',reason='verification_retry_budget_exhausted',
            next_check_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
          WHERE id IN (
            SELECT id FROM revenue_records WHERE next_check_at IS NOT NULL
              AND (lease_until IS NULL OR lease_until<now())
              AND (attempts>=12 OR created_at<now()-interval '24 hours')
            ORDER BY next_check_at LIMIT 500 FOR UPDATE SKIP LOCKED
          ) RETURNING id
        )
        INSERT INTO revenue_settlement_evidence(revenue_id,source,state,evidence,evidence_hash)
        SELECT id,'reconciler','NOT_VERIFIED','{"reason":"verification_retry_budget_exhausted"}'::jsonb,?
        FROM stopped ON CONFLICT DO NOTHING
        """, RevenueIntegrity.hash("verification_retry_budget_exhausted"));
    // Bounded cleanup; submitted financial evidence is retained for accounting.
    jdbc.update("""
        DELETE FROM revenue_quotes WHERE id IN (
          SELECT q.id FROM revenue_quotes q WHERE q.quoted_at<now()-interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM revenue_records r WHERE r.quote_id=q.id) LIMIT 500
        )
        """);
    jdbc.update("""
        DELETE FROM revenue_quote_batches WHERE id IN (
          SELECT b.id FROM revenue_quote_batches b WHERE b.created_at<now()-interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM revenue_quotes q WHERE q.batch_id=b.id) LIMIT 500
        )
        """);
  }

  private String json(Object value) {
    try { return mapper.writeValueAsString(value); }
    catch (java.io.IOException exception) { throw new IllegalStateException("Cannot serialize evidence", exception); }
  }
  private Timestamp time(long millis) { return Timestamp.from(Instant.ofEpochMilli(millis)); }
  private ApiException conflict() { return new ApiException(HttpStatus.CONFLICT, "Transaction evidence conflicts with an existing record."); }
  public record SignedQuote(Snapshot snapshot, Instant issuedAt) {}
}
