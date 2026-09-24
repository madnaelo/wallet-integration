import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import type { MarketCollector } from "./collector";
import { commercialRadarEnabled } from "./policy";
import type { RadarStore } from "./store";
import { validAsset } from "./types";

export function validPairKey(key: string): boolean {
  const parts = key.split("/");
  return (
    parts.length === 3 &&
    validAsset(parts[0]) &&
    validAsset(parts[1]) &&
    parts[0] !== parts[1] &&
    parts[2] === "SPOT"
  );
}

function authorized(header: string | undefined, expected: string): boolean {
  if (!header || header.length > 512 || expected.length < 32) return false;
  return timingSafeEqual(
    createHash("sha256").update(header).digest(),
    createHash("sha256").update(`Bearer ${expected}`).digest(),
  );
}

interface ServerOptions {
  collector: MarketCollector | null;
  store: RadarStore | null;
  mode: "disabled" | "research" | "commercial";
  internalToken: string;
  publicReadToken: string;
  env: Record<string, string | undefined>;
}

export function radarServer(options: ServerOptions) {
  let requests = 0;
  let windowAt = Date.now();
  const respond = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(body));
  };
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 },
    async (request, response) => {
      const started = performance.now();
      try {
        if (request.method !== "GET") {
          respond(response, 405, { error: "Method not allowed" });
          return;
        }
        if (!request.url || request.url.length > 2048) {
          respond(response, 400, { error: "Invalid request" });
          return;
        }
        const url = new URL(request.url, "http://radar.internal");
        if (url.pathname === "/health") {
          respond(response, 200, { status: "UP", mode: options.mode });
          return;
        }
        const internal = url.pathname.startsWith("/internal/");
        if (!internal && !url.pathname.startsWith("/v1/")) {
          respond(response, 404, { error: "Not found" });
          return;
        }
        if (
          !authorized(
            request.headers.authorization,
            internal ? options.internalToken : options.publicReadToken,
          )
        ) {
          respond(response, 401, { error: "Authentication required" });
          return;
        }
        if (
          !internal &&
          (options.mode !== "commercial" ||
            !commercialRadarEnabled(options.env))
        ) {
          respond(response, 503, {
            error: "Live market intelligence temporarily unavailable",
          });
          return;
        }
        if (Date.now() - windowAt >= 1000) {
          windowAt = Date.now();
          requests = 0;
        }
        if (++requests > 100) {
          response.setHeader("Retry-After", "1");
          respond(response, 429, { error: "Request limit reached" });
          return;
        }
        const collector = options.collector;
        if (!collector) {
          respond(response, 503, {
            error: "Live market intelligence temporarily unavailable",
          });
          return;
        }
        const path = url.pathname.replace(/^\/(internal|v1)/, "");
        if (path === "/health" && internal) {
          respond(response, 200, collector.health());
          return;
        }
        if (path === "/markets") {
          const query = url.searchParams.get("q") ?? "";
          if (query.length > 32 || !/^[a-zA-Z0-9/._-]*$/.test(query)) {
            respond(response, 400, { error: "Invalid market search" });
            return;
          }
          respond(response, 200, {
            audience: options.mode,
            markets: collector.markets(query),
          });
          return;
        }
        if (path === "/snapshot") {
          const key = url.searchParams.get("pair") ?? "";
          if (!validPairKey(key)) {
            respond(response, 400, { error: "Invalid market" });
            return;
          }
          const snapshot = collector.snapshot(key);
          respond(response, snapshot ? 200 : 202, {
            audience: options.mode,
            snapshot,
            message: snapshot
              ? undefined
              : "Building observations or insufficient market coverage.",
          });
          return;
        }
        if (path === "/audit" && internal && options.store) {
          const until = Number(url.searchParams.get("until") ?? Date.now());
          const from = Number(
            url.searchParams.get("from") ?? until - 7 * 86400000,
          );
          const score = Number(url.searchParams.get("minScore") ?? 80);
          const venues = Number(url.searchParams.get("minVenues") ?? 3);
          const horizon = Number(url.searchParams.get("horizonMs") ?? 86400000);
          if (
            ![from, until, score, venues, horizon].every(
              Number.isSafeInteger,
            ) ||
            from <= 0 ||
            until < from ||
            until - from > 31 * 86400000 ||
            score < 0 ||
            score > 100 ||
            venues < 1 ||
            venues > 3 ||
            horizon < 60000 ||
            horizon > 86400000
          ) {
            respond(response, 400, { error: "Invalid audit filters" });
            return;
          }
          respond(response, 200, {
            audience: options.mode,
            from,
            until,
            minScore: score,
            minVenues: venues,
            horizonMs: horizon,
            interpretation:
              "Descriptive sampled observations, not predictive probabilities. Incomplete windows are reported separately.",
            groups: await options.store.report(
              score,
              venues,
              horizon,
              from,
              until,
            ),
          });
          return;
        }
        respond(response, 404, { error: "Not found" });
      } catch {
        if (!response.headersSent)
          respond(response, 503, {
            error: "Live market intelligence temporarily unavailable",
          });
      } finally {
        if (options.collector) {
          options.collector.metrics.apiRequests++;
          options.collector.metrics.apiTotalMs += performance.now() - started;
        }
      }
    },
  );
  server.maxConnections = 100;
  server.keepAliveTimeout = 5000;
  return server;
}
