import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateDeployment } from "../deployment-preflight.mjs";

const manifest = {version:1,mode:"customer",repository:"customer/river-swap",releaseBranch:"main",frontendProjectId:"prj_river",
  frontendOrgId:"team_river",backendDirectory:"/srv/river",backendContainer:"river-backend",postgresContainer:"river-db",
  postgresVolume:"river-db-data",internalNetwork:"river-internal",databaseName:"river",redisPrefix:"river-prod",
  frontendUrl:"https://river.example",backendUrl:"https://api.river.example",brandName:"River Swap",providerAccountsReviewed:true};
const baseline = [{repository:"madnaelo/wallet-integration",frontendProjectId:"prj_owner",backendDirectory:"/home/opc/wallet",
  backendContainer:"wallet-backend",postgresContainer:"wallet-postgres",postgresVolume:"wallet-postgres-data",internalNetwork:"wallet-database",
  databaseName:"wallet",redisPrefix:"wallet-prod",frontendUrl:"https://owner.example",backendUrl:"https://api.owner.example"}];
const policy={providers:{"0x":{monetization:"confirmed"},lifi:{monetization:"confirmed"},odos:{monetization:"pending"}}};
function fixture(){
  const env={GITHUB_REPOSITORY:manifest.repository,RELEASE_BRANCH:"main",VERCEL_PROJECT_ID:"prj_river",VERCEL_ORG_ID:"team_river",
    OCI_DEPLOY_PATH:"/srv/river",BACKEND_CONTAINER_NAME:"river-backend",POSTGRES_CONTAINER_NAME:"river-db",
    POSTGRES_VOLUME_NAME:"river-db-data",OCI_INTERNAL_NETWORK:"river-internal",POSTGRES_DB:"river",RATE_LIMIT_REDIS_PREFIX:"river-prod",
    NEXT_PUBLIC_SITE_URL:manifest.frontendUrl,FRONTEND_URL:manifest.frontendUrl,AUTH_SIGNING_URI:manifest.frontendUrl,
    AUTH_SIGNING_DOMAIN:"river.example",NEXT_PUBLIC_BACKEND_BASE_URL:"/backend",BACKEND_PROXY_TARGET:manifest.backendUrl,
    REVENUE_BACKEND_URL:manifest.backendUrl,CORS_ALLOW_ORIGINS:manifest.frontendUrl,FRONTEND_ORIGINS:manifest.frontendUrl,
    AUTH_SESSION_COOKIE_SECURE:"true",AUTH_EXPOSE_ACCESS_TOKEN:"false",AUTH_SESSION_COOKIE_PATH:"/backend",REVENUE_ENABLED:"true",
    DATABASE_URL:"jdbc:postgresql://river-db:5432/river",UPSTASH_REDIS_REST_URL:"https://redis.example",UPSTASH_REDIS_REST_TOKEN:"synthetic",
    RATE_LIMIT_REDIS_FAIL_OPEN:"false",RATE_LIMIT_REDIS_REQUIRED:"true",REQUIRE_ALLOWED_ORIGIN:"true",
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:"a".repeat(32),PLATFORM_FEE_BPS:"20",
    FEE_RECIPIENT_ADDRESS:"0x"+"1".repeat(40),SWAP_PROVIDERS:"0x,lifi",MONETIZED_SWAP_PROVIDERS:"0x,lifi",
    ZEROX_API_KEY:"synthetic-0x",LIFI_API_KEY:"synthetic-lifi",LIFI_INTEGRATOR:"river",
    REVENUE_RPC_ETHEREUM_URL:"https://rpc.example",NEXT_PUBLIC_BRAND_NAME:"River Swap",
    NEXT_PUBLIC_BRAND_ASSETS_BASE:"/brands/river",NEXT_PUBLIC_OPERATOR_DISCLOSURE:"Fictional test operator. Not a real deployment."};
  for(const key of ["REVENUE_INGEST_SECRET","ADMIN_API_KEY","POSTGRES_PASSWORD","API_RATE_LIMIT_KEY_PEPPER","RATE_LIMIT_KEY_PEPPER"])
    env[key]=createHash("sha256").update("synthetic:"+key).digest("hex");
  env.DATABASE_PASSWORD=env.POSTGRES_PASSWORD;
  return env;
}
const validate=(env,m=manifest)=>validateDeployment(env,m,policy,{protectedTargets:baseline});
test("accepts a separately configured fictional deployment",()=>assert.deepEqual(validate(fixture()),[]));
test("rejects provider policy bypass, weak keys and absent evidence",()=>{
  const env=fixture();env.SWAP_PROVIDERS="odos";env.REVENUE_ENABLED="false";env.ADMIN_API_KEY="short";
  env.RATE_LIMIT_REDIS_REQUIRED="false";env.REQUIRE_ALLOWED_ORIGIN="false";
  const errors=validate(env).join(" ");
  assert.match(errors,/policy-approved/);assert.match(errors,/revenue evidence/);assert.match(errors,/strong dedicated/);
  assert.match(errors,/distributed rate limiting must be required/);assert.match(errors,/allowed browser origin/);
});
test("rejects a copied production target even when environment matches it",()=>{
  const env=fixture();env.VERCEL_PROJECT_ID="prj_owner";
  assert.match(validate(env,{...manifest,frontendProjectId:"prj_owner"}).join(" "),/protected deployment/);
});
test("rejects public secrets, foreign origins and unreviewed branding",()=>{
  const env=fixture();env.NEXT_PUBLIC_REVENUE_INGEST_SECRET="secret";env.CORS_ALLOW_ORIGINS="*";
  env.NEXT_PUBLIC_BRAND_ASSETS_BASE="/../secrets";env.NEXT_PUBLIC_OPERATOR_DISCLOSURE="";
  const errors=validate(env).join(" ");
  assert.match(errors,/NEXT_PUBLIC/);assert.match(errors,/origins/);assert.match(errors,/asset directory/);assert.match(errors,/operator/);
});
test("does not silently skip isolation without a baseline",()=>{
  assert.match(validateDeployment(fixture(),manifest,policy).join(" "),/protected-deployments baseline/);
});
