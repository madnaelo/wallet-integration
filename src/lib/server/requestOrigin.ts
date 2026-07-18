import type { NextRequest } from "next/server";

import { env } from "@/lib/server/env";

export type RequestOriginDecision = {
  allowed: boolean;
  responseOrigin: string | null;
};

export function evaluateRequestOrigin(req: NextRequest): RequestOriginDecision {
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOW_ORIGINS);
  const origin = canonicalOrigin(req.headers.get("origin"));
  const rawOrigin = req.headers.get("origin");

  if (rawOrigin) {
    return {
      allowed: origin !== null && (allowedOrigins.has("*") || allowedOrigins.has(origin)),
      responseOrigin: origin
    };
  }

  const fetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite) {
    return {
      allowed: fetchSite === "same-origin" || (!env.REQUIRE_ALLOWED_ORIGIN && fetchSite === "same-site"),
      responseOrigin: null
    };
  }

  const refererOrigin = originFromReferer(req.headers.get("referer"));
  if (refererOrigin) {
    return {
      allowed: allowedOrigins.has("*") || allowedOrigins.has(refererOrigin),
      responseOrigin: null
    };
  }

  return { allowed: !env.REQUIRE_ALLOWED_ORIGIN, responseOrigin: null };
}

export function applyCorsHeaders(headers: Headers, responseOrigin: string | null): void {
  if (!responseOrigin) return;
  headers.set("Access-Control-Allow-Origin", responseOrigin);
  headers.append("Vary", "Origin");
}

function parseAllowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .map((candidate) => candidate === "*" ? candidate : canonicalOrigin(candidate))
      .filter((candidate): candidate is string => candidate !== null)
  );
}

function originFromReferer(value: string | null): string | null {
  if (!value) return null;
  try {
    return canonicalOrigin(new URL(value).origin);
  } catch {
    return null;
  }
}

function canonicalOrigin(value: string | null): string | null {
  if (!value || value.trim().toLowerCase() === "null") return null;
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
