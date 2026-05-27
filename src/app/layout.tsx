import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = getSiteUrl();
const title = "The Wallet";
const description = "Your Personal Swap Aggregator. Get the best price for your swaps.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: title,
  title: {
    default: title,
    template: `%s | ${title}`
  },
  description,
  keywords: [
    "crypto swap",
    "swap aggregator",
    "wallet swap",
    "non-custodial swaps",
    "DeFi aggregator",
    "price alerts"
  ],
  authors: [{ name: title }],
  creator: title,
  publisher: title,
  category: "finance",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    title,
    siteName: title,
    description,
    images: [
      {
        url: "/apple-touch-icon.svg",
        width: 180,
        height: 180,
        alt: title
      }
    ]
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/apple-touch-icon.svg"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#101827"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}

function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://thewallet.app";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://thewallet.app");
  }
}
