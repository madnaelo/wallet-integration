import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Wallet | Personal Swap Aggregator",
  description:
    "Compare crypto swap routes, review quotes safely, save swap history, and receive price alerts without giving up custody of your wallet.",
  alternates: {
    canonical: "/"
  }
};

const features = [
  {
    title: "Compare swap prices",
    body: "Check available routes before you swap, including expected receive amount, service fee, network cost, and minimum received."
  },
  {
    title: "Save your history",
    body: "Sign a simple message to save and load your past swap previews and submitted swaps for the same wallet."
  },
  {
    title: "Watch favorite pairs",
    body: "Save token pairs with target prices and receive alerts when the market reaches your chosen level."
  },
  {
    title: "Reverse-swap alerts",
    body: "Get notified when a past swap may be worth reviewing in the reverse direction, including loss-protection alerts."
  }
];

const safetyPoints = [
  "Connecting a wallet lets The Wallet read your public wallet address.",
  "Signing in only proves that the wallet is yours, so your history and alerts can be saved for that wallet.",
  "The Wallet never asks for your seed phrase or private key.",
  "The Wallet cannot move your funds. Funds move only after you approve the transaction inside your wallet app.",
  "You can review tokens, amounts, recipient, fees, slippage, and network cost before confirming."
];

export default function IntroPage() {
  return (
    <main className="introPage">
      <section className="introHero" aria-labelledby="intro-title">
        <div className="introHeroMedia" aria-hidden="true">
          <Image
            src="/intro-swap-preview.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="introHeroImage"
          />
        </div>
        <div className="introHeroShade" aria-hidden="true" />
        <div className="introHeroCopy">
          <p className="introEyebrow">Non-custodial swap assistant</p>
          <h1 id="intro-title">The Wallet</h1>
          <p className="introLead">
            Your personal swap aggregator. Compare prices, review costs, save useful history, and receive price alerts
            while staying in control. The Wallet cannot move funds by itself; every swap still needs your approval inside
            your wallet app.
          </p>
          <div className="introActions">
            <Link className="btn btnPrimary introPrimaryAction" href="/swap">
              Open Swap
            </Link>
            <Link className="btn introSecondaryAction" href="/fees">
              Fees & Risks
            </Link>
          </div>
        </div>
      </section>

      <section className="introSafetyBand" aria-labelledby="safety-title">
        <div className="introSectionHeader introSafetyHeader">
          <h2 id="safety-title">Designed For Wallet Safety</h2>
          <p>
            Your wallet stays in control. The Wallet helps you compare and remember, but only your wallet can approve
            movement of funds.
          </p>
        </div>
        <ul className="introSafetyList">
          {safetyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="introSection" aria-labelledby="features-title">
        <div className="introSectionHeader">
          <h2 id="features-title">What The Wallet Helps You Do</h2>
          <p>
            Built for people who want simple swap decisions without handing control to an app.
          </p>
        </div>
        <div className="introFeatureGrid">
          {features.map((feature) => (
            <article className="introFeature" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="introSection introComingSoon" aria-labelledby="coming-soon-title">
        <div>
          <h2 id="coming-soon-title">Coming Soon</h2>
          <p>
            Optional Auto Swap rules will let you set a target price and slippage limit. Even then, the product is being
            designed so wallet approvals remain clear and user-controlled.
          </p>
        </div>
        <Link className="btn" href="/swap#preferences">
          Set Alerts
        </Link>
      </section>
    </main>
  );
}
