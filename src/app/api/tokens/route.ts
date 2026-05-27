import { NextRequest, NextResponse } from "next/server";
import { getAllowedChainIds, isChainAllowed } from "@/lib/chains";
import { getClientIp } from "@/lib/server/ip";
import { rateLimit } from "@/lib/server/rateLimit";
import { getTokensForChain } from "@/lib/server/tokenRegistry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = await rateLimit(`tokens:${getClientIp(req) ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const chainIdValue = new URL(req.url).searchParams.get("chainId") ?? "";
  if (!/^\d+$/.test(chainIdValue)) {
    return NextResponse.json({ error: "Invalid chainId." }, { status: 400 });
  }

  const chainId = Number(chainIdValue);
  if (!isChainAllowed(chainId)) {
    return NextResponse.json(
      { error: `Unsupported chainId. Allowed: ${getAllowedChainIds().join(", ")}` },
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
