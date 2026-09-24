import type { PredictionAudit, PriceObservation, SignalOutcome } from "./types";

// Outcomes describe only observed samples. Missing coverage is not counted as a failed or successful signal.
export function calculateOutcome(
  audit: PredictionAudit,
  observations: PriceObservation[],
  now: number,
  maxGapMs = 30000,
): SignalOutcome {
  const start = audit.snapshot.observedAt;
  const contactDeadline = start + audit.horizonMs;
  const contact = observations
    .filter(
      (p) =>
        p.at >= start &&
        p.at <= Math.min(now, contactDeadline) &&
        Number.isFinite(p.price) &&
        p.price >= audit.zone.lower &&
        p.price <= audit.zone.upper,
    )
    .sort((a, b) => a.at - b.at)[0];
  // Give a late contact its full evaluation window, not an abbreviated negative result.
  const end = contact ? contact.at + audit.horizonMs : contactDeadline;
  const result: SignalOutcome = {
    evaluationEndAt: end,
    windowAnchor: contact ? "FIRST_CONTACT" : "SIGNAL",
    status: now < end ? "PENDING" : "INCOMPLETE_DATA",
    horizonMs: audit.horizonMs,
    entered: null,
    firstContactAt: null,
    brokeAt: null,
    weakenedBeforeBreak: null,
    maxPenetrationBps: null,
    maxReversalAfterContactBps: null,
    maxContinuationAfterBreakBps: null,
    favourableExcursionBps: null,
    adverseExcursionBps: null,
    samples: 0,
    maximumGapMs: 0,
  };
  const points = observations
    .filter(
      (p) =>
        p.at >= start &&
        p.at <= Math.min(now, end) &&
        Number.isFinite(p.price) &&
        p.price > 0,
    )
    .sort((a, b) => a.at - b.at);
  const unique = points.filter((p, i) => !i || p.at !== points[i - 1].at);
  result.samples = unique.length;
  if (now < end) return result;
  let last = start;
  for (const p of unique) {
    result.maximumGapMs = Math.max(result.maximumGapMs, p.at - last);
    last = p.at;
  }
  result.maximumGapMs = Math.max(result.maximumGapMs, end - last);
  if (!unique.length || result.maximumGapMs > maxGapMs) return result;
  result.status = "COMPLETE";
  result.entered = false;
  result.weakenedBeforeBreak = false;
  result.maxPenetrationBps = 0;
  result.maxReversalAfterContactBps = 0;
  result.maxContinuationAfterBreakBps = 0;
  result.favourableExcursionBps = 0;
  result.adverseExcursionBps = 0;
  const zone = audit.zone;
  const supply = zone.type === "SUPPLY";
  const sign = supply ? -1 : 1;
  const reference = audit.snapshot.referencePrice!;
  if (
    !Number.isFinite(reference) ||
    reference <= 0 ||
    zone.lower <= 0 ||
    zone.upper <= zone.lower
  )
    throw new Error("Invalid audit reference");
  let contactPrice = 0;
  let weakened = false;
  for (const p of unique) {
    // A sampled jump over the entire zone proves a break, not an observed contact.
    const reached = p.price >= zone.lower && p.price <= zone.upper;
    if (reached && !result.entered) {
      result.entered = true;
      result.firstContactAt = p.at;
      contactPrice = p.price;
    }
    const broken = supply ? p.price > zone.upper : p.price < zone.lower;
    if (broken && result.brokeAt === null) {
      result.brokeAt = p.at;
      result.weakenedBeforeBreak = weakened;
    }
    // Do not credit a simultaneous weakening label as an advance warning.
    if (p.zoneLifecycle === "WEAKENING") weakened = true;
    if (result.entered) {
      result.maxPenetrationBps = Math.max(
        result.maxPenetrationBps,
        ((-sign * (p.price - (supply ? zone.lower : zone.upper))) /
          (supply ? zone.lower : zone.upper)) *
          10000,
      );
      result.maxReversalAfterContactBps = Math.max(
        result.maxReversalAfterContactBps,
        ((sign * (p.price - contactPrice)) / contactPrice) * 10000,
      );
    }
    if (result.brokeAt !== null)
      result.maxContinuationAfterBreakBps = Math.max(
        result.maxContinuationAfterBreakBps,
        ((-sign * (p.price - (supply ? zone.upper : zone.lower))) /
          (supply ? zone.upper : zone.lower)) *
          10000,
      );
    const move = ((sign * (p.price - reference)) / reference) * 10000;
    result.favourableExcursionBps = Math.max(
      result.favourableExcursionBps,
      move,
    );
    result.adverseExcursionBps = Math.max(result.adverseExcursionBps, -move);
  }
  return result;
}
