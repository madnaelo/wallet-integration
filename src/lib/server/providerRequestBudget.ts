import { env } from "@/lib/server/env";
import { rateLimitMany } from "@/lib/server/rateLimit";

export async function acquireLifiRequestBudget(): Promise<void> {
  const decision = await rateLimitMany(["provider-budget:lifi"], {
    maxRequests: env.LIFI_REQUEST_BUDGET_MAX,
    windowMs: env.LIFI_REQUEST_BUDGET_WINDOW_MS
  });
  if (decision.unavailable) {
    throw providerBudgetError("LI.FI request protection is temporarily unavailable.", 503);
  }
  if (!decision.allowed) {
    throw providerBudgetError("LI.FI request capacity is temporarily busy.", 429);
  }
}

function providerBudgetError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}
