import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { commercialRadarEnabled } from "@/market-radar/policy";
import RadarExperience from "./RadarExperience";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Market Radar: Observed Supply & Demand",
  description:
    "Explore visible market liquidity, supply and demand zones, wall persistence and absorption. Market intelligence, not guaranteed predictions or automatic trading.",
  alternates: { canonical: "/market-radar" },
  openGraph: { title: "Market Radar | Swap Assistant", url: "/market-radar" },
};

export default function MarketRadarPage() {
  return (
    <main className={`container ${styles.page}`}>
      <header className="header">
        <div className="headerTop">
          <div className={styles.brand}>
            <Image src={BRAND.icon} width={36} height={36} alt="" />
            <div>
              <Link href="/">{BRAND.name}</Link>
              <p>Market intelligence. Your decision.</p>
            </div>
          </div>
        </div>
        <nav className="appNav" aria-label="Main navigation">
          <ul className="appMenu">
            <li>
              <Link className="appMenuLink" href="/">
                Intro
              </Link>
            </li>
            <li>
              <Link className="appMenuLink" href="/swap">
                Swap
              </Link>
            </li>
            <li>
              <Link
                className="appMenuLink appMenuLinkActive"
                href="/market-radar"
                aria-current="page"
              >
                Market Radar
              </Link>
            </li>
            <li>
              <Link className="appMenuLink" href="/swap#favorites">
                Favorites
              </Link>
            </li>
            <li>
              <Link className="appMenuLink" href="/limit-orders">
                Limit Orders
              </Link>
            </li>
            <li>
              <Link className="appMenuLink" href="/swap#preferences">
                Preferences
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <section className={styles.heading}>
        <h1>Market Radar</h1>
        <p>
          Where is visible buying and selling liquidity concentrated, and is it
          surviving as price approaches?
        </p>
      </section>
      <RadarExperience liveEnabled={commercialRadarEnabled(process.env)} />
      <footer className={styles.footer}>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/business">For teams</Link>
        <Link href="/admin/market-radar">Internal workspace</Link>
      </footer>
    </main>
  );
}
