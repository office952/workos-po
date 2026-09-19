import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PRODUCT_HOST, resolveLocalProductLaunchEnv } from "./local-start-config.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

let productEnv;
try {
  productEnv = resolveLocalProductLaunchEnv(process.env, {
    defaultLocalRoot: join(homedir(), "WorkOS", "local"),
    staticRoot: join(repoRoot, "dist"),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!productEnv.WORKOS_STATIC_ROOT || !existsSync(join(productEnv.WORKOS_STATIC_ROOT, "index.html"))) {
  console.error("Built frontend is missing. Run `pnpm build` before `pnpm local:start`.");
  process.exit(1);
}

const env = {
  ...process.env,
  ...productEnv,
};

console.log(`Starting Local WorkOS at http://${LOCAL_PRODUCT_HOST}:${productEnv.PORT}`);
console.log("Deployment profile: LOCAL (loopback-only single-plane). Cloud root is not used.");

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
