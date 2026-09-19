type BrandConfig = { name?: string; shortName?: string; assetsBase?: string; supportPath?: string };

export function createBrand(config: BrandConfig = {}) {
  const name = config.name?.trim() || "Swap Assistant";
  const shortName = config.shortName?.trim() || name;
  const assetsBase = config.assetsBase?.trim() || "";
  const supportPath = config.supportPath?.trim() || "/contact";
  if (![name,shortName].every((value) => /^[A-Za-z0-9][A-Za-z0-9 &._-]{0,39}$/.test(value))) {
    throw new Error("Brand names must be 1-40 plain-text characters.");
  }
  if (assetsBase && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(assetsBase)) {
    throw new Error("Brand assets must use a same-origin directory without traversal.");
  }
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(supportPath)) {
    throw new Error("Support must use a same-origin page.");
  }
  return Object.freeze({ name, shortName, assetsBase, supportPath,
    icon: assetsBase + "/icon-192.png", socialImage: assetsBase + "/og-image.png" });
}

export const BRAND = createBrand({
  name: process.env.NEXT_PUBLIC_BRAND_NAME,
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME,
  assetsBase: process.env.NEXT_PUBLIC_BRAND_ASSETS_BASE,
  supportPath: process.env.NEXT_PUBLIC_BRAND_SUPPORT_PATH
});
