import type { Metadata } from "next";
import { CommercialNav, CommercialFooter } from "@/components/CommercialNav";
import DemoExperience from "./DemoExperience";
import styles from "../business/business.module.css";

export const metadata: Metadata = {
  title: "Interactive Product Demo for Teams",
  description: "Explore Swap Assistant with sample quotes and a sample wallet. No real transactions, wallet connection or funds required.",
  alternates: { canonical: "/demo" }, robots: { index: false, follow: true }
};

export default function DemoPage() {
  return <main className={styles.page}><CommercialNav active="demo" /><DemoExperience /><CommercialFooter /></main>;
}
