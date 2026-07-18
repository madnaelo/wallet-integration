import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swap Assistant",
    short_name: "Swap Assistant",
    description: "Compare available swap prices, set alerts, and keep your wallet in control.",
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
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
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
