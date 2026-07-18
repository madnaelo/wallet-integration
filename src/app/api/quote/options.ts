import { NextRequest, NextResponse } from "next/server";

import { applyCorsHeaders, evaluateRequestOrigin } from "@/lib/server/requestOrigin";

export function OPTIONS(req: NextRequest) {
  const originDecision = evaluateRequestOrigin(req);
  if (!originDecision.allowed) {
    return NextResponse.json({ error: "This request cannot be completed from this site." }, { status: 403 });
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "3600"
    }
  });
  applyCorsHeaders(response.headers, originDecision.responseOrigin);
  return response;
}
