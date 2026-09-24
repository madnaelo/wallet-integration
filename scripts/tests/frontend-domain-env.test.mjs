import test from "node:test";
import assert from "node:assert/strict";
import { frontendDomainEnvironment } from "../deploy/frontend-domain-env.mjs";

test("canonical domain drives sign-in, alerts and explicit retained origins", () => {
  const env = frontendDomainEnvironment("https://getswapradar.xyz", "https://wallet-integration-theta.vercel.app");
  assert.equal(env.APP_URL, "https://getswapradar.xyz");
  assert.equal(env.AUTH_SIGNING_DOMAIN, "getswapradar.xyz");
  assert.equal(env.AUTH_SIGNING_URI, env.APP_URL);
  assert.equal(env.FRONTEND_URL, env.APP_URL);
  assert.equal(env.CORS_ALLOWED_ORIGINS, "https://getswapradar.xyz,https://wallet-integration-theta.vercel.app");
  assert.equal(env.FRONTEND_ORIGINS, env.CORS_ALLOWED_ORIGINS);
  assert.equal(frontendDomainEnvironment(env.APP_URL, env.APP_URL).CORS_ALLOWED_ORIGINS, env.APP_URL);
  assert.equal(Object.hasOwn(env, "MARKET_RADAR_LIVE_ENABLED"), false);
  assert.equal(Object.hasOwn(env, "BACKEND_PROXY_TARGET"), false);
});

test("rejects insecure, wildcard, credential, path and env-injection domain values", () => {
  for (const value of ["*", "http://example.com", "https://user:password@example.com", "https://example.com/path",
    "https://example.com?x=1", "https://example.com:8443", "https://example.com\nEVIL=true"]) {
    assert.throws(() => frontendDomainEnvironment(value));
    assert.throws(() => frontendDomainEnvironment("https://getswapradar.xyz", value));
  }
});
