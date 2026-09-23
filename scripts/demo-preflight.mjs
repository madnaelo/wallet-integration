import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowed = new Set([
  "src/app/demo/DemoExperience.tsx", "src/components/TokenPicker.tsx",
  "src/lib/demo.ts", "src/lib/commercial.ts", "src/lib/units.ts",
  "src/lib/server/mockAggregatorClient.ts", "src/lib/server/quoteNormalization.ts"
]);
const visited = new Set();
function inspect(path) {
  const name = relative(root, path).replaceAll("\\", "/");
  if (visited.has(name)) return;
  if (!allowed.has(name)) throw new Error(`Demo runtime dependency is not approved: ${name}`);
  visited.add(name);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const specifier = node.moduleSpecifier.text;
      if (["react", "react-dom"].includes(specifier) || specifier.endsWith(".module.css")) return;
      if (!specifier.startsWith("@/")) throw new Error(`Unapproved demo import: ${specifier}`);
      const base = resolve(root, "src", specifier.slice(2));
      let target;
      for (const ext of [".ts", ".tsx"]) {
        if (allowed.has(relative(root, base + ext).replaceAll("\\", "/"))) target = base + ext;
      }
      if (!target) throw new Error(`Unapproved demo dependency: ${specifier}`);
      inspect(target);
    }
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "sendBeacon", "ethereum", "solana", "bitcoin", "process", "eval"].includes(node.text)) {
      throw new Error(`Network, wallet or environment access in demo dependency: ${name}:${node.text}`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new Error(`Dynamic import is not allowed in demo: ${name}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
inspect(resolve(root, "src/app/demo/DemoExperience.tsx"));
console.log(`Demo dependency boundary passed (${visited.size} source modules; no wallet/provider/config imports).`);
