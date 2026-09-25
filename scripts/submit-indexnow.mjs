import { changedPathsSinceDeployment, notifyIndexNow } from "./lib/indexnow.mjs";

const paths = changedPathsSinceDeployment(process.env.INDEXNOW_BASE_COMMIT);
if (!paths.length) {
  console.log("No public content changes; no IndexNow submission");
} else if (!process.env.INDEXNOW_KEY) {
  throw new Error("Changed public content requires configured INDEXNOW_KEY for submission");
} else {
  console.log(JSON.stringify(await notifyIndexNow({ key: process.env.INDEXNOW_KEY, paths,
    expectedCommit: process.env.EXPECTED_COMMIT })));
}
