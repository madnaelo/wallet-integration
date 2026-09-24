"use client";

import { useEffect, useState } from "react";
import { TokenPicker } from "@/components/TokenPicker";
import { RadarDemo } from "@/components/market-radar/RadarDemo";
import { DEMO_TOKENS, DEMO_NETWORKS, demoQuotes, demoAmount } from "@/lib/demo";
import { COMMERCIAL } from "@/lib/commercial";
import styles from "./demo.module.css";

type Activity = { pair: string; output: string; route: string };

export default function DemoExperience() {
  const [source, setSource] = useState(DEMO_TOKENS[0]);
  const [destination, setDestination] = useState(DEMO_TOKENS[1]);
  const [amount, setAmount] = useState("1");
  const [slippage, setSlippage] = useState(50);
  const [connected, setConnected] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [routeIndex, setRouteIndex] = useState(0);
  const [view, setView] = useState<"Swap" | "Activity" | "Alerts" | "Market Radar">("Swap");
  useEffect(()=>{if(window.location.hash==="#market-radar")setView("Market Radar");},[]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [target, setTarget] = useState("2600");
  const [savedTarget, setSavedTarget] = useState("");
  const [notice, setNotice] = useState("");
  const quotes = demoQuotes(source.address, destination.address, amount, slippage);
  const quote = quotes[routeIndex];
  function resetReview() { setReviewed(false); setNotice(""); }
  function preview() {
    if (!connected || !quote || !reviewed) return;
    setActivity(items => [{ pair: `${amount} ${source.symbol} to ${destination.symbol}`, output: `${demoAmount(quote.output, destination.decimals)} ${destination.symbol}`, route: quote.route }, ...items].slice(0, 10));
    setReviewed(false);
    setNotice("Preview complete. No wallet was opened, no transaction was sent and no fee was collected.");
  }
  return <div className={styles.shell}>
    <div className={styles.banner}><strong>Interactive demonstration</strong><span>Sample prices and wallet only. No real transactions, orders or fees.</span></div>
    <header className={styles.header}><div><p className={styles.eyebrow}>Your brand, your swap experience</p><h1>Swap Assistant</h1><p>A preview for your product team.</p></div>
      <button type="button" className={styles.wallet} onClick={() => { setConnected(!connected); resetReview(); }}>
        {connected ? "Sample wallet connected · Disconnect" : "Use sample wallet"}
      </button>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="Demo views">{(["Swap", "Activity", "Alerts", "Market Radar"] as const).map((tab, index, tabs) => <button key={tab} role="tab" id={`tab-${tab.replaceAll(" ","-")}`} aria-controls={`panel-${tab.replaceAll(" ","-")}`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setView(tabs[next]); document.getElementById(`tab-${tabs[next].replaceAll(" ","-")}`)?.focus();
    }} onClick={() => setView(tab)} type="button">{tab}</button>)}</div>
    {view === "Swap" && <section id="panel-Swap" role="tabpanel" aria-labelledby="tab-Swap" className={styles.workspace}>
      <div className={styles.form}>
        <h2>Swap</h2><div className={styles.pair}>
          <TokenPicker label="You sell" value={source.address} selectedNetworkId={source.networkId} networks={DEMO_NETWORKS} tokens={DEMO_TOKENS} loading={false} onChange={token => { setSource(token); resetReview(); }} />
          <button type="button" title="Reverse pair" aria-label="Reverse pair" className={styles.reverse} onClick={() => { setSource(destination); setDestination(source); resetReview(); }}>&harr;</button>
          <TokenPicker label="You receive" value={destination.address} selectedNetworkId={destination.networkId} networks={DEMO_NETWORKS} tokens={DEMO_TOKENS} loading={false} onChange={token => { setDestination(token); resetReview(); }} />
        </div>
        <label className={styles.field}>Amount<input inputMode="decimal" maxLength={40} value={amount} onChange={event => { setAmount(event.target.value); resetReview(); }} /></label>
        <div className={styles.settings}><label className={styles.field}>Slippage tolerance<select value={slippage} onChange={event => { setSlippage(Number(event.target.value)); resetReview(); }}><option value={10}>0.1%</option><option value={50}>0.5%</option><option value={100}>1%</option></select></label>
          <div className={styles.field}>Recipient<span className={styles.recipient}>{connected ? "Sample wallet" : "No sample wallet selected"}</span></div></div>
        <p className={styles.note}>In a customer deployment, users connect their own wallet. Here, the sample wallet lets you explore without connecting or signing.</p>
        <button className={styles.primary} type="button" disabled={!quote} onClick={() => { setReviewed(true); setNotice(""); }}>Review sample quote</button>
        {!quote && <p role="alert">Choose different tokens and a positive amount, up to 1,000,000 tokens.</p>}
      </div>
      <div className={styles.summary} aria-label="Sample trade summary">
        <div className={styles.summaryTitle}><h2>Trade summary</h2><span>Illustrative prices</span></div>
        {quote ? <>
          <label className={styles.field}>Compare sample routes<select value={routeIndex} onChange={event => { setRouteIndex(Number(event.target.value)); resetReview(); }}>{quotes.map((item, i) => <option key={item.route} value={i}>{item.route} · {demoAmount(item.output, destination.decimals)} {destination.symbol}</option>)}</select></label>
          <dl className={styles.totals}><div><dt>You sell</dt><dd>{amount} {source.symbol}</dd></div><div><dt>Sample service fee</dt><dd>{demoAmount(quote.fee, destination.decimals)} {destination.symbol}</dd></div><div><dt>Sample network cost</dt><dd>Not included in this preview</dd></div><div className={styles.output}><dt>You receive after fees</dt><dd>{demoAmount(quote.output, destination.decimals)} {destination.symbol}</dd></div><div><dt>Minimum received</dt><dd>{demoAmount(quote.minimum, destination.decimals)} {destination.symbol}</dd></div></dl>
          {reviewed && <p className={styles.approval}>Your wallet, your approval. A real swap asks you to review and sign in your wallet. This preview never opens a wallet or submits anything.</p>}
          <button className={styles.primary} type="button" disabled={!connected || !reviewed} onClick={preview}>Complete preview</button>
          {!connected && <p className={styles.note}>Select the sample wallet to complete the preview.</p>}
        </> : <p>No sample quote for these inputs.</p>}
        <p role="status" className={styles.status}>{notice}</p>
      </div>
    </section>}
    {view === "Activity" && <section id="panel-Activity" role="tabpanel" aria-labelledby="tab-Activity" className={styles.secondaryPanel}>
      <h2>Sample activity</h2><p>Preview results only, kept until you leave or refresh this page. These are not settled swaps or revenue.</p>
      {activity.length ? <div className={styles.tableWrap}><table><thead><tr><th>Pair</th><th>Output</th><th>Route</th><th>Status</th></tr></thead><tbody>{activity.map((item, i) => <tr key={i}><td>{item.pair}</td><td>{item.output}</td><td>{item.route}</td><td>Preview only</td></tr>)}</tbody></table></div> : <p>No previews yet.</p>}
      <p>In a customer deployment, wallet sign-in protects saved history. Private admin reporting keeps expected, accrued and received fees separate and requires independent settlement evidence.</p>
    </section>}
    {view === "Market Radar" && <section id="panel-Market-Radar" role="tabpanel" aria-labelledby="tab-Market-Radar"><RadarDemo/></section>}
    {view === "Alerts" && <section id="panel-Alerts" role="tabpanel" aria-labelledby="tab-Alerts" className={styles.secondaryPanel}>
      <h2>Sample price alert</h2><p>ETH to USDC on Ethereum. Explore an alert preference; no notification will be sent.</p>
      <form className={styles.alertForm} onSubmit={event => { event.preventDefault(); const rate = Number(target); if (Number.isFinite(rate) && rate > 0 && rate <= 1000000) setSavedTarget(target); }}>
        <label className={styles.field}>Notify when 1 ETH reaches this USDC amount<input type="number" min="0.000001" max="1000000" step="any" required value={target} onChange={event => setTarget(event.target.value)} /></label><button className={styles.primary}>Save sample alert</button>
      </form><p role="status">{savedTarget ? `Sample alert saved at ${savedTarget} USDC. Nothing is scheduled or sent.` : ""}</p>
      <p>Configured deployments support price, reverse-profit and loss alerts. Telegram, email and push require account setup and supported devices.</p>
    </section>}
    <aside className={styles.next}><div><h2>See this under your brand.</h2><p>Existing capabilities, your provider accounts, one isolated deployment.</p></div><a href={COMMERCIAL.demoRequest}>Request a branded demo <span aria-hidden="true">&rarr;</span></a></aside>
  </div>;
}
