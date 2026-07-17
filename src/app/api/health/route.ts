import { NextResponse } from "next/server";

import { envPublic } from "@/lib/envPublic";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "swap-assistant-frontend",
      checkedAt: new Date().toISOString(),
      build: {
        commit: envPublic.APP_VERSION,
        committedAt: envPublic.COMMIT_TIMESTAMP
      }
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
