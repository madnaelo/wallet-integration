import type { Venue } from "./types";

export const DATA_RIGHTS_REVIEWED_AT = "2026-09-24";
export const DATA_RIGHTS: Record<
  Venue,
  { commercial: boolean; research: boolean; decision: string; source: string }
> = {
  binance: {
    commercial: false,
    research: true,
    decision: "REQUIRES WRITTEN PERMISSION",
    source: "https://www.binance.com/en/terms",
  },
  bybit: {
    commercial: false,
    research: false,
    decision: "REQUIRES WRITTEN PERMISSION",
    source: "https://www.bybit.com/en/help-center/article/API-Terms",
  },
  okx: {
    commercial: false,
    research: false,
    decision: "REQUIRES WRITTEN PERMISSION",
    source: "https://www.okx.com/help/okx-api-agreement",
  },
};

// A runtime environment flag cannot grant legal rights. Changes require a reviewed source record.
export function permittedVenues(
  mode: "research" | "commercial",
  requested: Venue[],
): Venue[] {
  return requested.filter((venue) => DATA_RIGHTS[venue][mode]);
}
export function commercialRadarEnabled(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.MARKET_RADAR_LIVE_ENABLED === "true" &&
    Object.values(DATA_RIGHTS).some((right) => right.commercial)
  );
}
