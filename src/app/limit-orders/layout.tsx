import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Limit Orders",
  description:
    "Create non-custodial crypto limit orders with exact wallet-signed terms for supported EVM token pairs.",
  alternates: {
    canonical: "/limit-orders"
  }
};

export default function LimitOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
