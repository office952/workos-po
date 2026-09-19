import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

if (process.env.WORKOS_CLOUD_ROOT?.trim()) {
  console.error("WORKOS_CLOUD_ROOT cannot be set for local backup.");
  process.exit(1);
}

const localRoot = process.env.WORKOS_LOCAL_ROOT?.trim() || join(homedir(), "WorkOS", "local");
const env = {
  ...process.env,
  WORKOS_LOCAL_ROOT: localRoot,
  WORKOS_CLOUD_ROOT: "",
};

const child = spawn("pnpm", ["--filter", "@workos-final/api", "local:backup"], {
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
