import { NextResponse } from "next/server";

import { envPublic } from "@/lib/envPublic";
import { getRateLimitReadiness } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export function GET() {
  const rateLimit = getRateLimitReadiness();
  return NextResponse.json(
    {
      status: rateLimit.ready ? "ok" : "degraded",
      service: "swap-assistant-frontend",
      checkedAt: new Date().toISOString(),
      dependencies: {
        rateLimit
      },
      build: {
        commit: envPublic.APP_VERSION,
        committedAt: envPublic.COMMIT_TIMESTAMP
      }
    },
    {
      status: rateLimit.ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
