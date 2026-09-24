import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { calculateOutcome } from "./audit";
import { detectEvents } from "./events";
import {
  pairKey,
  type LiquidityZone,
  type MarketRadarSnapshot,
  type PredictionAudit,
  type PriceObservation,
} from "./types";

export class RadarStore {
  private readonly pool: Pool;
  private last = new Map<string, MarketRadarSnapshot>();
  private material = new Map<
    string,
    { at: number; score: number; lifecycle: string; version: string }
  >();
  constructor(
    connectionString: string,
    readonly audience: "research" | "commercial",
    private readonly horizons = [3600000, 14400000, 86400000],
  ) {
    if (
      !connectionString.startsWith("postgresql://") &&
      !connectionString.startsWith("postgres://")
    )
      throw new Error("RADAR_DATABASE_URL must use PostgreSQL");
    if (
      horizons.length < 1 ||
      horizons.length > 6 ||
      new Set(horizons).size !== horizons.length ||
      horizons.some(
        (h) => !Number.isSafeInteger(h) || h < 60000 || h > 86400000,
      )
    )
      throw new Error("Invalid audit horizon");
    this.pool = new Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
      application_name: "swap-assistant-market-radar",
    });
    this.pool.on("error", () => {
      console.error("Market Radar database connection unavailable");
    });
  }
  async close() {
    await this.pool.end();
  }
  async check() {
    const role = await this.pool.query<{ unsafe: boolean }>(
      "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user",
    );
    if (role.rows[0]?.unsafe !== false)
      throw new Error("A least-privilege collector database role is required");
    const access = await this.pool.query<{
      unsafe: boolean;
    }>(`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
      AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS unsafe`);
    if (access.rows[0]?.unsafe !== false)
      throw new Error(
        "Collector database role has unrelated application privileges",
      );
    const identities = await this.pool.query<{ unsafe: boolean }>(
      "SELECT has_column_privilege(current_user,'market_radar.alert_rules','wallet_address','SELECT') AS unsafe",
    );
    if (identities.rows[0]?.unsafe !== false)
      throw new Error("Collector role must not read wallet alert identities");
    await this.pool.query("SELECT 1 FROM market_radar.latest LIMIT 1");
  }
  async catalog(markets: { key: string; venues: string[] }[]) {
    if (markets.length > 10000) throw new Error("Catalog bound exceeded");
    await this.pool.query(
      `INSERT INTO market_radar.markets(pair_key,audience,discovered_at,venues)
      SELECT x.key,$1,$2,x.venues FROM jsonb_to_recordset($3::jsonb) AS x(key text,venues jsonb)
      ON CONFLICT(pair_key,audience) DO UPDATE SET discovered_at=EXCLUDED.discovered_at,venues=EXCLUDED.venues`,
      [this.audience, Date.now(), JSON.stringify(markets)],
    );
  }
  async watchedPairs(limit: number): Promise<string[]> {
    if (this.audience !== "commercial") return [];
    if (!Number.isInteger(limit) || limit < 0 || limit > 50)
      throw new Error("Invalid watch bound");
    return (
      await this.pool.query<{ pair_key: string }>(
        `SELECT pair_key FROM (
      SELECT pair_key,0 priority FROM market_radar.alert_rules UNION ALL
      SELECT pair_key,1 priority FROM market_radar.watches WHERE expires_at>now()) watches
      GROUP BY pair_key ORDER BY min(priority),pair_key LIMIT $1`,
        [limit],
      )
    ).rows.map((row) => row.pair_key);
  }
  async observe(snapshot: MarketRadarSnapshot) {
    const key = pairKey(snapshot.instrument);
    const previous = this.last.get(key);
    const serialized = JSON.stringify(snapshot);
    if (Buffer.byteLength(serialized) > 131072)
      throw new Error("Oversized derived snapshot");
    const client = await this.pool.connect();
    const changes: [
      string,
      { at: number; score: number; lifecycle: string; version: string },
    ][] = [];
    try {
      await client.query("BEGIN");
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) acquired",
        [`market-radar:${this.audience}:${key}`],
      );
      if (!lock.rows[0].acquired) {
        await client.query("ROLLBACK");
        return;
      }
      await client.query(
        "INSERT INTO market_radar.latest(pair_key,audience,observed_at,snapshot) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(pair_key,audience) DO UPDATE SET observed_at=EXCLUDED.observed_at,snapshot=EXCLUDED.snapshot WHERE market_radar.latest.observed_at<EXCLUDED.observed_at",
        [key, this.audience, snapshot.observedAt, serialized],
      );
      const zones = [
        ...snapshot.supplyZones,
        ...snapshot.demandZones,
        ...snapshot.previousZones,
      ];
      if (
        snapshot.referencePrice !== null &&
        snapshot.freshness === "LIVE" &&
        snapshot.coverage !== "INSUFFICIENT_DATA"
      ) {
        await client.query(
          "INSERT INTO market_radar.observations(pair_key,audience,observed_at,price,lifecycles) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING",
          [
            key,
            this.audience,
            snapshot.observedAt,
            snapshot.referencePrice,
            JSON.stringify(
              Object.fromEntries(zones.map((z) => [z.id, z.lifecycle])),
            ),
          ],
        );
      }
      for (const zone of [...snapshot.supplyZones, ...snapshot.demandZones]) {
        let old = this.material.get(zone.id);
        if (!old) {
          const rows = await client.query<{
            at: string;
            score: number;
            lifecycle: string;
            version: string;
          }>(
            "SELECT observed_at AS at,structural_score AS score,zone->>'lifecycle' AS lifecycle,scoring_version AS version FROM market_radar.signals WHERE zone_id=$1 AND audience=$2 ORDER BY observed_at DESC LIMIT 1",
            [zone.id, this.audience],
          );
          if (rows.rows[0])
            old = { ...rows.rows[0], at: Number(rows.rows[0].at) };
        }
        const significant =
          !old ||
          old.version !== snapshot.scoringVersion ||
          Math.abs(old.score - zone.strength) >= 8 ||
          old.lifecycle !== zone.lifecycle;
        if (!significant) continue;
        if (
          zone.lifecycle === "FORMING" ||
          snapshot.coverage === "INSUFFICIENT_DATA"
        )
          continue;
        const id = createHash("sha256")
          .update(
            `${this.audience}/${zone.id}/${snapshot.observedAt}/${snapshot.scoringVersion}`,
          )
          .digest("hex");
        const inserted = await client.query(
          "INSERT INTO market_radar.signals(id,pair_key,audience,observed_at,zone_id,zone_type,structural_score,venue_count,scoring_version,snapshot,zone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) ON CONFLICT DO NOTHING RETURNING id",
          [
            id,
            key,
            this.audience,
            snapshot.observedAt,
            zone.id,
            zone.type,
            zone.strength,
            zone.venues.length,
            snapshot.scoringVersion,
            serialized,
            JSON.stringify(zone),
          ],
        );
        if (inserted.rowCount)
          for (const horizon of this.horizons)
            await client.query(
              "INSERT INTO market_radar.outcomes(signal_id,horizon_ms,due_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
              [id, horizon, snapshot.observedAt + horizon + 10000],
            );
        changes.push([
          zone.id,
          {
            at: snapshot.observedAt,
            score: zone.strength,
            lifecycle: zone.lifecycle,
            version: snapshot.scoringVersion,
          },
        ]);
      }
      for (const event of detectEvents(previous, snapshot))
        await client.query(
          "INSERT INTO market_radar.events(id,pair_key,audience,observed_at,event_type,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING",
          [
            event.id,
            key,
            this.audience,
            event.observedAt,
            event.type,
            JSON.stringify(event),
          ],
        );
      await client.query("COMMIT");
      this.last.set(key, snapshot);
      for (const [id, value] of changes) this.material.set(id, value);
      if (this.material.size > 4000)
        for (const [id] of [...this.material]
          .sort((a, b) => a[1].at - b[1].at)
          .slice(0, this.material.size - 4000))
          this.material.delete(id);
      if (this.last.size > 100)
        this.last.delete(this.last.keys().next().value!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async evaluateDue(now = Date.now()) {
    const lease = randomUUID();
    const claimed = await this.pool.query<{
      signal_id: string;
      horizon_ms: number;
      attempts: number;
    }>(
      `WITH due AS (
      SELECT o.signal_id,o.horizon_ms FROM market_radar.outcomes o JOIN market_radar.signals s ON s.id=o.signal_id
      WHERE o.status='PENDING' AND o.due_at<=$1 AND s.audience=$2 AND (o.locked_until IS NULL OR o.locked_until<$1) AND o.attempts<5
      ORDER BY o.due_at LIMIT 5 FOR UPDATE OF o SKIP LOCKED)
      UPDATE market_radar.outcomes o SET locked_until=$1+180000,lease_id=$3,attempts=o.attempts+1 FROM due
      WHERE o.signal_id=due.signal_id AND o.horizon_ms=due.horizon_ms RETURNING o.signal_id,o.horizon_ms,o.attempts`,
      [now, this.audience, lease],
    );
    for (const row of claimed.rows) {
      try {
        const signal = (
          await this.pool.query<{
            snapshot: MarketRadarSnapshot;
            zone: LiquidityZone;
            pair_key: string;
            scoring_version: string;
          }>(
            "SELECT snapshot,zone,pair_key,scoring_version FROM market_radar.signals WHERE id=$1 AND audience=$2",
            [row.signal_id, this.audience],
          )
        ).rows[0];
        if (!signal) throw new Error("Audit source unavailable");
        const audit: PredictionAudit = {
          id: row.signal_id,
          snapshot: signal.snapshot,
          zone: signal.zone,
          horizonMs: row.horizon_ms,
          scoringVersion: signal.scoring_version,
        };
        const prices = await this.pool.query<{
          observed_at: string;
          price: string;
          lifecycles: Record<string, PriceObservation["zoneLifecycle"]>;
        }>(
          "SELECT observed_at,price,lifecycles FROM market_radar.observations WHERE pair_key=$1 AND audience=$2 AND observed_at BETWEEN $3 AND $4 ORDER BY observed_at LIMIT 20000",
          [
            signal.pair_key,
            this.audience,
            audit.snapshot.observedAt,
            audit.snapshot.observedAt + 2 * audit.horizonMs,
          ],
        );
        const outcome = calculateOutcome(
          audit,
          prices.rows.map((p) => ({
            at: Number(p.observed_at),
            price: Number(p.price),
            zoneLifecycle: p.lifecycles[audit.zone.id],
          })),
          now,
        );
        await this.pool.query(
          "UPDATE market_radar.outcomes SET status=$1::varchar,result=$2::jsonb,locked_until=NULL,lease_id=NULL,due_at=$6,attempts=CASE WHEN $1::varchar='PENDING' THEN greatest(0,attempts-1) ELSE attempts END WHERE signal_id=$3 AND horizon_ms=$4 AND lease_id=$5",
          [
            outcome.status,
            JSON.stringify(outcome),
            row.signal_id,
            row.horizon_ms,
            lease,
            outcome.evaluationEndAt,
          ],
        );
      } catch (error) {
        const rawCode =
          error instanceof Error && "code" in error ? String(error.code) : "";
        console.warn(
          JSON.stringify({
            service: "market-radar",
            operation: "audit",
            code: /^[A-Z0-9]{5}$/.test(rawCode) ? rawCode : "UNAVAILABLE",
          }),
        );
        await this.pool.query(
          "UPDATE market_radar.outcomes SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,due_at=$1,locked_until=NULL,lease_id=NULL WHERE signal_id=$2 AND horizon_ms=$3 AND lease_id=$4",
          [
            now + Math.min(3600000, 30000 * 2 ** row.attempts),
            row.signal_id,
            row.horizon_ms,
            lease,
          ],
        );
      }
    }
    await this.pool.query(
      "UPDATE market_radar.outcomes o SET status='FAILED',locked_until=NULL,lease_id=NULL FROM market_radar.signals s WHERE s.id=o.signal_id AND s.audience=$2 AND o.status='PENDING' AND o.attempts>=5 AND o.locked_until<$1",
      [now, this.audience],
    );
  }
  async report(
    minScore: number,
    minVenues: number,
    horizonMs: number,
    from: number,
    until: number,
  ) {
    if (
      !Number.isInteger(minScore) ||
      minScore < 0 ||
      minScore > 100 ||
      !Number.isInteger(minVenues) ||
      minVenues < 1 ||
      minVenues > 3 ||
      !this.horizons.includes(horizonMs) ||
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(until) ||
      from <= 0 ||
      until < from ||
      until - from > 31 * 86400000
    )
      throw new Error("Invalid audit filters");
    return (
      await this.pool.query(
        `SELECT s.scoring_version,s.zone_type,o.status,count(*)::int observations,
      count(*) FILTER (WHERE (o.result->>'entered')::boolean)::int entered,
      count(*) FILTER (WHERE (o.result->>'maxReversalAfterContactBps')::numeric>=200)::int reversed_two_percent,
      count(*) FILTER (WHERE (o.result->>'weakenedBeforeBreak')::boolean)::int warned_before_break
      FROM market_radar.signals s JOIN market_radar.outcomes o ON o.signal_id=s.id
      WHERE s.audience=$1 AND s.structural_score>=$2 AND s.venue_count>=$3 AND o.horizon_ms=$4 AND s.observed_at BETWEEN $5 AND $6
      GROUP BY s.scoring_version,s.zone_type,o.status ORDER BY s.scoring_version,s.zone_type,o.status`,
        [this.audience, minScore, minVenues, horizonMs, from, until],
      )
    ).rows;
  }
  async cleanup(now = Date.now(), days = 7) {
    if (!Number.isInteger(days) || days < 2 || days > 90)
      throw new Error("Invalid retention");
    const cutoff = now - days * 86400000;
    for (const table of [
      "observations",
      "signals",
      "events",
      "latest",
    ] as const) {
      await this.pool.query(
        `DELETE FROM market_radar.${table} WHERE ctid IN (SELECT ctid FROM market_radar.${table} WHERE observed_at<$1 AND audience=$2 LIMIT 2000)`,
        [cutoff, this.audience],
      );
    }
    await this.pool.query(
      "DELETE FROM market_radar.markets WHERE discovered_at<$1 AND audience=$2",
      [cutoff, this.audience],
    );
    if (this.audience === "commercial")
      await this.pool.query(
        "DELETE FROM market_radar.watches WHERE expires_at<now()-interval '1 hour'",
      );
  }
}
