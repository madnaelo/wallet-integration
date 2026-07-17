import type { Metadata } from "next";

const title = "Compare Crypto Swap Quotes";
const description =
  "Compare available crypto swap routes, review fees and minimum received, and approve the selected transaction in your own wallet.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/swap"
  },
  openGraph: {
    title,
    description,
    url: "/swap"
  }
};

export default function SwapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
