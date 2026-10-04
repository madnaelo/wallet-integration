import Image from "next/image";
import type { Metadata } from "next";
import { CommercialFooter, CommercialNav } from "@/components/CommercialNav";
import { GrowthTracker } from "@/components/GrowthTracker";
import { BRAND } from "@/lib/brand";
import { guidePages } from "@/lib/growthContent";
import { getSiteUrl } from "@/lib/siteUrl";
import styles from "@/app/business/business.module.css";

const title = "Crypto Swap Integration Guides";
const description = "Compare building and licensing swap software, plan a wallet integration, and understand non-custodial architecture, fee evidence and deployment responsibilities.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/guides" },
  openGraph: { title, description, url: "/guides", images: [BRAND.socialImage] },
  twitter: { card: "summary_large_image", title, description, images: [BRAND.socialImage] },
  robots: { index: true, follow: true }
};

export default function GuidesPage() {
  // Full navigations preserve the demo's separate CSP and dependency boundary.
  const base = getSiteUrl();
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: new URL("/guides", base).href,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: guidePages.map((guide, index) => ({
        "@type": "ListItem", position: index + 1, name: guide.h1, url: new URL(guide.path, base).href
      }))
    }
  };

  return <main className={styles.page}>
    <GrowthTracker />
    <CommercialNav active="guides" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <header className={`${styles.band} ${styles.introduction}`}>
      <nav aria-label="Breadcrumb"><a href="/business">For teams</a><span aria-hidden="true"> / </span><span>Guides</span></nav>
      <p className={styles.eyebrow}>For product and engineering teams</p>
      <h1>{title}</h1>
      <p className={styles.lead}>Decide what to build, what to license, and what to verify before adding swaps to your product.</p>
      <p>Start with the delivery comparison, work through the wallet acceptance checks, then inspect the architecture and trust boundaries. These guides explain the existing software and its limits, not a promise that every asset or route is supported.</p>
    </header>
    <section className={`${styles.band} ${styles.guideList}`} aria-labelledby="guides-title">
      <h2 id="guides-title">Choose your starting point</h2>
      <ol>
        {guidePages.map(guide => <li key={guide.path}>
          <article>
            <h3><a href={guide.path}>{guide.h1}</a></h3>
            <p>{guide.description}</p>
            <p className={styles.caption}>{guide.audience}</p>
          </article>
        </li>)}
      </ol>
    </section>
    <section className={styles.band} aria-labelledby="see-workflow">
      <h2 id="see-workflow">See the workflow before discussing integration</h2>
      <p>The interactive demo uses synthetic values. No wallet, funds or signup is required. Provider access, data rights and operating permissions must be reviewed separately for each deployment.</p>
      <a href="/demo" className={styles.productImage}><Image src="/business-demo.png" alt="Synthetic Swap Assistant demo with token selection and route comparison" width={1440} height={1000} sizes="(max-width: 760px) 100vw, 1116px" /></a>
      <div className={styles.actions}><a className={styles.primary} href="/demo">Explore the synthetic demo</a><a className={styles.secondary} href="/crypto-swap-integration">Review integration scope</a></div>
    </section>
    <CommercialFooter />
  </main>;
}
