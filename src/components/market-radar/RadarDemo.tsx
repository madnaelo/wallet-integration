"use client";

import { useEffect, useState } from "react";
import { RadarView } from "@/components/market-radar/RadarView";
import { syntheticRadar } from "@/lib/marketRadarDemo";
import styles from "@/components/market-radar/radar.module.css";

export function RadarDemo() {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alertType, setAlertType] = useState("Supply zone approached");
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPhase((p) => (p + 1) % 3), 4000);
    return () => window.clearInterval(timer);
  }, [playing]);
  return (
    <section aria-label="Synthetic Market Radar">
      <div className={styles.controls}>
        <label>
          Illustrative scenario
          <select
            value={phase}
            onChange={(event) => {
              setPhase(Number(event.target.value));
              setPlaying(false);
            }}
          >
            <option value={0}>1. Persistent supply: 84 / 100</option>
            <option value={1}>2. Price approaches: 67 / 100</option>
            <option value={2}>3. Supply weakens: 43 / 100</option>
          </select>
        </label>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause scenario" : "Play scenario"}
        </button>
      </div>
      {phase > 0 && (
        <p className={styles.scenario} role="status">
          Previous supply zone weakening: buyers are consuming visible supply as
          price approaches. Breakout risk increasing. This does not predict a
          breakout.
        </p>
      )}
      <RadarView
        snapshot={syntheticRadar(phase)}
        synthetic
        onAlert={() => {
          setSaved(false);
          document.getElementById("radar-demo-alert")?.focus();
        }}
      />
      <form
        className={styles.controls}
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <label>
          Sample alert
          <select
            id="radar-demo-alert"
            value={alertType}
            onChange={(event) => {
              setAlertType(event.target.value);
              setSaved(false);
            }}
          >
            {[
              "Supply zone approached",
              "Demand zone approached",
              "Zone strengthened",
              "Zone weakened",
              "Zone broken",
              "Buyer absorption increased",
              "Seller absorption increased",
            ].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <button type="submit">Save sample alert</button>
      </form>
      <p className={styles.saved} role="status">
        {saved
          ? `Sample alert: ${alertType.toLowerCase()}. Nothing is scheduled, sent or stored.`
          : ""}
      </p>
    </section>
  );
}
