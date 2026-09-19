"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { envPublic } from "@/lib/envPublic";
import styles from "./revenue.module.css";

type FeeGroup = { period: string; provider: string; chain: number; token: string; symbol: string; decimals: number;
  expected: string | null; accrued: string | null; received: string | null; submitted: number; not_verified: number; failed: number };
type VolumeGroup = { provider: string; chain: number; token: string; symbol: string; decimals: number;
  confirmed_swaps: number; measured_swaps: number; amount: string | null };
type Report = { feeGroups: FeeGroup[]; volumeGroups: VolumeGroup[]; funnel: Record<string, number>;
  providerOutcomes: { provider: string; outcome: string; count: number }[]; untrackedSubmissions: number; groupLimit: number };
type RecordRow = { id: string; state: string; reason: string; provider: string; source_chain: number;
  transaction_hash: string; attempts: number; created_at: string };
const today = () => new Date().toISOString().slice(0,10);
const monthAgo = () => new Date(Date.now() - 29 * 86400000).toISOString().slice(0,10);

function amount(raw: string | null, decimals: number): string {
  if (raw === null) return "Not verified";
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return "Unavailable";
  const digits = raw.padStart(decimals + 1,"0");
  if (!decimals) return digits;
  return (digits.slice(0,-decimals) + "." + digits.slice(-decimals)).replace(/\.?0+$/, "") || "0";
}

export default function RevenueDashboard() {
  const key = useRef("");
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [from, setFrom] = useState(monthAgo);
  const [until, setUntil] = useState(today);
  const [bucket, setBucket] = useState("day");
  const [report, setReport] = useState<Report | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [evidence, setEvidence] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function request<T>(path: string): Promise<T> {
    pending.current ??= new AbortController();
    const response = await fetch(envPublic.BACKEND_BASE_URL.replace(/\/$/,"") + path, {
      headers: { "X-Admin-Key": key.current }, cache: "no-store", credentials: "omit", redirect: "error",
      signal: pending.current.signal
    });
    if (!response.ok) throw new Error([401,403].includes(response.status)
      ? "Admin access denied." : "The report could not be loaded. Check the date range and try again.");
    return response.json() as Promise<T>;
  }
  function query(): URLSearchParams {
    return new URLSearchParams({ from: new Date(from + "T00:00:00Z").toISOString(),
      until: new Date(Math.min(Date.now(), new Date(until + "T00:00:00Z").getTime() + 86400000)).toISOString(), bucket });
  }
  async function load(nextOffset = 0) {
    if (loading) return;
    const currentGeneration = generation.current;
    setLoading(true); setError("");
    try {
      if (!key.current) { key.current = keyDraft.trim(); setKeyDraft(""); }
      const params = query();
      const result = await request<Report>("/api/admin/revenue?" + params);
      params.set("offset",String(nextOffset));
      const rows = await request<RecordRow[]>("/api/admin/revenue/records?" + params);
      if (generation.current !== currentGeneration) return;
      setReport(result); setRecords(rows); setOffset(nextOffset); setEvidence({});
    } catch (err) {
      if (generation.current !== currentGeneration) return;
      setError(err instanceof Error ? err.message : "Report unavailable.");
      setReport(null); setRecords([]);
      key.current = "";
    } finally { if (generation.current === currentGeneration) setLoading(false); }
  }
  async function inspect(id: string) {
    const currentGeneration = generation.current;
    try {
      const result = await request<unknown>("/api/admin/revenue/records/" + encodeURIComponent(id) + "/evidence");
      if (generation.current !== currentGeneration) return;
      setEvidence((current) => ({ ...current, [id]: result }));
    } catch { if (generation.current === currentGeneration) setError("Settlement evidence could not be loaded."); }
  }
  function lock() {
    generation.current++;
    pending.current?.abort(); pending.current = null; setLoading(false);
    key.current = ""; setKeyDraft(""); setReport(null); setRecords([]); setEvidence({}); setError("");
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/swap">Back to Swap</Link><h1>Revenue</h1></div>
      {report ? <button type="button" onClick={lock}>Lock dashboard</button> : null}</header>
    {!report ? <form className={styles.access} onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label htmlFor="admin-key">Admin access key</label>
      <input id="admin-key" type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)}
        autoComplete="off" maxLength={256} required />
      <button disabled={loading} type="submit">{loading ? "Opening..." : "Open dashboard"}</button>
    </form> : null}
    {error ? <p role="alert">{error}</p> : null}
    {report ? <>
      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label>From (UTC)<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Through (UTC)<input type="date" required value={until} max={today()} onChange={(event) => setUntil(event.target.value)} /></label>
        <label>Group by<select value={bucket} onChange={(event) => setBucket(event.target.value)}>
          <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
        </select></label>
        <button disabled={loading} type="submit">{loading ? "Loading..." : "Refresh report"}</button>
      </form>
      <section><h2>Fee stages</h2>
        <p>Expected amounts are estimates for submitted swaps. Accrued and received are separate stages of the same fee, not additional earnings. Unverified amounts are not income.</p>
        <div className={styles.tableWrap}><table><thead><tr>
          <th>Period (UTC)</th><th>Provider / chain</th><th>Token</th><th>Expected</th><th>Accrued, not received</th><th>Received</th><th>Unverified / failed</th>
        </tr></thead><tbody>{report.feeGroups.map((row,index) => <tr key={index}>
          <td>{new Date(row.period).toISOString().slice(0,10)}</td><td>{row.provider} / {row.chain}</td>
          <td title={row.token}>{row.symbol}<small>{row.token}</small></td>
          <td>{amount(row.expected,row.decimals)}</td><td>{amount(row.accrued,row.decimals)}</td><td>{amount(row.received,row.decimals)}</td>
          <td>{row.not_verified} / {row.failed}</td>
        </tr>)}</tbody></table></div>
        {!report.feeGroups.length ? <p>No submitted fee records in this window.</p> : null}
        {report.feeGroups.length >= report.groupLimit ? <p role="status">Group limit reached. Narrow the reporting window.</p> : null}
        <p>Submissions without server quote evidence: {report.untrackedSubmissions}. No USD valuation is inferred.</p>
      </section>
      <section><h2>Confirmed swap volume</h2>
        <div className={styles.tableWrap}><table><thead><tr><th>Provider / chain</th><th>Source token</th><th>Measured input</th><th>Measured / confirmed swaps</th></tr></thead>
          <tbody>{report.volumeGroups.map((row,index) => <tr key={index}>
            <td>{row.provider} / {row.chain}</td><td title={row.token}>{row.symbol}<small>{row.token}</small></td>
            <td>{amount(row.amount,row.decimals)}</td><td>{row.measured_swaps} / {row.confirmed_swaps}</td>
          </tr>)}</tbody></table></div>
        <p>Only independently confirmed swaps count here. Missing transfer evidence is unavailable, not zero volume.</p>
      </section>
      <section><h2>First-party activity</h2>
        <dl className={styles.metrics}>
          {[["Quote requests","quote_requests"],["Quoted routes","quoted_routes"],["Review intent","reviewed_routes"],
            ["Submitted routes","submitted_routes"],["Confirmed routes","independently_confirmed_routes"]].map(([label,name]) =>
            <div key={name}><dt>{label}</dt><dd>{report.funnel[name!] ?? 0}</dd></div>)}
        </dl>
        <p>Quote-cohort counts. Review intent is best-effort and requires a signed-in wallet; it is not settlement evidence. Cached quotes are counted once.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Provider</th><th>Outcome</th><th>Count</th></tr></thead><tbody>
          {report.providerOutcomes.map((row) => <tr key={row.provider+row.outcome}><td>{row.provider}</td><td>{row.outcome.replaceAll("_"," ")}</td><td>{row.count}</td></tr>)}
        </tbody></table></div>
      </section>
      <section><h2>Reconciliation records</h2>
        <div className={styles.tableWrap}><table><thead><tr><th>Created</th><th>Provider / chain</th><th>Transaction</th><th>State</th><th>Evidence</th></tr></thead><tbody>
          {records.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.provider ?? "Untracked"} / {row.source_chain}</td>
            <td className={styles.hash}>{row.transaction_hash}</td><td>{row.state}<small>{row.reason.replaceAll("_"," ")}</small></td>
            <td><button type="button" onClick={() => void inspect(row.id)}>Inspect</button>
              {evidence[row.id] ? <pre>{JSON.stringify(evidence[row.id],null,2)}</pre> : null}</td></tr>)}
        </tbody></table></div>
        <div className={styles.filters}><button disabled={loading || offset === 0} onClick={() => void load(offset-100)}>Previous</button>
          <span>Page {offset/100+1}</span><button disabled={loading || records.length<100 || offset>=10000} onClick={() => void load(offset+100)}>Next</button></div>
      </section>
    </> : null}
  </main>;
}
