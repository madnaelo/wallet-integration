import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RadarView } from "./RadarView";
import { syntheticRadar } from "@/lib/marketRadarDemo";
import RadarExperience from "@/app/market-radar/RadarExperience";

it("renders supply and demand ranges, score interpretation and evidence", () => {
  const html = renderToStaticMarkup(
    <RadarView snapshot={syntheticRadar(0)} synthetic />,
  );
  expect(html).toContain("128.7 USDT");
  expect(html).toContain("112.2 USDT");
  expect(html).toContain("7h 18m");
  expect(html).toContain("not a probability");
  expect(html).toContain("Why this zone?");
  expect(html).toContain("Illustrative, synthetic data");
});
it("shows consumption and weakening without a trade recommendation", () => {
  const html = renderToStaticMarkup(
    <RadarView snapshot={syntheticRadar(2)} synthetic />,
  );
  expect(html).toContain("Weakening");
  expect(html).toContain("Liquidity being consumed");
  expect(html).not.toMatch(/SELL NOW|BUY NOW|guaranteed profit/i);
});
it("never displays stale or insufficient zones as current", () => {
  const snapshot = syntheticRadar(0);
  snapshot.coverage = "INSUFFICIENT_DATA";
  expect(
    renderToStaticMarkup(<RadarView snapshot={snapshot} synthetic />),
  ).not.toContain("Next Supply Zone");
  snapshot.freshness = "STALE";
  expect(
    renderToStaticMarkup(<RadarView snapshot={snapshot} synthetic />),
  ).toContain("Live market intelligence temporarily unavailable");
});
it("the commercial page is a clear unavailable state, not a fabricated live preview", () => {
  const html = renderToStaticMarkup(<RadarExperience liveEnabled={false} />);
  expect(html).toContain("Live market coverage is not enabled yet");
  expect(html).toContain("/demo#market-radar");
  expect(html).not.toContain("128.7");
});
