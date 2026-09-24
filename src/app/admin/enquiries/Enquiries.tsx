"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { envPublic } from "@/lib/envPublic";
import type { Attribution } from "@/lib/growth";
import styles from "../revenue/revenue.module.css";
type Enquiry = { id: string; name: string | null; email: string; topic: string; message: string; status: string; createdAt: string; attribution: Attribution };
type Report = { note: string; days: number; events: { event: string; page: string; utm_source: string; utm_campaign: string; observations: number }[];
  enquiries: { enquiry_type: string; utm_source: string; utm_campaign: string; submissions: number }[] };
export default function Enquiries() {
  const [draft, setDraft] = useState(""); const key = useRef("");
  const generation = useRef(0); const pending = useRef<AbortController | null>(null);
  const [rows, setRows] = useState<Enquiry[] | null>(null); const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => () => { pending.current?.abort(); key.current = ""; }, []);
  function lock() {
    generation.current++; pending.current?.abort(); key.current = ""; setDraft("");
    setRows(null); setReport(null); setError(""); setBusy(false);
  }
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(envPublic.BACKEND_BASE_URL.replace(/\/$/, "") + path, {
      ...options, headers: { "X-Admin-Key": key.current, "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: pending.current?.signal
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Admin access denied." : "Enquiries could not be loaded.");
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  async function load() {
    if (busy) return;
    const current = generation.current; pending.current = new AbortController(); setBusy(true); setError("");
    if (!key.current) { key.current = draft.trim(); setDraft(""); }
    try {
      const next = await request<Enquiry[]>("/api/admin/contact-submissions?limit=100");
      const summary = await request<Report>("/api/admin/growth?days=30");
      if (current === generation.current) { setRows(next); setReport(summary); }
    } catch (err) {
      if (current === generation.current) { setRows(null); setReport(null); key.current = ""; setError(err instanceof Error ? err.message : "Unavailable."); }
    } finally { if (current === generation.current) setBusy(false); }
  }
  async function update(id: string, status: string) {
    if (busy) return;
    const current = generation.current; setBusy(true); setError("");
    try {
      await request("/api/admin/contact-submissions/" + id, { method: "PATCH", body: JSON.stringify({ status }) });
      if (current === generation.current) setRows((previous) => previous?.map(row => row.id === id ? { ...row, status } : row) ?? null);
    } catch { if (current === generation.current) setError("The status could not be saved."); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <main className={styles.page}><header className={styles.header}><div><Link href="/business">For teams</Link><h1>Enquiries</h1></div>
    {rows && <button onClick={lock}>Lock dashboard</button>}</header>
    {!rows ? <form className={styles.access} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label htmlFor="enquiry-key">Admin access key</label><input id="enquiry-key" type="password" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} required />
      <button disabled={busy}>{busy ? "Loading" : "Open enquiries"}</button></form> : <>
      <section><h2>Last 30 days</h2><p>{report?.note}</p><button onClick={() => void load()} disabled={busy}>Refresh</button>
        <div className={styles.tableWrap}><table><thead><tr><th>Event</th><th>Page</th><th>Source / campaign</th><th>Count</th></tr></thead>
          <tbody>{report?.events.map((row, i) => <tr key={i}><td>{row.event}</td><td>{row.page}</td><td>{row.utm_source || "Unattributed"} / {row.utm_campaign || "None"}</td><td>{row.observations}</td></tr>)}</tbody></table></div>
        <p>Qualified prospects, replies, pilots and customers are recorded in the private sales tracker. These event counts are not conversions.</p>
        <h3>Stored enquiries</h3>
        <div className={styles.tableWrap}><table><thead><tr><th>Type</th><th>Source / campaign</th><th>Submissions</th></tr></thead>
          <tbody>{report?.enquiries.map((row, i) => <tr key={i}><td>{row.enquiry_type}</td><td>{row.utm_source || "Unattributed"} / {row.utm_campaign || "None"}</td><td>{row.submissions}</td></tr>)}</tbody></table></div>
      </section><section><h2>Latest 100 messages</h2>{rows.length === 0 && <p>No enquiries yet.</p>}
        <div className={styles.tableWrap}><table><thead><tr><th>Received / sender</th><th>Enquiry</th><th>Attribution (unverified)</th><th>Status</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}<br />{row.name}<br />{row.email}</td>
            <td>{row.attribution.enquiryType}<br />{row.topic}<pre>{row.message}</pre></td>
            <td>{row.attribution.landingPage || "Not recorded"}<br />{row.attribution.referrer}<br />{row.attribution.utmSource} / {row.attribution.utmMedium}<br />{row.attribution.utmCampaign}</td>
            <td><select aria-label={`Status for ${row.id}`} value={row.status} disabled={busy} onChange={e => void update(row.id, e.target.value)}>{["new", "reviewed", "resolved", "spam"].map(status => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>
      </section></>}
    {error && <p role="alert">{error}</p>}</main>;
}
