import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const LIFI_CHAINS_URL = "https://li.quest/v1/chains?chainTypes=EVM";
const ZERO_X_CHAIN_IDS = new Set([
  1, 10, 56, 130, 137, 143, 146, 480, 999, 2741, 4217, 4663, 5000,
  8453, 9745, 42161, 43114, 57073, 59144, 80094, 534352
]);
const POPULAR_CHAIN_IDS = [1, 8453, 42161, 10, 137, 56, 43114, 143, 999, 59144, 534352, 5000];
const MAX_CHAIN_NAME_LENGTH = 64;
const MAX_CURRENCY_NAME_LENGTH = 64;
const MAX_CURRENCY_SYMBOL_LENGTH = 16;

const response = await fetch(LIFI_CHAINS_URL, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(15_000)
});
if (!response.ok) throw new Error(`LI.FI chains request failed with status ${response.status}.`);

const payload = await response.json();
if (!payload || !Array.isArray(payload.chains)) throw new Error("LI.FI returned an invalid chain catalog.");

const chainsById = new Map();
for (const value of payload.chains) {
  const chain = normalizeChain(value);
  if (!chain) continue;
  if (chainsById.has(chain.chainId)) throw new Error(`LI.FI returned duplicate chain id ${chain.chainId}.`);
  chainsById.set(chain.chainId, chain);
}

const popularRank = new Map(POPULAR_CHAIN_IDS.map((chainId, index) => [chainId, index]));
const chains = [...chainsById.values()].sort((left, right) => {
  const leftRank = popularRank.get(left.chainId) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = popularRank.get(right.chainId) ?? Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank || left.name.localeCompare(right.name) || left.chainId - right.chainId;
});
if (chains.length < 20) throw new Error(`LI.FI returned only ${chains.length} usable EVM mainnets.`);

const catalog = {
  source: LIFI_CHAINS_URL,
  reviewedAt: new Date().toISOString().slice(0, 10),
  chains
};
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../config/supported-evm-chains.json");
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.info(`Wrote ${chains.length} EVM mainnets to ${outputPath}.`);

function normalizeChain(value) {
  if (!isRecord(value) || value.chainType !== "EVM" || value.mainnet !== true) return null;
  const chainId = Number(value.id);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;

  const metamask = isRecord(value.metamask) ? value.metamask : {};
  const nativeCurrency = isRecord(metamask.nativeCurrency) ? metamask.nativeCurrency : {};
  const name = safeText(value.name, MAX_CHAIN_NAME_LENGTH);
  const nativeName = safeText(nativeCurrency.name, MAX_CURRENCY_NAME_LENGTH);
  const nativeSymbol = safeText(nativeCurrency.symbol, MAX_CURRENCY_SYMBOL_LENGTH);
  const decimals = Number(nativeCurrency.decimals);
  const rpcUrls = safeHttpsUrls(metamask.rpcUrls, 3);
  const blockExplorerUrls = safeHttpsUrls(metamask.blockExplorerUrls, 2);
  if (!name || !nativeName || !nativeSymbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (!rpcUrls.length) return null;

  return {
    chainId,
    name,
    rpcUrls,
    blockExplorerUrls,
    nativeCurrency: { name: nativeName, symbol: nativeSymbol, decimals },
    zeroXSupported: ZERO_X_CHAIN_IDS.has(chainId)
  };
}

function safeText(value, maximumLength) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maximumLength || /[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) return "";
  return normalized;
}

function safeHttpsUrls(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "string" || candidate.length > 512) return [];
    try {
      const url = new URL(candidate);
      return url.protocol === "https:" && !url.username && !url.password ? [url.toString()] : [];
    } catch {
      return [];
    }
  }).slice(0, limit);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
