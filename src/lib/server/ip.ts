import type { NextRequest } from "next/server";
import { isIP } from "net";

export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = firstValidForwardedIp(xff);
    if (first) return first;
  }
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return normalizeIp(xrip);
  return null;
}

function firstValidForwardedIp(value: string): string | null {
  for (const part of value.split(",")) {
    const ip = normalizeIp(part);
    if (ip) return ip;
  }
  return null;
}

function normalizeIp(value: string): string | null {
  let ip = value.trim();
  if (!ip) return null;
  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  } else {
    const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) ip = ipv4WithPort[1];
  }
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex >= 0) ip = ip.slice(0, zoneIndex);
  return isIP(ip) ? ip.toLowerCase() : null;
}
