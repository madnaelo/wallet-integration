import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npmCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
const npmArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm audit --omit=dev --json"]
  : ["audit", "--omit=dev", "--json"];
const result = spawnSync(npmCommand, npmArgs, {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true
});

if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout || "npm audit returned no readable report.\n");
  process.exit(1);
}

const policy = JSON.parse(readFileSync(new URL("../config/npm-audit-allowlist.json", import.meta.url), "utf8"));
const vulnerabilities = report.vulnerabilities ?? {};
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const today = new Date().toISOString().slice(0, 10);

function rootAdvisories(packageName, visited = new Set()) {
  if (visited.has(packageName)) return [];
  visited.add(packageName);
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) return [];

  return (vulnerability.via ?? []).flatMap((cause) => {
    if (typeof cause === "string") return rootAdvisories(cause, visited);
    return cause && typeof cause === "object" && cause.source ? [cause] : [];
  });
}

const rejected = [];
const accepted = [];
for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
  if ((severityRank[vulnerability.severity] ?? 0) < severityRank.moderate) continue;
  const roots = rootAdvisories(packageName);
  const allowed = roots.length > 0 && roots.every((advisory) => {
    const exception = policy.advisories?.[String(advisory.source)];
    return exception
      && exception.package === advisory.name
      && typeof exception.expiresOn === "string"
      && exception.expiresOn >= today;
  });
  (allowed ? accepted : rejected).push({ packageName, severity: vulnerability.severity, roots });
}

if (accepted.length) {
  const advisoryIds = [...new Set(accepted.flatMap((item) => item.roots.map((root) => root.source)))];
  process.stdout.write(`Accepted ${accepted.length} transitive finding(s) under reviewed advisory exception(s): ${advisoryIds.join(", ")}.\n`);
}

if (rejected.length) {
  for (const item of rejected) {
    const roots = item.roots.map((root) => `${root.name}#${root.source}`).join(", ") || "unresolved cause";
    process.stderr.write(`${item.severity}: ${item.packageName} (${roots})\n`);
  }
  process.exit(1);
}

if (result.status !== 0 && accepted.length === 0 && Object.keys(vulnerabilities).length === 0) {
  process.stderr.write(result.stderr || "npm audit failed without reporting a vulnerability.\n");
  process.exit(1);
}

process.stdout.write("Production dependency audit passed.\n");
