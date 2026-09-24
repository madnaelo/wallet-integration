"use client";

import { useEffect, useRef } from "react";
import { attributedLink, attributionFromUrl, GROWTH_PATHS, type Attribution } from "@/lib/growth";
import { envPublic } from "@/lib/envPublic";

export function growthPrivacyOptOut(): boolean {
  return navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
export function currentAttribution(): Attribution | undefined {
  return growthPrivacyOptOut() ? undefined : attributionFromUrl(new URL(location.href), document.referrer);
}

// No cookies, browser storage, wallet identifiers, full URLs or user-level sessions.
export function GrowthTracker() {
  const opened = useRef(false);
  useEffect(() => {
    if (growthPrivacyOptOut() || location.pathname === "/demo") return;
    const attribution = currentAttribution()!;
    const page = location.pathname;
    if (!GROWTH_PATHS.includes(page as typeof GROWTH_PATHS[number])) return;
    const send = (event: string) => {
      void fetch(envPublic.BACKEND_BASE_URL.replace(/\/$/, "") + "/api/growth/events", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", redirect: "error",
        keepalive: true, signal: AbortSignal.timeout(4000),
        body: JSON.stringify({ id: crypto.randomUUID(), event, page, attribution })
      }).catch(() => {});
    };
    if (!opened.current) {
      opened.current = true;
      send(page === "/contact" ? "contact_opened" : "landing");
    }
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin !== location.origin) return;
      if (link.pathname === "/demo") send("demo_cta");
      if (GROWTH_PATHS.includes(link.pathname as typeof GROWTH_PATHS[number])) {
        link.href = attributedLink(link.pathname + link.search + link.hash, attribution);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
