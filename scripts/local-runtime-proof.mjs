import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkosApi } from "../apps/api/src/startApi.ts";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const staticRoot = join(repoRoot, "dist");
const localRoot = mkdtempSync(join(tmpdir(), "workos-local-proof-"));

const PRINCIPAL_ROUTES = [
  "/clienti",
  "/cereri",
  "/catalog",
  "/configurator",
  "/oferte",
  "/lucrari",
  "/atelier",
];

if (process.env.WORKOS_CLOUD_ROOT?.trim()) {
  console.error("Refusing isolated local proof while WORKOS_CLOUD_ROOT is set.");
  process.exit(1);
}

const started = await startWorkosApi(
  {
    ...process.env,
    WORKOS_LOCAL_ROOT: localRoot,
    WORKOS_CLOUD_ROOT: "",
    WORKOS_BACKUP_ROOT: "",
    WORKOS_STATIC_ROOT: staticRoot,
    HOST: "127.0.0.1",
    PORT: process.env.PORT?.trim() || "8791",
    NODE_ENV: "production",
    VITEST: "",
  },
  { installSignals: false },
);

const base = `http://127.0.0.1:${started.port}`;
const failures = [];

try {
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json();
  if (health.status !== 200 || healthBody.status !== "ok") {
    failures.push(`health ${health.status}`);
  }
  const ready = await fetch(`${base}/api/ready`);
  const readyBody = await ready.json();
  if (ready.status !== 200 || readyBody.status !== "ready") {
    failures.push(`ready ${ready.status}`);
  }
  for (const route of PRINCIPAL_ROUTES) {
    const page = await fetch(`${base}${route}`);
    const text = await page.text();
    if (page.status !== 200 || !text.toLowerCase().includes("<!doctype html")) {
      failures.push(`route ${route} ${page.status}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
  console.log(`LOCAL_PROOF_URL=${base}`);
  console.log("LOCAL_PROOF=PASS");
} finally {
  await started.close();
  rmSync(localRoot, { recursive: true, force: true });
}
