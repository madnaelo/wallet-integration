import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { getAddress } from "ethers";

const targetBindings = {
  repository: "GITHUB_REPOSITORY", releaseBranch: "RELEASE_BRANCH", frontendProjectId: "VERCEL_PROJECT_ID",
  frontendOrgId: "VERCEL_ORG_ID", backendDirectory: "OCI_DEPLOY_PATH", backendContainer: "BACKEND_CONTAINER_NAME",
  postgresContainer: "POSTGRES_CONTAINER_NAME", postgresVolume: "POSTGRES_VOLUME_NAME",
  internalNetwork: "OCI_INTERNAL_NETWORK", databaseName: "POSTGRES_DB", redisPrefix: "RATE_LIMIT_REDIS_PREFIX"
};
const secretNames = ["REVENUE_INGEST_SECRET","ADMIN_API_KEY","POSTGRES_PASSWORD","API_RATE_LIMIT_KEY_PEPPER","RATE_LIMIT_KEY_PEPPER"];
const placeholder = /change[_ -]?me|your[_ -]|placeholder|example[_ -]?key|test[_ -]?key/i;

export function validateDeployment(env, manifest, policy, options = {}) {
  const errors = [];
  const check = (condition,message) => { if (!condition) errors.push(message); };
  check(manifest?.version === 1,"Manifest version must be 1.");
  check(["owner","customer"].includes(manifest?.mode),"Manifest mode must be owner or customer.");
  for (const [field,key] of Object.entries(targetBindings)) {
    check(typeof manifest?.[field] === "string" && manifest[field].length > 0 && !placeholder.test(manifest[field]),"Declare " + field + " in the manifest.");
    check(env[key] === manifest?.[field], key + " must match the reviewed target manifest.");
  }
  check(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(manifest.repository ?? ""),"Repository must be owner/name.");
  check(/^\/[a-zA-Z0-9_/-]+$/.test(manifest.backendDirectory ?? "") && !manifest.backendDirectory?.includes("..")
    && manifest.backendDirectory?.split("/").filter(Boolean).length >= 2,"Backend directory must be an explicit absolute application path.");
  for (const field of ["backendContainer","postgresContainer","postgresVolume","internalNetwork","databaseName","redisPrefix"]) {
    check(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{2,79}$/.test(manifest[field] ?? ""),"Invalid resource name: " + field);
  }
  function origin(value,label) {
    try {
      const url = new URL(value);
      check(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
        && ["/",""].includes(url.pathname),label + " must be an HTTPS origin.");
      return url.origin;
    } catch { errors.push(label + " must be a valid HTTPS origin."); return ""; }
  }
  const frontend = origin(manifest.frontendUrl,"frontendUrl");
  const backend = origin(manifest.backendUrl,"backendUrl");
  check(frontend !== backend,"Frontend and backend origins must be explicitly distinct.");
  check(env.NEXT_PUBLIC_SITE_URL === frontend,"NEXT_PUBLIC_SITE_URL must match the target frontend.");
  check(env.FRONTEND_URL === frontend,"FRONTEND_URL must match the target frontend.");
  check(env.AUTH_SIGNING_URI === frontend,"AUTH_SIGNING_URI must match the target frontend.");
  check(env.AUTH_SIGNING_DOMAIN === frontend.replace("https://",""),"AUTH_SIGNING_DOMAIN must match the frontend host.");
  check(env.NEXT_PUBLIC_BACKEND_BASE_URL === "/backend","Use the first-party /backend proxy.");
  check(env.BACKEND_PROXY_TARGET === backend && env.REVENUE_BACKEND_URL === backend,"Backend proxy and evidence target must match the reviewed backend.");
  const expectedOrigins = new Set([frontend,...(Array.isArray(manifest.allowedOrigins) ? manifest.allowedOrigins : [])]);
  for (const allowed of expectedOrigins) origin(allowed,"allowedOrigins");
  for (const key of ["CORS_ALLOW_ORIGINS","FRONTEND_ORIGINS"]) {
    const values = (env[key] ?? "").split(",").map(value => value.trim()).filter(Boolean);
    check(values.length === expectedOrigins.size && values.every(value => expectedOrigins.has(value)),key + " must exactly match reviewed frontend origins.");
  }
  check(env.AUTH_SESSION_COOKIE_SECURE === "true" && env.AUTH_EXPOSE_ACCESS_TOKEN === "false","Use secure HttpOnly sessions without exposed bearer tokens.");
  check(env.AUTH_SESSION_COOKIE_PATH === "/backend","Cookie path must match the first-party backend proxy.");
  check(env.REVENUE_ENABLED === "true","Enable durable revenue evidence on both applications.");
  for (const key of secretNames) {
    const value = env[key] ?? "";
    check(value.length >= 32 && new Set(value).size >= 12 && !placeholder.test(value),key + " must be a strong dedicated secret.");
  }
  check(new Set(secretNames.map(key => env[key])).size === secretNames.length,"Do not reuse secrets across authentication, revenue and rate limiting.");
  check(env.DATABASE_PASSWORD === env.POSTGRES_PASSWORD,"Database credentials must agree.");
  check(env.DATABASE_URL === "jdbc:postgresql://" + manifest.postgresContainer + ":5432/" + manifest.databaseName,
    "DATABASE_URL must use the isolated application database.");
  check(env.UPSTASH_REDIS_REST_URL?.startsWith("https://") && Boolean(env.UPSTASH_REDIS_REST_TOKEN),"Distributed rate-limit storage must be configured.");
  check(env.RATE_LIMIT_REDIS_FAIL_OPEN === "false","Production rate limits must fail closed.");
  check(env.RATE_LIMIT_REDIS_REQUIRED === "true","Production distributed rate limiting must be required.");
  check(env.REQUIRE_ALLOWED_ORIGIN === "true","Quote requests must require an allowed browser origin.");
  check(env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.length === 32,"Provide the customer's wallet connection project ID and review its origin allowlist.");
  check(/^[1-9][0-9]{0,2}$/.test(env.PLATFORM_FEE_BPS ?? "") && Number(env.PLATFORM_FEE_BPS) <= 300,"Platform fee must be 1-300 whole basis points.");
  let treasuryValid = false;
  try { treasuryValid = getAddress(env.FEE_RECIPIENT_ADDRESS ?? "") !== "0x0000000000000000000000000000000000000000"; } catch {}
  check(treasuryValid,"Provide a valid non-zero fee recipient address.");
  const enabled = (env.SWAP_PROVIDERS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const monetized = (env.MONETIZED_SWAP_PROVIDERS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  check(enabled.length > 0 && enabled.every(provider => policy.providers?.[provider]?.monetization === "confirmed"),"A selected provider is not policy-approved.");
  check(monetized.length === enabled.length && enabled.every(provider => monetized.includes(provider)),"Every enabled route must have an approved monetization configuration.");
  if (enabled.includes("0x")) check(Boolean(env.ZEROX_API_KEY) && !placeholder.test(env.ZEROX_API_KEY),"Configure the deployment's 0x API key.");
  if (enabled.includes("lifi")) {
    check(/^[a-zA-Z0-9_.-]{1,80}$/.test(env.LIFI_INTEGRATOR ?? ""),"Configure the reviewed LI.FI integration.");
    check(Boolean(env.LIFI_API_KEY) && !placeholder.test(env.LIFI_API_KEY),"Configure the deployment's LI.FI API key.");
  }
  check(Object.entries(env).some(([key,value]) => key.startsWith("REVENUE_RPC_") && value?.startsWith("https://")),
    "At least one independent settlement RPC must be configured.");
  check(!Object.keys(env).some(key => /^NEXT_PUBLIC_.*(SECRET|PASSWORD|PRIVATE_KEY|ZEROX_API_KEY|LIFI_API_KEY)$/.test(key)),
    "A private credential is configured as NEXT_PUBLIC.");
  const brandName = env.NEXT_PUBLIC_BRAND_NAME || "Swap Assistant";
  check(/^[A-Za-z0-9][A-Za-z0-9 &._-]{0,39}$/.test(brandName),"Invalid plain-text brand name.");
  check(brandName === manifest.brandName,"Brand must match the reviewed manifest.");
  const assetBase = env.NEXT_PUBLIC_BRAND_ASSETS_BASE || "";
  check(!assetBase || /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(assetBase),"Invalid same-origin brand asset directory.");
  const support = env.NEXT_PUBLIC_BRAND_SUPPORT_PATH || "/contact";
  check(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(support),"Support must be a same-origin page.");
  if (manifest.mode === "customer") {
    check(manifest.repository !== "madnaelo/wallet-integration","Customer releases must not target the owner's repository.");
    check(Boolean(env.NEXT_PUBLIC_OPERATOR_DISCLOSURE) && env.NEXT_PUBLIC_OPERATOR_DISCLOSURE.length <= 600,"Customer operator disclosure is required.");
    check(brandName !== "Swap Assistant" && Boolean(assetBase),"Customer branding must not silently reuse the owner's name or image assets.");
    check(manifest.providerAccountsReviewed === true,"Record review of the customer's own provider accounts and payout settings.");
    const protectedTargets = options.protectedTargets;
    check(Boolean(protectedTargets?.length),"Supply a reviewed protected-deployments baseline for customer isolation.");
    for (const protectedTarget of protectedTargets ?? []) {
      for (const field of Object.keys(targetBindings).filter(field => !["frontendOrgId","releaseBranch"].includes(field))) {
        check(manifest[field] !== protectedTarget[field],"Target conflicts with a protected deployment: " + field);
      }
      check(frontend !== protectedTarget.frontendUrl && backend !== protectedTarget.backendUrl,"Origin conflicts with a protected deployment.");
    }
  }
  if (options.root) {
    const publicRoot = realpathSync(resolve(options.root,"public"));
    for (const file of ["favicon.ico","favicon.svg","apple-touch-icon.png","icon-192.png","icon-512.png","icon-maskable-512.png","og-image.png"]) {
      const target = resolve(publicRoot,"."+assetBase,file);
      const valid = existsSync(target) && realpathSync(target).startsWith(publicRoot+sep);
      check(valid,"Missing or unsafe branded asset: " + file);
    }
    check(existsSync(resolve(options.root,"src/app","."+support,"page.tsx")),"The configured support page does not exist.");
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const arg = (name) => process.argv[process.argv.indexOf(name)+1];
    if (!process.argv.includes("--manifest")) throw new Error("Pass --manifest with the reviewed deployment JSON.");
    const manifest = JSON.parse(readFileSync(arg("--manifest"),"utf8"));
    const protectedTargets = process.argv.includes("--protected") ? JSON.parse(readFileSync(arg("--protected"),"utf8")) : [];
    const policy = JSON.parse(readFileSync(resolve("config/provider-commercial-policy.json"),"utf8"));
    const errors = validateDeployment(process.env,manifest,policy,{root:process.cwd(),protectedTargets});
    if (errors.length) {
      console.error("Deployment preflight failed:\n"+errors.map(error => "- "+error).join("\n"));
      process.exitCode = 1;
    } else console.log("Technical deployment preflight passed. This is not legal clearance or payout verification. No deployment was performed.");
  } catch {
    console.error("Preflight could not read a valid manifest, protected baseline or project configuration. No deployment was performed.");
    process.exitCode = 1;
  }
}
