export const envPublic = {
  ALLOWED_CHAIN_IDS: process.env.NEXT_PUBLIC_ALLOWED_CHAIN_IDS ?? "11155111",
  DISALLOW_MAINNET: (process.env.NEXT_PUBLIC_DISALLOW_MAINNET ?? "true") === "true"
};
