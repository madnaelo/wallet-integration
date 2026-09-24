import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/siteUrl";
import type { Metadata, Viewport } from "next";
import { PwaClient } from "@/components/PwaClient";
import "./globals.css";

const siteUrl = getSiteUrl();
const title = BRAND.name;
const description = "Compare available crypto swap quotes, set price alerts, and create non-custodial limit orders while your wallet stays in control.";
const ogImage = BRAND.socialImage;

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
      { url: BRAND.assetsBase + "/favicon.ico", sizes: "any" },
      { url: BRAND.assetsBase + "/favicon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: BRAND.assetsBase + "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
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
    featureList: [
      "Compare non-custodial swap quotes",
      "Create wallet-signed limit orders",
      "Set price and reverse-swap alerts",
      "Receive Telegram and push notifications"
    ]
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
