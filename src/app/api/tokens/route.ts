import { NextRequest, NextResponse } from "next/server";
import { isSwapChainAllowed } from "@/lib/chains";
import { getClientIp } from "@/lib/server/ip";
import { rateLimit } from "@/lib/server/rateLimit";
import { getTokensForChain } from "@/lib/server/tokenRegistry";
import { evaluateRequestOrigin } from "@/lib/server/requestOrigin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!evaluateRequestOrigin(req).allowed) {
    return NextResponse.json({ error: "This request cannot be completed from this site." }, { status: 403 });
  }

  const rl = await rateLimit(`tokens:${getClientIp(req) ?? "unknown"}`);
  if (rl.unavailable) {
    return NextResponse.json(
      { error: "Token search is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Token search is being refreshed too quickly. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const chainIdValue = new URL(req.url).searchParams.get("chainId") ?? "";
  if (!/^\d+$/.test(chainIdValue)) {
    return NextResponse.json({ error: "Choose a valid network." }, { status: 400 });
  }

  const chainId = Number(chainIdValue);
  if (!Number.isSafeInteger(chainId) || !isSwapChainAllowed(chainId)) {
    return NextResponse.json(
      { error: "This network is not supported yet." },
      { status: 400 }
    );
  }

  const tokens = await getTokensForChain(chainId);
  return NextResponse.json(
    { tokens },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
      }
    }
  );
}
