import { NextRequest, NextResponse } from "next/server";
import { getAllowedChainIds, isChainAllowed } from "@/lib/chains";
import { getTokensForChain } from "@/lib/server/tokenRegistry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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
