import test from "node:test";
import assert from "node:assert/strict";
import { changedPublicPaths, changedPathsSinceDeployment, submission, notifyIndexNow } from "../lib/indexnow.mjs";

const key = "test-proof-only-1234";
const commit = "a".repeat(40);
test("only real public content changes trigger notifications", () => {
  assert.deepEqual(changedPublicPaths(["backend/pom.xml", "docs/growth/scoreboard.md", "src/app/demo/page.tsx", "src/app/admin/page.tsx"]), []);
  assert.deepEqual(changedPublicPaths(["src/app/business/page.tsx"]), ["/business"]);
  assert.equal(changedPublicPaths(["src/lib/growthContent.ts"]).length, 7);
});
test("includes content across failed releases and skips an unchanged deployed span", () => {
  let args;
  const git = (command, input) => { assert.equal(command, "git"); args = input; return "src/lib/growthContent.ts\nbackend/Dockerfile\n"; };
  assert.equal(changedPathsSinceDeployment(commit, git).length, 7);
  assert.deepEqual(args, ["diff", "--name-only", commit, "HEAD"]);
  assert.deepEqual(changedPathsSinceDeployment(commit, () => ""), []);
  changedPathsSinceDeployment(undefined, git);
  assert.equal(args[2], "HEAD^");
  for (const bad of ["--output=leak", "main", "a\n".repeat(20)]) {
    assert.throws(() => changedPathsSinceDeployment(bad, () => assert.fail("must not call git")));
  }
  assert.throws(() => changedPathsSinceDeployment(commit, () => { throw new Error("missing commit"); }), /missing commit/);
});

test("rejects private, query-string, external, oversized and malformed submissions", () => {
  for (const path of ["/demo", "/admin", "/api/quote", "//evil.test", "/business?wallet=secret", "/business#private"]) {
    assert.throws(() => submission(key, [path]));
  }
  for (const bad of ["", "../secret", "key\nINJECTED", "x".repeat(129)]) assert.throws(() => submission(bad, ["/business"]));
  assert.throws(() => submission(key, Array(31).fill("/business")));
  assert.equal(submission(key, ["/business", "/business"]).urlList.length, 1);
});
function fixture({ revision = commit, proof = key, status = 200 } = {}) {
  const calls = [];
  return { calls, request: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error");
    if (url.endsWith("/api/health")) return Response.json({ status: "ok", build: { commit: revision } });
    if (url.endsWith(".txt")) return new Response(proof);
    return new Response(null, { status });
  } };
}
test("verifies exact deployed revision and proof before single notification", async () => {
  const f = fixture({ status: 202 });
  const result = await notifyIndexNow({ key, paths: ["/business"], expectedCommit: commit, request: f.request });
  assert.equal(result.status, 202); assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].url, "https://api.indexnow.org/indexnow");
  assert.deepEqual(JSON.parse(f.calls[2].options.body).urlList, ["https://getswapradar.xyz/business"]);
});
test("fails closed for stale deployment or invalid key proof", async () => {
  for (const config of [{ revision: "b".repeat(40) }, { proof: "wrong" }]) {
    const f = fixture(config);
    await assert.rejects(notifyIndexNow({ key, paths: ["/business"], expectedCommit: commit, request: f.request }));
    assert.ok(f.calls.every(c => !c.options.method));
  }
});
test("does not retry rate-limited notifications", async () => {
  const f = fixture({ status: 429 });
  await assert.rejects(notifyIndexNow({ key, paths: ["/business"], expectedCommit: commit, request: f.request }), /429/);
  assert.equal(f.calls.length, 3);
});
