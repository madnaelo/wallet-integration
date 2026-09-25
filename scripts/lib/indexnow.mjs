export const INDEXNOW_ORIGIN = "https://getswapradar.xyz";
export const INDEXNOW_PATHS = ["/", "/business", "/white-label-crypto-swap", "/crypto-swap-integration",
  "/for-wallets", "/for-web3-agencies", "/guides/build-vs-license-crypto-swaps",
  "/guides/add-swaps-to-a-wallet", "/guides/non-custodial-swap-architecture", "/market-radar"];

export function validateKey(key) {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key ?? "")) throw new Error("Invalid IndexNow verification key");
  return key;
}

export function changedPublicPaths(files) {
  const changed = new Set();
  for (const file of files) {
    if (["src/lib/growthContent.ts", "src/components/GrowthPage.tsx"].includes(file)) {
      INDEXNOW_PATHS.filter(p => !["/", "/business", "/market-radar"].includes(p)).forEach(p => changed.add(p));
    }
    for (const path of INDEXNOW_PATHS) {
      if (file === `src/app${path === "/" ? "" : path}/page.tsx`) changed.add(path);
    }
    if (["src/components/CommercialNav.tsx", "src/app/layout.tsx", "src/app/sitemap.ts"].includes(file)) {
      INDEXNOW_PATHS.forEach(p => changed.add(p));
    }
  }
  return [...changed];
}

export function submission(key, paths) {
  validateKey(key);
  if (!paths.length || paths.length > 30 || paths.some(p => !INDEXNOW_PATHS.includes(p))) {
    throw new Error("IndexNow accepts only a bounded set of public content paths");
  }
  return { host: new URL(INDEXNOW_ORIGIN).hostname, key,
    keyLocation: `${INDEXNOW_ORIGIN}/indexnow-${key}.txt`,
    urlList: [...new Set(paths)].map(p => INDEXNOW_ORIGIN + p) };
}

export async function notifyIndexNow({ key, paths, expectedCommit, request = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? "")) throw new Error("Expected full deployed commit required");
  const payload = submission(key, paths);
  const get = async url => {
    const response = await request(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Production verification request failed");
    return response;
  };
  const health = await (await get(`${INDEXNOW_ORIGIN}/api/health`)).json();
  if (health.status !== "ok" || health.build?.commit !== expectedCommit) throw new Error("Deployment revision mismatch");
  if ((await (await get(payload.keyLocation)).text()).trim() !== key) throw new Error("IndexNow key proof mismatch");
  // One bounded request, no retry loop: a 429 must not amplify submission traffic.
  const result = await request("https://api.indexnow.org/indexnow", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (![200, 202].includes(result.status)) throw new Error(`IndexNow did not accept the request (HTTP ${result.status})`);
  return { status: result.status, submitted: payload.urlList.length, meaning: "Received, not proof of indexing" };
}
