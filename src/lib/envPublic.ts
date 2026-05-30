export const envPublic = {
  ALLOWED_CHAIN_IDS: process.env.NEXT_PUBLIC_ALLOWED_CHAIN_IDS ?? "11155111",
  DISALLOW_MAINNET: (process.env.NEXT_PUBLIC_DISALLOW_MAINNET ?? "true") === "true",
  BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:8080",
  WALLETCONNECT_PROJECT_ID: (
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
    process.env.NEXT_PUBLIC_WALLETCONNECT_ID ??
    ""
  ).trim(),
  APP_VERSION: (
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    "local"
  ).trim(),
  VAPID_PUBLIC_KEY: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim()
};
