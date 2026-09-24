import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/backend/", "/admin/", "/offline"]
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString()
  };
}
