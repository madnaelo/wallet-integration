import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swap Assistant",
    short_name: "Swap Assistant",
    description: "Your Personal Swap Assistant. Get the best price for your swaps.",
    id: "/swap",
    start_url: "/swap",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#101827",
    theme_color: "#101827",
    categories: ["finance", "productivity", "utilities"],
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/apple-touch-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "any"
      }
    ],
    shortcuts: [
      {
        name: "Open Swap",
        short_name: "Swap",
        description: "Open the swap screen.",
        url: "/swap"
      },
      {
        name: "Favorite Pairs",
        short_name: "Favorites",
        description: "Review saved token-pair alerts.",
        url: "/swap#favorites"
      }
    ]
  };
}
