import type { Metadata } from "next";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { COMMERCIAL } from "@/lib/commercial";
import { CommercialNav, CommercialFooter } from "@/components/CommercialNav";
import styles from "./business.module.css";

export const metadata: Metadata = {
  title: "Branded Non-Custodial Swap Software for Teams",
  description: "License Swap Assistant for your Web3 product. Wallet connections, route comparison, activity and alerts, deployed under your brand with your own provider accounts.",
  alternates: { canonical: "/business" },
  openGraph: { title: "Swap Assistant for teams", url: "/business", description: "A reusable swap product. Your brand, your infrastructure, your users' wallets." },
  robots: { index: true, follow: true }
};

const capabilities = [
  ["Wallets & assets", "Browser and mobile wallet connection flows, searchable tokens and network-aware recipients."],
  ["Quotes & review", "Compare normalized routes, inspect expected output, fees, slippage and minimum received before wallet approval."],
  ["Same-chain & cross-chain", "Provider-supported routes through 0x and LI.FI. Availability depends on the assets, networks and your approved accounts."],
  ["Activity & alerts", "Wallet-authenticated history, favorite pairs and price, reverse-profit and loss alerts. Delivery depends on configured channels and device support."],
  ["Validation & reconciliation", "Transaction checks, delivery tracking and independent fee evidence. Expected, accrued and received fees stay separate; unsupported proof stays unverified."],
  ["Deployment & handover", "Brand configuration, isolated deployment checks, automated tests, release controls, backups and build/run documentation."]
];

export default function BusinessPage() {
  return <main className={styles.page}>
    <CommercialNav active="business" />
    <section className={styles.hero} aria-labelledby="business-title">
      <Image className={styles.heroImage} src="/business-demo.png" alt="" fill priority sizes="100vw" />
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>For Web3 products, wallets & agencies</p>
        <h1 id="business-title">{BRAND.name}<br /><span>for your product.</span></h1>
        <p className={styles.lead}>Launch a branded non-custodial swap experience without rebuilding the wallet, routing and transaction workflow.</p>
        <p>Your users keep their wallets. Your team operates its own deployment and approved provider accounts. We provide the reusable product and a scoped setup service.</p>
        <div className={styles.actions}>
          <a className={styles.primary} href={COMMERCIAL.demoRequest}>Request a branded demo</a>
          <a className={styles.secondary} href={COMMERCIAL.demoPath}>Explore the safe demo <span aria-hidden="true">&rarr;</span></a>
        </div>
        <p className={styles.caption}>No wallet, funds or call required to explore.</p>
      </div>
    </section>
    <section className={styles.band} aria-labelledby="built-title">
      <p className={styles.eyebrow}>Start with a working product</p>
      <h2 id="built-title">The work between a quote and a usable product.</h2>
      <p className={styles.sectionLead}>Adding a swap API is only part of the job. Wallet handoffs, different networks, inconsistent quotes, transaction review and delivery states all need a coherent experience.</p>
      <div className={styles.capabilities}>{capabilities.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
      <a href={COMMERCIAL.demoPath} className={styles.productImage}><Image src="/business-demo.png" alt="Swap Assistant demonstration with sample wallet, token selection, route comparison and fee review" width={1440} height={1000} sizes="(max-width: 760px) 100vw, 1116px" /></a>
    </section>
    <section className={`${styles.band} ${styles.trust}`} aria-labelledby="trust-title">
      <div><p className={styles.eyebrow}>A clear custody boundary</p><h2 id="trust-title">Their keys.<br />Their approval.</h2></div>
      <div><p>Users keep their private keys and review and sign swap transactions in their own wallets. The application does not take custody of their principal, and the backend does not sign swaps for them.</p>
        <p>Supported limit orders use terms signed in advance by the user and enforced by the relevant protocol. They are not unrestricted permission to move funds. No order or transaction is submitted in the public demo.</p>
        <a href={COMMERCIAL.demoPath}>See the review experience <span aria-hidden="true">&rarr;</span></a></div>
    </section>
    <section className={styles.band} aria-labelledby="delivery-title">
      <p className={styles.eyebrow}>A non-exclusive license + setup service</p>
      <h2 id="delivery-title">Your brand. Your deployment. A defined handover.</h2>
      <ol className={styles.delivery}>
        <li><span>01</span><h3>Agree the scope</h3><p>One customer brand, existing capabilities and a limited agreed set of supported networks and providers.</p></li>
        <li><span>02</span><h3>Configure & validate</h3><p>Your provider accounts, credentials and payout settings. Separate infrastructure, database and secrets, with acceptance checks.</p></li>
        <li><span>03</span><h3>Deploy & hand over</h3><p>Build/run documentation, deployment, handover and a defined defect-correction window. Custom work is quoted separately.</p></li>
      </ol>
      <p className={styles.note}>You remain the operator and are responsible for applicable permissions, provider terms and infrastructure costs. We retain the reusable core. License rights and delivery scope are agreed in writing.</p>
    </section>
    <section className={`${styles.band} ${styles.pilot}`} aria-labelledby="pilot-title">
      <p className={styles.eyebrow}>One focused paid pilot</p><h2 id="pilot-title">Bring your use case. We will scope the fit.</h2>
      <p>For teams with an existing product or audience and someone responsible for operating it. Start with branding, configuration, deployment, acceptance testing and handover, using what is already built.</p>
      <p>No custody, liquidity provision, new protocols, legal services, unlimited development or 24/7 operations are included.</p>
      <div className={styles.actions}><a className={styles.primary} href={COMMERCIAL.demoRequest}>Request a branded demo</a><a className={styles.secondary} href={COMMERCIAL.pilotRequest}>Discuss a paid pilot</a></div>
      <p className={styles.caption}>Tell us about your product, audience and networks. We can start by email; a call is optional.</p>
    </section>
    <CommercialFooter />
  </main>;
}
