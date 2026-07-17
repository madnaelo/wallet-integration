import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const lastModified = getCommitDate();

  return [
    {
      url: new URL("/", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: new URL("/swap", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "daily",
      priority: 0.9
    },
    {
      url: new URL("/fees", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly",
      priority: 0.6
    },
    {
      url: new URL("/limit-orders", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.6
    },
    {
      url: new URL("/terms", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly",
      priority: 0.5
    },
    {
      url: new URL("/privacy", baseUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "monthly",
      priority: 0.5
    }
  ];
}

function getCommitDate(): Date | undefined {
  const raw = process.env.NEXT_PUBLIC_COMMIT_TIMESTAMP?.trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://swapassistant.app";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://swapassistant.app");
  }
}
