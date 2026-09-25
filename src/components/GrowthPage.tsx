import Image from "next/image";
import { CommercialNav, CommercialFooter } from "./CommercialNav";
import { GrowthTracker } from "./GrowthTracker";
import { COMMERCIAL } from "@/lib/commercial";
import { getSiteUrl } from "@/lib/siteUrl";
import { BRAND } from "@/lib/brand";
import type { GrowthPage as PageContent } from "@/lib/growthContent";
import type { Metadata } from "next";
import styles from "@/app/business/business.module.css";

// Full navigations apply each destination's CSP and preserve the isolated demo boundary.

export function growthMetadata(page: PageContent): Metadata {
  return { title: page.title, description: page.description, alternates: { canonical: page.path },
    openGraph: { title: page.h1, description: page.description, url: page.path, images: [BRAND.socialImage] },
    twitter: { card: "summary_large_image", title: page.h1, description: page.description, images: [BRAND.socialImage] },
    robots: { index: true, follow: true } };
}
export function GrowthPage({ page, guide = false }: { page: PageContent; guide?: boolean }) {
  const base = getSiteUrl();
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "For teams", item: new URL("/business", base).href },
      { "@type": "ListItem", position: 2, name: page.h1, item: new URL(page.path, base).href }
    ] },
    { "@type": "FAQPage", mainEntity: page.faq.map(([question, answer]) => ({ "@type": "Question", name: question,
      acceptedAnswer: { "@type": "Answer", text: answer } })) }
  ] };
  return <main className={styles.page}>
    <GrowthTracker /><CommercialNav />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <header className={`${styles.band} ${styles.introduction}`}>
      <nav aria-label="Breadcrumb"><a href="/business">For teams</a><span aria-hidden="true"> / </span><span>{guide ? "Guide" : "Solutions"}</span></nav>
      <p className={styles.eyebrow}>{page.audience}</p><h1>{page.h1}</h1><p className={styles.lead}>{page.intro}</p>
      {page.reviewedOn && <p className={styles.caption}>Reviewed <time dateTime={page.reviewedOn}>{page.reviewedOn}</time></p>}
      <div className={styles.actions}><a className={styles.primary} href={COMMERCIAL.demoPath}>See the demo</a><a className={styles.secondary} href={COMMERCIAL.demoRequest}>Request a branded demo</a></div>
      <p className={styles.caption}>No signup, wallet, funds or call required to evaluate.</p>
    </header>
    {!guide && <figure className={`${styles.band} ${styles.evidenceImage}`}>
      <a href="/demo"><Image src="/business-demo.png" alt="Synthetic Swap Assistant demo: token selection, route comparison and transaction review" width={1440} height={1000} sizes="(max-width: 760px) 100vw, 900px" /></a>
      <figcaption>Actual application demonstration with illustrative sample values. No real funds or transaction.</figcaption>
    </figure>}
    <article className={guide ? styles.reading : undefined}>
      {page.comparison && <section className={styles.band} aria-label="Delivery comparison">
        <div className={styles.comparison} role="region" aria-label={page.comparison.caption} tabIndex={0}>
          <table><caption>{page.comparison.caption}</caption><thead><tr>{page.comparison.headers.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
            <tbody>{page.comparison.rows.map(row => <tr key={row[0]}>{row.map((cell, i) => i === 0 ? <th scope="row" key={i}>{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>}
      {page.sections.map((section, i) => <section className={styles.band} key={section.title} aria-labelledby={`section-${i}`}>
        <h2 id={`section-${i}`}>{section.title}</h2>{section.paragraphs.map(p => <p key={p}>{p}</p>)}
        {section.items && <ul className={styles.checklist}>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>)}
      <section className={styles.band} aria-labelledby="faq-title"><h2 id="faq-title">Questions before a pilot</h2>
        {page.faq.map(([question, answer]) => <details className={styles.faq} key={question}><summary>{question}</summary><p>{answer}</p></details>)}
      </section>
      {page.sources && <section className={styles.band} aria-labelledby="sources-title"><h2 id="sources-title">Further technical reading</h2>
        <p>Official references for integration responsibilities. These links are not endorsements, and do not imply that every referenced provider is enabled in Swap Assistant.</p>
        <ul className={styles.checklist}>{page.sources.map(([url, label]) => <li key={url}><a href={url} rel="noreferrer">{label}</a></li>)}</ul>
      </section>}
    </article>
    <section className={`${styles.band} ${styles.pilot}`} aria-labelledby="next-step"><h2 id="next-step">Check the fit for your product.</h2>
      <p>Tell us your product, audience and required networks. We will review existing capabilities and scope the integration before proposing a paid pilot. Start by email; no signup or call is required.</p>
      <p className={styles.caption}>Provider approvals, operating permissions and infrastructure remain the operator&apos;s responsibility.</p>
      <div className={styles.actions}><a className={styles.primary} href={COMMERCIAL.demoRequest}>Request a branded demo</a><a className={styles.secondary} href={COMMERCIAL.pilotRequest}>Discuss a paid pilot</a></div>
    </section>
    <nav className={styles.band} aria-label="Related reading"><h2>Explore further</h2><ul className={styles.checklist}>{page.related.map(([path, label]) => <li key={path}><a href={path}>{label}</a></li>)}</ul></nav>
    <CommercialFooter />
  </main>;
}
