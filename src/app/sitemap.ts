import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import { buyerPages, guidePages } from "@/lib/growthContent";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  // A deployment timestamp is not a page modification date. Omit lastmod until
  // significant content changes can be tracked accurately for each URL.

  return [
    ...[...buyerPages, ...guidePages].map(page => ({ url: new URL(page.path, baseUrl).toString(),
      changeFrequency: "monthly" as const, priority: 0.7 })),
    {
      url: new URL("/guides", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.7
    },
    {
      url: new URL("/market-radar", baseUrl).toString(),
      changeFrequency: "weekly",
      priority: 0.7
    },
    {
      url: new URL("/business", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.8
    },
    {
      url: new URL("/", baseUrl).toString(),
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: new URL("/swap", baseUrl).toString(),
      changeFrequency: "daily",
      priority: 0.9
    },
    {
      url: new URL("/fees", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.6
    },
    {
      url: new URL("/limit-orders", baseUrl).toString(),
      changeFrequency: "weekly",
      priority: 0.6
    },
    {
      url: new URL("/terms", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.5
    },
    {
      url: new URL("/privacy", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.5
    },
    {
      url: new URL("/contact", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.4
    }
  ];
}
