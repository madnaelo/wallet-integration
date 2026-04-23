import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swap Aggregator MVP",
  description: "Non-custodial swap aggregator MVP using 0x + MetaMask"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}
