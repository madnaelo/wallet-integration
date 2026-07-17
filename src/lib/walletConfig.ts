const rawProjectId = (
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID ??
  ""
).trim();

export const WALLETCONNECT_PROJECT_ID = rawProjectId;
export const isAppKitConfigured = Boolean(rawProjectId) && !/^your[_-]/i.test(rawProjectId);
