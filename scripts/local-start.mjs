import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

if (process.env.WORKOS_CLOUD_ROOT?.trim()) {
  console.error("WORKOS_CLOUD_ROOT cannot be set for Local WorkOS. Cloud and Local stay separate.");
  process.exit(1);
}

const localRoot = process.env.WORKOS_LOCAL_ROOT?.trim() || join(homedir(), "WorkOS", "local");
const port = process.env.PORT?.trim() || "8790";
const host = process.env.HOST?.trim() || "127.0.0.1";
const staticRoot = process.env.WORKOS_STATIC_ROOT?.trim() || join(repoRoot, "dist");

if (!existsSync(join(staticRoot, "index.html"))) {
  console.error("Built frontend is missing. Run `pnpm build` before `pnpm local:start`.");
  process.exit(1);
}

const env = {
  ...process.env,
  WORKOS_LOCAL_ROOT: localRoot,
  WORKOS_CLOUD_ROOT: "",
  WORKOS_STATIC_ROOT: staticRoot,
  HOST: host,
  PORT: port,
  NODE_ENV: process.env.NODE_ENV?.trim() || "production",
  WORKOS_PUBLIC_ORIGIN: process.env.WORKOS_PUBLIC_ORIGIN?.trim() || `http://${host}:${port}`,
};

console.log(`Starting Local WorkOS at http://${host}:${port}`);
console.log("Deployment profile: LOCAL (single-plane). Cloud root is not used.");

const child = spawn("pnpm", ["--filter", "@workos-final/api", "start"], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
