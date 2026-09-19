import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  description: BRAND.name + " is offline on this device.",
  robots: {
    index: false,
    follow: false
  }
};

export default function OfflinePage() {
  return (
    <main className="introPage offlinePage">
      <section className="introHero offlineHero">
        <div className="introHeroCopy">
          <p className="introEyebrow">Offline</p>
          <h1>{BRAND.name} needs a connection</h1>
          <p className="introLead">
            Saved screens can open without a network, but live quotes, wallet sign-in, and alerts need internet access.
          </p>
          <div className="introActions">
            <Link className="introPrimaryAction" href="/swap">
              Try Again
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
