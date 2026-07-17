import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Limit Orders",
  description:
    "Create non-custodial crypto limit orders with exact wallet-signed terms for supported EVM token pairs.",
  alternates: {
    canonical: "/limit-orders"
  },
  openGraph: {
    title: "Non-Custodial Crypto Limit Orders",
    description:
      "Create wallet-signed limit orders whose tokens, amounts, recipient, and expiry cannot be changed after signing.",
    url: "/limit-orders"
  }
};

export default function LimitOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
