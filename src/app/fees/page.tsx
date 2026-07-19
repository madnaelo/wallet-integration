import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fees & Risks",
  description: "Fee, quote, execution, and alert disclosures for Swap Assistant.",
  alternates: {
    canonical: "/fees"
  },
  openGraph: {
    title: "Swap Fees & Risks",
    description: "Understand platform fees, provider fees, network costs, price impact, and execution risks.",
    url: "/fees"
  }
};

export default function FeesPage() {
  const platformFeePercent = configuredPlatformFeePercent();

  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <h1>Fees & Risks</h1>
        <p>Effective July 19, 2026.</p>
        <p>
          Swap Assistant is a non-custodial swap assistant. Your wallet signs and
          submits transactions. Swap Assistant does not hold private keys, seed
          phrases, or user funds.
        </p>

        <section>
          <h2>Swap Costs</h2>
          <p>
            A swap can include provider fees, platform or integrator fees,
            network gas, and price impact. The trade summary shows the quote
            data returned by the selected provider when that data is available.
          </p>
          <p>
            Network gas is paid to the blockchain network and is separate from
            platform or provider fees. Final execution can differ from the
            displayed estimate because liquidity, gas, and block timing can
            change before your wallet submits the transaction.
          </p>
        </section>

        <section>
          <h2>Platform Fees</h2>
          <p>
            Swap Assistant currently configures a platform fee of up to{" "}
            <strong>{platformFeePercent}%</strong> on swap routes that support
            integrator fees. The quote includes this fee before you choose a
            route, and the trade summary shows it when the provider returns a
            fee breakdown.
          </p>
          <p>
            A route that cannot apply the configured fee should not charge it.
            Providers can also charge their own separate service fee or use
            their own revenue split and payout process. Exact behavior varies
            by provider, chain, token, route, and provider account.
          </p>
          <p>
            Swap Assistant can receive different compensation from different
            providers. Quotes are ranked by the receiving amount returned for
            the user after disclosed service fees, not by the compensation Swap
            Assistant expects to receive. You can review and choose another
            available route before approving a transaction.
          </p>
          <p>
            Signed limit orders use third-party order protocols and do not
            currently add this swap platform fee unless a fee is explicitly
            displayed before signing.
          </p>
        </section>

        <section>
          <h2>Price And Route Risk</h2>
          <p>
            A displayed quote is temporary. Price impact, slippage, transfer
            taxes, token restrictions, bridge behavior, and changing liquidity
            can reduce what is received or prevent execution. A token name or
            symbol does not prove that its contract address is genuine.
          </p>
        </section>

        <section>
          <h2>Alerts</h2>
          <p>
            Favorite-pair, reverse-profit, and loss-protection alerts are
            informational estimates. They are not financial advice, not a
            guarantee of available liquidity, and not a guarantee that a future
            swap will execute at the shown price.
          </p>
        </section>

        <section>
          <h2>User Responsibility</h2>
          <p>
            Before signing, review the wallet confirmation, token, chain,
            recipient, amount, gas, slippage, and receiving amount. Do not sign
            a transaction that looks unexpected.
          </p>
        </section>
      </div>
    </main>
  );
}

function configuredPlatformFeePercent(): string {
  const parsed = Number(process.env.PLATFORM_FEE_BPS ?? "20");
  const basisPoints = Number.isFinite(parsed) && parsed >= 0 && parsed <= 300 ? parsed : 20;
  return String(basisPoints / 100).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
