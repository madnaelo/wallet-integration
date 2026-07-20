import { Transaction } from "bitcoinjs-lib";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/ip";
import { rateLimitMany } from "@/lib/server/rateLimit";
import { applyCorsHeaders, evaluateRequestOrigin } from "@/lib/server/requestOrigin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 900_000;
const MAX_TRANSACTION_HEX_LENGTH = 800_000;
const BROADCAST_TIMEOUT_MS = 12_000;
const BROADCASTERS = [
  "https://mempool.space/api/tx",
  "https://blockstream.info/api/tx"
] as const;

export async function POST(req: NextRequest) {
  const originDecision = evaluateRequestOrigin(req);
  if (!originDecision.allowed) {
    return withCors(
      NextResponse.json({ error: "This request cannot be completed from this site." }, { status: 403 }),
      originDecision.responseOrigin
    );
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return withCors(NextResponse.json({ error: "The signed transaction is too large." }, { status: 413 }), originDecision.responseOrigin);
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return withCors(NextResponse.json({ error: "The signed transaction is too large." }, { status: 413 }), originDecision.responseOrigin);
  }

  const payload = parsePayload(text);
  if (!payload) {
    return withCors(NextResponse.json({ error: "The signed transaction is invalid." }, { status: 400 }), originDecision.responseOrigin);
  }

  let transaction: Transaction;
  try {
    transaction = Transaction.fromHex(payload.rawTransaction);
  } catch {
    return withCors(NextResponse.json({ error: "The signed transaction is unreadable." }, { status: 400 }), originDecision.responseOrigin);
  }
  const transactionId = transaction.getId();
  if (transactionId !== payload.transactionId || transaction.ins.length < 1 || transaction.outs.length < 1) {
    return withCors(NextResponse.json({ error: "The signed transaction did not pass its safety check." }, { status: 400 }), originDecision.responseOrigin);
  }

  const ip = getClientIp(req) ?? "unknown";
  const limit = await rateLimitMany([
    `bitcoin-broadcast-ip:${ip}`,
    `bitcoin-broadcast-tx:${transactionId}`
  ]);
  if (limit.unavailable) {
    return withCors(NextResponse.json({ error: "Bitcoin broadcast is temporarily unavailable." }, { status: 503 }), originDecision.responseOrigin);
  }
  if (!limit.allowed) {
    return withCors(
      NextResponse.json(
        { error: "This transaction was submitted recently. Wait a moment before retrying." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
      ),
      originDecision.responseOrigin
    );
  }

  for (const endpoint of BROADCASTERS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: payload.rawTransaction,
        cache: "no-store",
        signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS)
      });
      const returnedId = (await response.text()).trim().replace(/^"|"$/g, "");
      if (response.ok && returnedId === transactionId) {
        return withCors(NextResponse.json({ transactionId }), originDecision.responseOrigin);
      }
    } catch {
      // Try the independent fallback broadcaster.
    }
  }

  return withCors(
    NextResponse.json(
      { error: "The wallet signed successfully, but the Bitcoin network could not accept the transaction. Try broadcasting again shortly." },
      { status: 502 }
    ),
    originDecision.responseOrigin
  );
}

function parsePayload(text: string): { rawTransaction: string; transactionId: string } | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawTransaction = "rawTransaction" in value && typeof value.rawTransaction === "string"
      ? value.rawTransaction.trim().toLowerCase()
      : "";
    const transactionId = "transactionId" in value && typeof value.transactionId === "string"
      ? value.transactionId.trim().toLowerCase()
      : "";
    if (
      !/^[0-9a-f]+$/.test(rawTransaction) ||
      rawTransaction.length % 2 !== 0 ||
      rawTransaction.length > MAX_TRANSACTION_HEX_LENGTH ||
      !/^[0-9a-f]{64}$/.test(transactionId)
    ) return null;
    return { rawTransaction, transactionId };
  } catch {
    return null;
  }
}

function withCors(response: NextResponse, origin: string | null) {
  applyCorsHeaders(response.headers, origin);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
