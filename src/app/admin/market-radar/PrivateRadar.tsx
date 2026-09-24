"use client";

import Link from "next/link";
import { LockKeyhole, Radio, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RadarView } from "@/components/market-radar/RadarView";
import { envPublic } from "@/lib/envPublic";
import type { MarketRadarSnapshot } from "@/market-radar/types";
import layout from "../../market-radar/page.module.css";
import styles from "./private.module.css";

type Market = { key: string };
type Result = MarketRadarSnapshot | { status: "BUILDING" | "UNAVAILABLE" };
const base =
  envPublic.BACKEND_BASE_URL.replace(/\/$/, "") + "/api/admin/market-radar";

export default function PrivateRadar() {
  const key = useRef("");
  const generation = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const [draft, setDraft] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [pair, setPair] = useState("");
  const [snapshot, setSnapshot] = useState<MarketRadarSnapshot | null>(null);
  const [message, setMessage] = useState("");

  const clear = useCallback(() => {
    generation.current++;
    requests.current.forEach((request) => request.abort());
    requests.current.clear();
    key.current = "";
    setDraft("");
    setUnlocked(false);
    setBusy(false);
    setError("");
    setMarkets([]);
    setPair("");
    setQuery("");
    setSnapshot(null);
    setMessage("");
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      requests.current.forEach((request) => request.abort());
      key.current = "";
    },
    [],
  );

  const request = useCallback(
    async <T,>(path: string): Promise<T> => {
      const current = generation.current;
      const controller = new AbortController();
      requests.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(base + path, {
          headers: { "X-Admin-Key": key.current },
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        if (generation.current !== current) throw new Error("Workspace was locked.");
        if (!response.ok) {
          if ([401, 403].includes(response.status)) {
            clear();
            setError(
              "Owner access denied. Enter the current admin access key.",
            );
          }
          throw new Error(
            response.status === 429
              ? "The private watchlist or request limit is full. Please try again shortly."
              : response.status === 503
                ? "Private live market intelligence is temporarily unavailable."
                : "The private market could not be loaded.",
          );
        }
        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
        requests.current.delete(controller);
      }
    },
    [clear],
  );

  async function unlock() {
    if (busy) return;
    const current = generation.current;
    key.current = draft.trim();
    setDraft("");
    setBusy(true);
    setError("");
    try {
      await request("/status");
      if (generation.current === current) setUnlocked(true);
    } catch (err) {
      if (generation.current === current) {
        key.current = "";
        setError(
          err instanceof Error ? err.message : "Private access unavailable.",
        );
      }
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    const current = generation.current;
    const timer = setTimeout(() => {
      void request<Market[]>(
        "/markets?" + new URLSearchParams({ q: query.trim() }),
      )
        .then((rows) => {
          if (!active || generation.current !== current) return;
          setMarkets(rows);
          setPair((previous) => previous || rows[0]?.key || "");
          setError("");
          if (!rows.length)
            setMessage(
              "No qualifying markets found. The live feed may still be starting.",
            );
        })
        .catch((err: unknown) => {
          if (active && generation.current === current)
            setError(
              err instanceof Error ? err.message : "Markets unavailable.",
            );
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, unlocked, request]);

  useEffect(() => {
    if (!unlocked || !pair) return;
    let active = true;
    let loading = false;
    const current = generation.current;
    setSnapshot(null);
    setMessage("Gathering live observations...");
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const result = await request<Result>(
          "/snapshot?" + new URLSearchParams({ pair }),
        );
        if (!active || generation.current !== current) return;
        setError("");
        if ("status" in result) {
          setSnapshot(null);
          setMessage(
            result.status === "BUILDING"
              ? "Gathering live observations. A newly watched market needs at least two minutes of continuous data."
              : "Live market intelligence temporarily unavailable.",
          );
        } else {
          setSnapshot(result);
          setMessage("");
        }
      } catch (err) {
        if (active && generation.current === current) {
          setSnapshot(null);
          setError(
            err instanceof Error
              ? err.message
              : "Live market intelligence temporarily unavailable.",
          );
        }
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pair, unlocked, request]);

  return (
    <main className={`container ${layout.page}`}>
      <header className={styles.header}>
        <div>
          <Link href="/market-radar">Market Radar</Link>
          <h1>Private workspace</h1>
        </div>
        {unlocked ? (
          <button onClick={clear} type="button">
            <LockKeyhole size={16} />
            Lock workspace
          </button>
        ) : null}
      </header>
      <div className={styles.notice}>
        <Radio size={18} />
        <strong>PRIVATE / INTERNAL LIVE DATA</strong>
        <span>Binance research feed only</span>
      </div>
      {!unlocked ? (
        <section className={styles.access}>
          <h2>Owner access</h2>
          <p>
            This workspace is restricted to authorized internal use. Public
            Market Radar and the demo do not use this live feed.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <label htmlFor="radar-admin-key">Admin access key</label>
            <input
              id="radar-admin-key"
              type="password"
              autoComplete="off"
              maxLength={256}
              required
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              <LockKeyhole size={16} />
              {busy ? "Opening..." : "Open private Radar"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <p className={styles.context}>
            Observed liquidity on one venue, not the whole market.
            Cross-exchange confirmation is unavailable in this mode. No orders
            or swaps are placed here.
          </p>
          <div className={layout.selector}>
            <label>
              <span>
                <Search size={14} /> Find a market
              </span>
              <input
                type="search"
                value={query}
                maxLength={32}
                onChange={(event) =>
                  setQuery(event.target.value.replace(/[^A-Za-z0-9/.-]/g, ""))
                }
                placeholder="Search asset or pair"
              />
            </label>
            <label>
              Market
              <select
                value={pair}
                onChange={(event) => setPair(event.target.value)}
                aria-label="Market"
              >
                {!pair ? <option value="">Choose a market</option> : null}
                {pair && !markets.some((market) => market.key === pair) ? (
                  <option value={pair}>{pair.replaceAll("/", " / ")}</option>
                ) : null}
                {markets.map((market) => (
                  <option key={market.key} value={market.key}>
                    {market.key.replaceAll("/", " / ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {snapshot ? (
            <RadarView snapshot={snapshot} />
          ) : message ? (
            <p role="status" className={layout.message}>
              {message}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <p className={layout.disclaimer}>
        These zones describe observed market liquidity and trading structure.
        They are not guaranteed reversal points or personalized financial
        advice.
      </p>
      <footer className={layout.footer}>
        <Link href="/market-radar">Public Radar</Link>
        <Link href="/demo">Synthetic demo</Link>
        <Link href="/swap">Swap</Link>
      </footer>
    </main>
  );
}
