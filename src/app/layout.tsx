import type { Metadata } from "next";
import "./globals.css";
import { AppKitProvider } from "@/context/appkit";

export const metadata: Metadata = {
  title: "The Wallet",
  description: "Your Personal Swap Aggregator. Get the best price for your swaps.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>
        <AppKitProvider>{children}</AppKitProvider>
      </body>
    </html>
  );
}
