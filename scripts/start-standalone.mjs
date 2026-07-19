import { cpSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const standaloneRoot = resolve(root, ".next", "standalone");
const serverFile = resolve(standaloneRoot, "server.js");
const port = readPort(process.env.PORT ?? process.env.PLAYWRIGHT_PORT ?? "3000");

if (!existsSync(serverFile)) {
  throw new Error("Standalone build is missing. Run npm run build first.");
}

copyRuntimeAssets(resolve(root, "public"), resolve(standaloneRoot, "public"));
copyRuntimeAssets(resolve(root, ".next", "static"), resolve(standaloneRoot, ".next", "static"));

const child = spawn(process.execPath, ["server.js"], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
    PORT: String(port)
  },
  stdio: "inherit"
});

let forwardedSignal = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    forwardedSignal = true;
    child.kill(signal);
  });
}

child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  process.exitCode = forwardedSignal ? 0 : (code ?? (signal ? 1 : 0));
});

function copyRuntimeAssets(source, destination) {
  if (!existsSync(source)) throw new Error(`Required runtime asset directory is missing: ${source}`);
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true });
}

function readPort(value) {
  if (!/^\d+$/.test(value)) throw new Error("PORT must be a number between 1 and 65535.");
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be a number between 1 and 65535.");
  }
  return parsed;
}
