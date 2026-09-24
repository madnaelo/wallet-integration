"use client";

import { useEffect, useRef, useState } from "react";
import { RadarView } from "@/components/market-radar/RadarView";
import {
  deleteRadarAlert,
  getRadarSnapshot,
  listRadarAlerts,
  listRadarMarkets,
  saveRadarAlert,
  type RadarAlertRule,
} from "@/lib/backendClient";
import { readStoredBackendSession } from "@/lib/backendSession";
import { envPublic } from "@/lib/envPublic";
import type { LiquidityZone, MarketRadarSnapshot } from "@/market-radar/types";
import styles from "./page.module.css";

const alertOptions = [
  ["SUPPLY_APPROACHED", "Supply zone approached"],
  ["DEMAND_APPROACHED", "Demand zone approached"],
  ["ZONE_STRENGTHENED", "Zone strengthened"],
  ["ZONE_WEAKENED", "Zone weakened"],
  ["ZONE_BROKEN", "Zone broken"],
  ["BUYER_ABSORPTION_INCREASED", "Buyer absorption increased"],
  ["SELLER_ABSORPTION_INCREASED", "Seller absorption increased"],
] as const;
const base = envPublic.BACKEND_BASE_URL;

export default function RadarExperience({
  liveEnabled,
}: {
  liveEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<{ key: string }[]>([]);
  const [pair, setPair] = useState("");
  const [snapshot, setSnapshot] = useState<MarketRadarSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [session, setSession] =
    useState<ReturnType<typeof readStoredBackendSession>>(null);
  const [rules, setRules] = useState<RadarAlertRule[]>([]);
  const [alertOpen, setAlertOpen] = useState(false);
  const [eventType, setEventType] = useState("SUPPLY_APPROACHED");
  const [minimumScore, setMinimumScore] = useState(60);
  const [cooldown, setCooldown] = useState(60);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const alertRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const stored = readStoredBackendSession();
    setSession(stored);
    const initial =
      new URLSearchParams(window.location.search).get("pair") ?? "";
    if (
      /^[A-Z0-9][A-Z0-9._-]{0,31}\/[A-Z0-9][A-Z0-9._-]{0,31}\/SPOT$/.test(
        initial,
      )
    )
      setPair(initial);
  }, []);
  useEffect(() => {
    if (!liveEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void listRadarMarkets(base, query, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setMarkets(items);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setMessage("Live market intelligence temporarily unavailable");
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [liveEnabled, query]);
  useEffect(() => {
    if (!liveEnabled || !pair) return;
    const controller = new AbortController();
    let loading = false;
    setSnapshot(null);
    setMessage("Building observations for this market.");
    const refresh = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const next = await getRadarSnapshot(base, pair, controller.signal);
        if (controller.signal.aborted) return;
        if ("instrument" in next) {
          setSnapshot(next);
          setMessage("");
        } else {
          setSnapshot(null);
          setMessage(
            next.message ?? "Live market intelligence temporarily unavailable",
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setMessage("Live market intelligence temporarily unavailable");
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [liveEnabled, pair]);
  useEffect(() => {
    if (!liveEnabled || !session) return;
    let current = true;
    void listRadarAlerts(base, session)
      .then((items) => {
        if (current) setRules(items);
      })
      .catch(() => {
        if (current) setNotice("Sign in again to manage saved alerts.");
      });
    return () => {
      current = false;
    };
  }, [liveEnabled, session]);
  function openAlert(zone: LiquidityZone) {
    setEventType(
      zone.type === "SUPPLY" ? "SUPPLY_APPROACHED" : "DEMAND_APPROACHED",
    );
    setAlertOpen(true);
    window.setTimeout(() => alertRef.current?.focus(), 0);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !pair || saving) return;
    setSaving(true);
    setNotice("");
    try {
      await saveRadarAlert(base, session, {
        pairKey: pair,
        eventType,
        minimumScore,
        cooldownMinutes: cooldown,
      });
      setRules(await listRadarAlerts(base, session));
      setNotice(
        "Alert saved. Delivery uses your enabled notification channels.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The alert could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    if (!session || saving) return;
    setSaving(true);
    try {
      await deleteRadarAlert(base, session, id);
      setRules((items) => items.filter((item) => item.id !== id));
      setNotice("Alert removed.");
    } catch {
      setNotice("The alert could not be removed. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  if (!liveEnabled)
    return (
      <>
        <div className={styles.availability} role="status">
          <span>Preview available</span>
          <h2>Live market coverage is not enabled yet.</h2>
          <p>
            Market Radar tracks visible supply and demand, how long liquidity
            stays, and whether trades consume or replenish it. Public live
            coverage will open only for approved data sources.
          </p>
          <a className={styles.primary} href="/demo#market-radar">
            Explore the synthetic Market Radar demo
          </a>
        </div>
        <section className={styles.principles}>
          <div>
            <h3>Supply & demand</h3>
            <p>
              Observe price ranges with unusually concentrated buying or selling
              liquidity.
            </p>
          </div>
          <div>
            <h3>Watch the change</h3>
            <p>
              Distinguish persistent walls from liquidity that disappears as
              price approaches.
            </p>
          </div>
          <div>
            <h3>Evidence, not certainty</h3>
            <p>
              Compare healthy venues and executed trades. A structural score is
              not a probability of profit.
            </p>
          </div>
        </section>
        <p className={styles.disclaimer}>
          These zones describe observed market liquidity and trading structure.
          They are not guaranteed reversal points or personalized financial
          advice. Market Radar never places orders or moves funds.
        </p>
      </>
    );
  return (
    <>
      <div className={styles.selector}>
        <label>
          Find a market
          <input
            type="search"
            value={query}
            maxLength={32}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Asset or pair"
          />
        </label>
        <label>
          Pair
          <select
            value={pair}
            onChange={(event) => {
              setPair(event.target.value);
              setAlertOpen(false);
              window.history.replaceState(
                null,
                "",
                `/market-radar?pair=${encodeURIComponent(event.target.value)}`,
              );
            }}
          >
            <option value="">Choose a market</option>
            {pair && !markets.some((m) => m.key === pair) && (
              <option value={pair}>{pair.replace("/SPOT", "")}</option>
            )}
            {markets.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key.replace("/SPOT", "")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      {snapshot && <RadarView snapshot={snapshot} onAlert={openAlert} />}
      {alertOpen && (
        <section
          className={styles.alerts}
          aria-labelledby="radar-alert-heading"
        >
          <h2 id="radar-alert-heading">Create a Market Radar alert</h2>
          {!session ? (
            <p>
              Sign in with your wallet to protect your saved alert preferences.
              This does not approve any transaction.{" "}
              <a href="/swap#preferences">Sign in to save alerts</a>
            </p>
          ) : (
            <form onSubmit={save}>
              <label>
                Notify me when
                <select
                  ref={alertRef}
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                >
                  {alertOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum structural strength
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={minimumScore}
                  onChange={(e) => setMinimumScore(Number(e.target.value))}
                />
              </label>
              <label>
                Time between alerts
                <select
                  value={cooldown}
                  onChange={(e) => setCooldown(Number(e.target.value))}
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={360}>6 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </label>
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save alert"}
              </button>
            </form>
          )}
          <p>
            Alerts describe observed changes. They do not place a trade.{" "}
            <a href="/swap#preferences">Manage notification channels</a>
          </p>
        </section>
      )}
      <p role="status">{notice}</p>
      {rules.length > 0 && (
        <section className={styles.alerts}>
          <h2>Your Market Radar alerts</h2>
          <ul>
            {rules.map((rule) => (
              <li key={rule.id}>
                <span>
                  {rule.pairKey.replace("/SPOT", "")}:{" "}
                  {alertOptions.find(([key]) => key === rule.eventType)?.[1]} (
                  {rule.minimumScore}/100 or above)
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void remove(rule.id);
                  }}
                >
                  Remove alert
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={styles.next}>
        <a className={styles.primary} href="/swap">
          Get a quote
        </a>
        <p>
          Choose the correct asset and network, then review a fresh quote in the
          normal swap flow. No trade is triggered by a Radar signal.
        </p>
      </div>
    </>
  );
}
