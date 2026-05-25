import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Wallet",
    short_name: "The Wallet",
    description: "Your Personal Swap Aggregator. Get the best price for your swaps.",
    start_url: "/",
    display: "standalone",
    background_color: "#101827",
    theme_color: "#101827",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        src: "/apple-touch-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml"
      }
    ]
  };
}
