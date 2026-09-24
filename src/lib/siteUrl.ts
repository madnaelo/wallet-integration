export function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://getswapradar.xyz";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://getswapradar.xyz");
  }
}
