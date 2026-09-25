import { mkdir, writeFile } from "node:fs/promises";
import { validateKey } from "./lib/indexnow.mjs";

const key = process.env.INDEXNOW_KEY;
if (key) {
  validateKey(key);
  await mkdir("public", { recursive: true });
  await writeFile(`public/indexnow-${key}.txt`, key, "utf8");
  console.log("Prepared IndexNow domain-verification artifact");
} else {
  console.log("IndexNow verification not configured for this build");
}
