import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const now = new Date();

  return [
    {
      url: new URL("/", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: new URL("/swap", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9
    },
    {
      url: new URL("/fees", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6
    },
    {
      url: new URL("/terms", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5
    },
    {
      url: new URL("/privacy", baseUrl).toString(),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5
    }
  ];
}

function getBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://thewallet.app";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://thewallet.app");
  }
}
