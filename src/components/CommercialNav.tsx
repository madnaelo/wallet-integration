import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { COMMERCIAL } from "@/lib/commercial";
import styles from "@/app/business/business.module.css";

export function CommercialNav({ active }: { active: "business" | "demo" }) {
  return <header className={styles.nav}>
    <a className={styles.wordmark} href={COMMERCIAL.businessPath}>
      <Image src={BRAND.icon} alt="" width={30} height={30} />{BRAND.name}<span>for teams</span>
    </a>
    <nav aria-label="Business navigation">
      <a href={COMMERCIAL.businessPath} aria-current={active === "business" ? "page" : undefined}>For teams</a>
      <a href={COMMERCIAL.demoPath} aria-current={active === "demo" ? "page" : undefined}>Interactive demo</a>
      <a href={COMMERCIAL.demoRequest}>Get in touch</a>
    </nav>
  </header>;
}

export function CommercialFooter() {
  return <footer className={styles.footer}>
    <p>{BRAND.name} / Licensed software, separately scoped integration.</p>
    <nav aria-label="Business footer"><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    <small>Provider availability and operator permissions must be reviewed for each deployment. This demonstration is not regulatory clearance.</small>
  </footer>;
}
