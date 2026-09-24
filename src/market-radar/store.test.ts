import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { RadarStore } from "./store";
import { syntheticRadar } from "../lib/marketRadarDemo";

const connection = process.env.RADAR_TEST_DATABASE_URL;
const testUrl = connection ? new URL(connection) : null;
const allowed = Boolean(
  testUrl &&
  ["127.0.0.1", "localhost"].includes(testUrl.hostname) &&
  testUrl.pathname === "/wallet_radar_test",
);
if (connection && !allowed)
  throw new Error(
    "Radar database tests require an isolated local wallet_radar_test database",
  );
describe.skipIf(!allowed)("PostgreSQL Radar persistence", () => {
  let pool: Pool;
  let store: RadarStore;
  beforeAll(async () => {
    pool = new Pool({ connectionString: connection, max: 2 });
    await pool.query("DROP SCHEMA IF EXISTS market_radar CASCADE");
    const migration = readFileSync(
      "backend/src/main/resources/db/migration/V32__market_radar.sql",
      "utf8",
    ).replaceAll("${marketRadarSchema}", "market_radar");
    await pool.query(migration);
    store = new RadarStore(connection!, "research", [60000]);
  }, 30000);
  afterAll(async () => {
    await store?.close();
    await pool?.query("DROP SCHEMA IF EXISTS market_radar CASCADE");
    await pool?.end();
  });
  beforeEach(async () => {
    await store.close();
    store = new RadarStore(connection!, "research", [60000]);
    await pool.query(
      "TRUNCATE market_radar.latest,market_radar.observations,market_radar.outcomes,market_radar.signals,market_radar.events CASCADE",
    );
  });
  function snapshot(at: number) {
    const value = syntheticRadar(0);
    value.observedAt = at;
    value.calculatedAt = at;
    value.scoringVersion = "test-fixture-v1";
    value.venues = value.venues.slice(0, 3);
    return value;
  }
  it("stores immutable signals idempotently and evaluates finalized sampled outcomes", async () => {
    const at = Date.now() - 120000;
    const value = snapshot(at);
    await store.observe(value);
    await store.observe(value);
    expect(
      (await pool.query("SELECT count(*)::int count FROM market_radar.signals"))
        .rows[0].count,
    ).toBe(2);
    for (let offset = 10000; offset <= 90000; offset += 10000) {
      const next = snapshot(at + offset);
      next.referencePrice = offset === 30000 ? 129 : 120;
      await store.observe(next);
    }
    await store.evaluateDue(Date.now());
    const rows = (
      await pool.query("SELECT status,result FROM market_radar.outcomes")
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "COMPLETE")).toBe(true);
    expect(
      rows.some(
        (r) => r.result.entered && r.result.maxReversalAfterContactBps > 200,
      ),
    ).toBe(true);
    const grouped = await store.report(0, 1, 60000, at - 1, Date.now());
    expect(grouped).toHaveLength(2);
  });
  it("preserves missing coverage instead of manufacturing a result", async () => {
    await store.observe(snapshot(Date.now() - 120000));
    await store.evaluateDue(Date.now());
    expect(
      (await pool.query("SELECT status FROM market_radar.outcomes")).rows.every(
        (r) => r.status === "INCOMPLETE_DATA",
      ),
    ).toBe(true);
  });
  it("reschedules a late contact without consuming a retry or shortening its follow-up", async () => {
    const at = Date.now() - 120000;
    for (let offset = 0; offset <= 60000; offset += 10000) {
      const next = snapshot(at + offset);
      next.referencePrice = offset === 50000 ? 129 : 120;
      await store.observe(next);
    }
    await store.evaluateDue(at + 70000);
    const pending = (
      await pool.query(
        "SELECT o.status,o.attempts,o.due_at FROM market_radar.outcomes o JOIN market_radar.signals s ON s.id=o.signal_id WHERE s.zone_type='SUPPLY' LIMIT 1",
      )
    ).rows[0];
    expect(pending.status).toBe("PENDING");
    expect(pending.attempts).toBe(0);
    expect(Number(pending.due_at)).toBe(at + 110000);
    for (let offset = 70000; offset <= 110000; offset += 10000) {
      const next = snapshot(at + offset);
      next.referencePrice = 120;
      await store.observe(next);
    }
    await store.evaluateDue(at + 110000);
    expect(
      (await pool.query("SELECT status FROM market_radar.outcomes")).rows.every(
        (row) => row.status === "COMPLETE",
      ),
    ).toBe(true);
  });
  it("honors leases, bounds retries, and does not exhaust another audience's work", async () => {
    await store.observe(snapshot(Date.now() - 120000));
    await pool.query(
      "UPDATE market_radar.outcomes SET locked_until=$1,lease_id=gen_random_uuid()",
      [Date.now() + 300000],
    );
    await store.evaluateDue(Date.now());
    expect(
      (await pool.query("SELECT attempts FROM market_radar.outcomes LIMIT 1"))
        .rows[0].attempts,
    ).toBe(0);
    await pool.query(
      "UPDATE market_radar.outcomes SET locked_until=0,attempts=5",
    );
    await store.evaluateDue(Date.now());
    expect(
      (await pool.query("SELECT status FROM market_radar.outcomes")).rows.every(
        (r) => r.status === "FAILED",
      ),
    ).toBe(true);
  });
  it("retains restart-safe signal suppression and rejects invalid report ranges", async () => {
    const at = Date.now();
    await store.observe(snapshot(at));
    await store.close();
    store = new RadarStore(connection!, "research", [60000]);
    await store.observe(snapshot(at + 10000));
    expect(
      (await pool.query("SELECT count(*)::int count FROM market_radar.signals"))
        .rows[0].count,
    ).toBe(2);
    await expect(store.report(101, 1, 60000, at, at + 60000)).rejects.toThrow(
      "filters",
    );
  });
  it("provisions a collector that cannot access application tables or wallet identities", async () => {
    await expect(store.check()).rejects.toThrow("least-privilege");
    const password = "isolated_collector_test_password_12345";
    execFileSync(process.execPath, ["scripts/provision-radar-role.mjs"], {
      env: {
        ...process.env,
        RADAR_ADMIN_DATABASE_URL: connection,
        RADAR_DATABASE_PASSWORD: password,
      },
      stdio: "pipe",
    });
    const url = new URL(connection!);
    url.username = "swap_assistant_radar_collector";
    url.password = password;
    const restricted = new RadarStore(url.href, "research", [60000]);
    const restrictedPool = new Pool({ connectionString: url.href, max: 1 });
    try {
      await pool.query(
        "CREATE TABLE public.radar_isolation_fixture(secret text)",
      );
      await restricted.check();
      await restricted.observe(snapshot(Date.now() - 120000));
      await restricted.evaluateDue(Date.now());
      await expect(
        restrictedPool.query("SELECT * FROM public.radar_isolation_fixture"),
      ).rejects.toThrow("permission denied");
      await expect(
        restrictedPool.query(
          "SELECT wallet_address FROM market_radar.alert_rules",
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        restrictedPool.query("SELECT pair_key FROM market_radar.alert_rules"),
      ).resolves.toBeDefined();
      await pool.query(
        "GRANT SELECT ON public.radar_isolation_fixture TO swap_assistant_radar_collector",
      );
      await expect(restricted.check()).rejects.toThrow(
        "unrelated application privileges",
      );
    } finally {
      await restricted.close();
      await restrictedPool.end();
      await pool.query("DROP TABLE IF EXISTS public.radar_isolation_fixture");
      await pool.query("DROP OWNED BY swap_assistant_radar_collector");
      await pool.query("DROP ROLE swap_assistant_radar_collector");
    }
  });
});
