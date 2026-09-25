import { execFileSync } from "node:child_process";
import { changedPublicPaths, notifyIndexNow } from "./lib/indexnow.mjs";

const files = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], { encoding: "utf8" }).trim().split(/\r?\n/);
const paths = changedPublicPaths(files);
if (!paths.length) {
  console.log("No public content changes; no IndexNow submission");
} else if (!process.env.INDEXNOW_KEY) {
  throw new Error("Changed public content requires configured INDEXNOW_KEY for submission");
} else {
  console.log(JSON.stringify(await notifyIndexNow({ key: process.env.INDEXNOW_KEY, paths,
    expectedCommit: process.env.EXPECTED_COMMIT })));
}
