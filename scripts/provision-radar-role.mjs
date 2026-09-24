import pg from "pg";

// Run deliberately with a database administrator connection after Flyway V32.
// Neither the collector nor the frontend ever receives this administrator credential.
const admin = process.env.RADAR_ADMIN_DATABASE_URL;
const password = process.env.RADAR_DATABASE_PASSWORD;
if (
  (!admin &&
    !(
      process.env.PGHOST &&
      process.env.PGDATABASE &&
      process.env.PGUSER &&
      process.env.PGPASSWORD
    )) ||
  !password ||
  password.length < 32 ||
  password.length > 256
) {
  throw new Error(
    "Set the administrator database connection and a strong RADAR_DATABASE_PASSWORD (32-256 characters).",
  );
}
const client = new pg.Client({
  connectionString: admin,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  const existing = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname='swap_assistant_radar_collector'",
  );
  if (existing.rowCount)
    throw new Error(
      "Collector role already exists. This provisioning command never rotates an existing credential.",
    );
  await client.query("SELECT 1 FROM market_radar.latest LIMIT 1");
  const statement = await client.query(
    "SELECT format('CREATE ROLE swap_assistant_radar_collector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD %L',$1::text) AS sql",
    [password],
  );
  await client.query(statement.rows[0].sql);
  const connectionGrant = await client.query(
    "SELECT format('GRANT CONNECT ON DATABASE %I TO swap_assistant_radar_collector',current_database()) AS sql",
  );
  await client.query(connectionGrant.rows[0].sql);
  await client.query(
    "GRANT USAGE ON SCHEMA market_radar TO swap_assistant_radar_collector",
  );
  await client.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON market_radar.latest,market_radar.outcomes,market_radar.markets TO swap_assistant_radar_collector",
  );
  await client.query(
    "GRANT SELECT,INSERT,DELETE ON market_radar.observations,market_radar.signals,market_radar.events TO swap_assistant_radar_collector",
  );
  await client.query(
    "GRANT SELECT,DELETE ON market_radar.watches TO swap_assistant_radar_collector",
  );
  await client.query(
    "GRANT SELECT(pair_key) ON market_radar.alert_rules TO swap_assistant_radar_collector",
  );
  await client.query("COMMIT");
  console.log(
    "Created the bounded collector role. No access to wallet, revenue, contact or notification destination tables was granted.",
  );
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    "Radar role provisioning did not complete. Verify migration, administrator permission and whether the role already exists. Credentials were not logged.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
