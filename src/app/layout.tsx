import type { Metadata, Viewport } from "next";
import { PwaClient } from "@/components/PwaClient";
import "./globals.css";

const siteUrl = getSiteUrl();
const title = "The Wallet";
const description = "Your Personal Swap Aggregator. Get the best price for your swaps.";
const ogImage = "/og-image.svg";

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
        url: ogImage,
        width: 1200,
        height: 630,
        alt: title
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage]
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
  manifest: "/manifest.webmanifest",
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
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    url: siteUrl.toString(),
    description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD"
    }
  };

  return (
    <html lang="en-US">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <PwaClient />
        {children}
      </body>
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
