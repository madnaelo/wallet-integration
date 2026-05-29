import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fees & Risks",
  description: "Fee, quote, execution, and alert disclosures for Swap Assistant."
};

export default function FeesPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <h1>Fees & Risks</h1>
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
            Swap Assistant may receive an integrator, affiliate, or platform fee
            from supported swap providers. Where possible, this fee is included
            in the provider quote and sent to a configured treasury address by
            the provider or protocol route.
          </p>
          <p>
            Some providers use their own revenue split or payout process. The
            exact fee behavior can vary by provider, chain, token, route, and
            provider account configuration.
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
