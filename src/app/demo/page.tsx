import type { Metadata } from "next";
import { CommercialNav, CommercialFooter } from "@/components/CommercialNav";
import DemoExperience from "./DemoExperience";
import styles from "../business/business.module.css";
import { attributedLink, attributionFromUrl } from "@/lib/growth";
import { COMMERCIAL } from "@/lib/commercial";

export const metadata: Metadata = {
  title: "Interactive Product Demo for Teams",
  description: "Explore Swap Assistant with sample quotes and a sample wallet. No real transactions, wallet connection or funds required.",
  alternates: { canonical: "/demo" }, robots: { index: false, follow: true }
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Pass sanitized campaign context through links only. The demo never sends analytics or stores it.
  const params = await searchParams;
  const url = new URL("https://example.invalid/demo");
  for (const name of ["landing", "referrer", "utm_source", "utm_medium", "utm_campaign"]) {
    const value = params[name];
    if (typeof value === "string" && value.length <= 100) url.searchParams.set(name, value);
  }
  const contactHref = attributedLink(COMMERCIAL.demoRequest, attributionFromUrl(url));
  return <main className={styles.page}><CommercialNav active="demo" contactHref={contactHref} /><DemoExperience contactHref={contactHref} /><CommercialFooter contactHref={contactHref} /></main>;
}
