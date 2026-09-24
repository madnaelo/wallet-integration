import { createHash } from "node:crypto";
import { pairKey, type LiquidityZone, type MarketRadarSnapshot } from "./types";

export const RADAR_ALERT_TYPES = [
  "SUPPLY_APPROACHED",
  "DEMAND_APPROACHED",
  "ZONE_STRENGTHENED",
  "ZONE_WEAKENED",
  "ZONE_BROKEN",
  "BUYER_ABSORPTION_INCREASED",
  "SELLER_ABSORPTION_INCREASED",
] as const;
export type RadarAlertType = (typeof RADAR_ALERT_TYPES)[number];
export interface RadarEvent {
  id: string;
  pairKey: string;
  observedAt: number;
  type: RadarAlertType;
  zone: LiquidityZone;
  referencePrice: number;
  scoringVersion: string;
  previousStrength: number;
}
export function detectEvents(
  previous: MarketRadarSnapshot | undefined,
  current: MarketRadarSnapshot,
): RadarEvent[] {
  if (
    !previous ||
    current.freshness !== "LIVE" ||
    current.coverage === "INSUFFICIENT_DATA" ||
    current.referencePrice === null
  )
    return [];
  const old = new Map(
    [
      ...previous.supplyZones,
      ...previous.demandZones,
      ...previous.previousZones,
    ].map((z) => [z.id, z]),
  );
  const events: RadarEvent[] = [];
  for (const zone of [
    ...current.supplyZones,
    ...current.demandZones,
    ...current.previousZones,
  ]) {
    const before = old.get(zone.id);
    if (!before) continue;
    const types: RadarAlertType[] = [];
    if (
      ["UNDER_TEST", "ABSORBING"].includes(zone.lifecycle) &&
      !["UNDER_TEST", "ABSORBING"].includes(before.lifecycle)
    )
      types.push(
        zone.type === "SUPPLY" ? "SUPPLY_APPROACHED" : "DEMAND_APPROACHED",
      );
    if (zone.strength - before.strength >= 8) types.push("ZONE_STRENGTHENED");
    if (
      before.strength - zone.strength >= 8 ||
      (zone.lifecycle === "WEAKENING" && before.lifecycle !== "WEAKENING")
    )
      types.push("ZONE_WEAKENED");
    if (zone.lifecycle === "BROKEN" && before.lifecycle !== "BROKEN")
      types.push("ZONE_BROKEN");
    if (
      zone.absorption === "BEING_CONSUMED" &&
      before.absorption !== "BEING_CONSUMED"
    )
      types.push(
        zone.type === "SUPPLY"
          ? "BUYER_ABSORPTION_INCREASED"
          : "SELLER_ABSORPTION_INCREASED",
      );
    for (const type of types) {
      const id = createHash("sha256")
        .update(
          `${zone.id}/${type}/${current.observedAt}/${current.scoringVersion}`,
        )
        .digest("hex");
      events.push({
        id,
        pairKey: pairKey(current.instrument),
        observedAt: current.observedAt,
        type,
        zone,
        referencePrice: current.referencePrice,
        scoringVersion: current.scoringVersion,
        previousStrength: before.strength,
      });
    }
  }
  return events;
}
