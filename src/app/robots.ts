import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString()
  };
}

function getBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://swapassistant.app";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://swapassistant.app");
  }
}
