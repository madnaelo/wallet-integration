"use client";

import { useEffect, useState } from "react";
import type { LiquidityZone, MarketRadarSnapshot } from "@/market-radar/types";
import styles from "./radar.module.css";

export function priceLabel(value: number, quote: string): string {
  const amount = new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 7,
  }).format(value);
  return `${amount} ${quote}`;
}

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
const lifecycle: Record<LiquidityZone["lifecycle"], string> = {
  FORMING: "Forming",
  ACTIVE: "Holding",
  STRENGTHENING: "Strengthening",
  WEAKENING: "Weakening",
  UNDER_TEST: "Price approaching",
  ABSORBING: "Absorbing incoming trades",
  BROKEN: "Price moved through",
  STALE: "No longer current",
};
const absorption: Record<LiquidityZone["absorption"], string> = {
  NOT_ENOUGH_TRADES: "Not enough recent trades",
  LOW: "Low",
  REPLENISHING: "Liquidity replenishing",
  BEING_CONSUMED: "Liquidity being consumed",
};

function Zone({
  zone,
  quote,
  healthyVenues,
  onAlert,
}: {
  zone: LiquidityZone;
  quote: string;
  healthyVenues: number;
  onAlert?: (zone: LiquidityZone) => void;
}) {
  return (
    <article
      className={`${styles.zone} ${zone.type === "SUPPLY" ? styles.supply : styles.demand}`}
      aria-label={`${zone.type === "SUPPLY" ? "Supply" : "Demand"} zone`}
    >
      <div className={styles.zoneHeading}>
        <h3>Next {zone.type === "SUPPLY" ? "Supply" : "Demand"} Zone</h3>
        <span>{lifecycle[zone.lifecycle]}</span>
      </div>
      <p className={styles.range}>
        {priceLabel(zone.lower, quote)} <span>to</span>{" "}
        {priceLabel(zone.upper, quote)}
      </p>
      <div className={styles.score}>
        <span>Structural strength</span>
        <strong>
          {zone.strength}
          <small> / 100</small>
        </strong>
      </div>
      <meter
        className={styles.meter}
        min={0}
        max={100}
        value={zone.strength}
        aria-label={`${zone.type.toLowerCase()} structural strength`}
      />
      <p className={styles.scoreNote}>
        Strength of the observed structure, not a probability.
      </p>
      <dl className={styles.metrics}>
        <div>
          <dt>Wall persistence</dt>
          <dd>{duration(zone.persistenceMs)}</dd>
        </div>
        <div>
          <dt>Venues confirming</dt>
          <dd>
            {zone.venues.length} / {healthyVenues}
          </dd>
        </div>
        <div>
          <dt>{zone.type === "SUPPLY" ? "Selling" : "Buying"} liquidity</dt>
          <dd>{zone.notionalTrend.toLowerCase()}</dd>
        </div>
        <div>
          <dt>Absorption</dt>
          <dd>{absorption[zone.absorption]}</dd>
        </div>
        <div>
          <dt>Wall reliability</dt>
          <dd>{zone.wallReliability} / 100</dd>
        </div>
      </dl>
      <ul className={styles.evidence}>
        {zone.evidence
          .filter((e) => e.value >= 0.5)
          .slice(0, 3)
          .map((e) => (
            <li key={e.key}>{e.label}</li>
          ))}
      </ul>
      <details className={styles.explanation}>
        <summary>Why this zone?</summary>
        <p>
          Visible orders can be cancelled. We combine concentration,
          persistence, executed trades and healthy venue agreement.
        </p>
        <dl>
          {zone.evidence.map((e) => (
            <div key={e.key}>
              <dt>{e.label}</dt>
              <dd>{e.contribution.toFixed(1)} points</dd>
            </div>
          ))}
        </dl>
        <p>
          The weighted total is multiplied by wall maturity (
          {zone.scoreFactors.maturity.toFixed(2)}) and reliability (
          {zone.scoreFactors.reliability.toFixed(2)}), then rounded. New or
          inconsistent walls score lower.
        </p>
        <p>
          Contributing venues:{" "}
          {zone.venues
            .map(
              (v) =>
                `${v.venue} (${Math.round(v.weight * 100)}% liquidity weight)`,
            )
            .join(", ")}
          .
        </p>
      </details>
      {onAlert && (
        <button
          type="button"
          className={styles.alertButton}
          onClick={() => onAlert(zone)}
        >
          Create alert
        </button>
      )}
    </article>
  );
}

function LiquidityMap({ snapshot }: { snapshot: MarketRadarSnapshot }) {
  const price = snapshot.referencePrice;
  const zones = [
    ...snapshot.supplyZones.slice(0, 1),
    ...snapshot.demandZones.slice(0, 1),
  ];
  if (price === null || !zones.length) return null;
  const high = Math.max(price, ...zones.map((z) => z.upper)) * 1.015;
  const low = Math.min(price, ...zones.map((z) => z.lower)) * 0.985;
  const y = (value: number) => 20 + ((high - value) / (high - low)) * 200;
  return (
    <figure className={styles.map}>
      <figcaption>
        Observed liquidity map <span>Price levels, not a forecast</span>
      </figcaption>
      <svg
        viewBox="0 0 500 248"
        role="img"
        aria-label="Current price between observed supply and demand zones"
        preserveAspectRatio="xMidYMid meet"
      >
        {zones.map((zone) => (
          <g key={zone.id}>
            <rect
              x="12"
              y={y(zone.upper)}
              width={(440 * zone.strength) / 100 + 40}
              height={Math.max(5, y(zone.lower) - y(zone.upper))}
              fill={zone.type === "SUPPLY" ? "#dc626c" : "#299d87"}
              opacity="0.65"
            />
          </g>
        ))}
        <line
          x1="12"
          x2="480"
          y1={y(price)}
          y2={y(price)}
          stroke="currentColor"
          strokeDasharray="5 5"
          opacity="0.65"
        />
        <circle cx="24" cy={y(price)} r="4" fill="currentColor" />
      </svg>
      <ul className={styles.mapLegend}>
        <li>
          <span className={styles.currentKey} />
          Current {priceLabel(price, snapshot.instrument.quoteAsset)}
        </li>
        {zones.map((zone) => (
          <li key={zone.id}>
            <span
              className={
                zone.type === "SUPPLY" ? styles.supplyKey : styles.demandKey
              }
            />
            {zone.type === "SUPPLY" ? "Supply" : "Demand"}{" "}
            {priceLabel(zone.lower, snapshot.instrument.quoteAsset)}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function RadarView({
  snapshot,
  synthetic = false,
  onAlert,
}: {
  snapshot: MarketRadarSnapshot;
  synthetic?: boolean;
  onAlert?: (zone: LiquidityZone) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (synthetic) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [synthetic]);
  const current =
    snapshot.freshness === "LIVE" &&
    (synthetic || now - snapshot.observedAt <= 15000);
  const enough = current && snapshot.coverage !== "INSUFFICIENT_DATA";
  const healthy = snapshot.venues.filter((v) => v.healthy).length;
  return (
    <div className={`${styles.radar} ${synthetic ? styles.light : ""}`}>
      {synthetic && (
        <p className={styles.synthetic}>
          <strong>Illustrative, synthetic data.</strong> No exchange connection,
          real wallet, order or fee. Nothing is saved after leaving this demo.
        </p>
      )}
      <div className={styles.overview}>
        <div>
          <span className={styles.eyebrow}>
            {snapshot.instrument.baseAsset} / {snapshot.instrument.quoteAsset}
          </span>
          <h2>
            {current && snapshot.referencePrice !== null
              ? priceLabel(
                  snapshot.referencePrice,
                  snapshot.instrument.quoteAsset,
                )
              : "Price unavailable"}
          </h2>
        </div>
        <div className={styles.coverage}>
          <strong>
            {current
              ? snapshot.coverage.replaceAll("_", " ")
              : "LIVE DATA UNAVAILABLE"}
          </strong>
          <span>{healthy} healthy venues</span>
          <span>
            {synthetic
              ? "Illustrative observation"
              : snapshot.observedAt
                ? `Observed ${new Date(snapshot.observedAt).toLocaleTimeString()}`
                : "Waiting for observations"}
          </span>
        </div>
      </div>
      {!enough && (
        <div className={styles.empty} role="status">
          {current
            ? "Insufficient market depth/data for a reliable structural zone."
            : "Live market intelligence temporarily unavailable"}
          <p>{snapshot.reason}</p>
        </div>
      )}
      {enough && (
        <>
          <LiquidityMap snapshot={snapshot} />
          <div className={styles.zones}>
            {(["SUPPLY", "DEMAND"] as const).map((type) => {
              const zone = (
                type === "SUPPLY" ? snapshot.supplyZones : snapshot.demandZones
              )[0];
              return zone ? (
                <Zone
                  key={type}
                  zone={zone}
                  quote={snapshot.instrument.quoteAsset}
                  healthyVenues={healthy}
                  onAlert={onAlert}
                />
              ) : (
                <article key={type} className={styles.zone}>
                  <h3>Next {type === "SUPPLY" ? "Supply" : "Demand"} Zone</h3>
                  <p>
                    No sufficiently persistent concentration observed in the
                    monitored depth.
                  </p>
                </article>
              );
            })}
          </div>
          {snapshot.previousZones.length > 0 && (
            <aside className={styles.previous}>
              <h3>Changing structure</h3>
              {snapshot.previousZones.slice(0, 2).map((zone) => (
                <p key={zone.id}>
                  {zone.type === "SUPPLY"
                    ? "Previous supply"
                    : "Previous demand"}{" "}
                  at {priceLabel(zone.lower, snapshot.instrument.quoteAsset)}:{" "}
                  {lifecycle[zone.lifecycle].toLowerCase()}.
                </p>
              ))}
            </aside>
          )}
          <details className={styles.context}>
            <summary>Supporting market observations</summary>
            <dl className={styles.metrics}>
              <div>
                <dt>Aggressive buying</dt>
                <dd>
                  {priceLabel(
                    snapshot.cvd.buyNotional,
                    snapshot.instrument.quoteAsset,
                  )}
                </dd>
              </div>
              <div>
                <dt>Aggressive selling</dt>
                <dd>
                  {priceLabel(
                    snapshot.cvd.sellNotional,
                    snapshot.instrument.quoteAsset,
                  )}
                </dd>
              </div>
              <div>
                <dt>Buy minus sell volume</dt>
                <dd>
                  {priceLabel(
                    snapshot.cvd.delta,
                    snapshot.instrument.quoteAsset,
                  )}
                </dd>
              </div>
              <div>
                <dt>Collected trade history</dt>
                <dd>{duration(snapshot.cvd.historyMs)}</dd>
              </div>
              <div>
                <dt>Recent observed high</dt>
                <dd>
                  {snapshot.priceStructure.recentHigh === null
                    ? "Not yet available"
                    : priceLabel(
                        snapshot.priceStructure.recentHigh,
                        snapshot.instrument.quoteAsset,
                      )}
                </dd>
              </div>
              <div>
                <dt>Recent observed low</dt>
                <dd>
                  {snapshot.priceStructure.recentLow === null
                    ? "Not yet available"
                    : priceLabel(
                        snapshot.priceStructure.recentLow,
                        snapshot.instrument.quoteAsset,
                      )}
                </dd>
              </div>
            </dl>
            <p>
              Volume and price structure cover only the observations collected
              so far. Hidden orders, other exchanges and private trades are not
              visible.
            </p>
          </details>
        </>
      )}
      <p className={styles.disclaimer}>
        These zones describe observed market liquidity and trading structure.
        They are not guaranteed reversal points or personalized financial
        advice. Orders can disappear and price can move through any zone. No
        trade is placed by Market Radar.
      </p>
    </div>
  );
}
