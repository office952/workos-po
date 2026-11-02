import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudBackup } from "../src/cloud/backup.js";
import { connectDemoAppTransport, connectDemoFetchTransport } from "../src/cloud/demoAtelierHttp.js";
import { DEMO_ATELIER_MARKER } from "../src/cloud/demoAtelierIdentity.js";
import { fileDemoLedger } from "../src/cloud/demoAtelierLedger.js";
import { createDemoBundle } from "../src/cloud/demoAtelierRecovery.js";
import { ensureDemoKey, generateDemoSecrets, loadDemoSecrets, writeNewDemoSecrets } from "../src/cloud/demoAtelierSecrets.js";
import { prepareDemoAtelier } from "../src/cloud/demoAtelierSeed.js";
import { ensureOwnerReviewProvisioned, readOwnerReviewIdentity } from "../src/cloud/ownerReviewReset.js";
import { cleanupCloudTemps, openCloudFixture, trackTempDir } from "./cloud-harness.js";

/**
 * Regression for review #97: the documented restore command must work when
 * the configured original root does not exist, and the restored target must
 * start and authenticate through the documented commands.
 */

const SCRIPT = resolve(fileURLToPath(new URL("../../../scripts/demo-atelier.mjs", import.meta.url)));

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) => done({ code, output }));
  });
}

function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

const stops: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const stop of stops.splice(0)) {
    await stop();
  }
  cleanupCloudTemps();
});

describe("N-019 documented restore command without the original root", () => {
  it("restores from backup + bundle + key into an explicit target, then starts and authenticates there", async () => {
    // A synthetic demo root as init + prepare leave it.
    const original = trackTempDir();
    const password = `t-${randomUUID()}`;
    const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: original, password, env: { NODE_ENV: "development" } });
    writeFileSync(join(original, DEMO_ATELIER_MARKER), "FIXTURE_KIND=DEMO_ATELIER_N019_V1\nSYNTHETIC_DEMO_DATA=YES\n");
    writeNewDemoSecrets(original, generateDemoSecrets());
    const fixture = openCloudFixture(original, { env: { NODE_ENV: "development" } });
    const transport = await connectDemoAppTransport({ app: fixture.app, email: provisioned.identity.email, password, organizationId: provisioned.organizationId });
    const ledger = fileDemoLedger(original);
    expect((await prepareDemoAtelier({ transport, ledger, secrets: loadDemoSecrets(original) })).refusals).toEqual([]);
    fixture.close();
    const pins = loadDemoSecrets(original);
    const qualityPersonId = ledger.id("person:quality")!;

    const keyRoot = trackTempDir();
    ensureDemoKey(keyRoot);
    const data = await createCloudBackup({ cloudRoot: original, backupRoot: trackTempDir() });
    const bundle = createDemoBundle({ root: original, dataBackupDir: data.backupDir, keyRoot, codeVersion: "test" });
    const qualityPin = pins.operatorPin("quality");

    // The original is gone; the configured root points at the missing path.
    rmSync(original, { recursive: true, force: true });
    expect(existsSync(original)).toBe(false);

    const target = join(trackTempDir(), "restored");
    const port = await freePort();
    const baseEnv = { ...process.env, NODE_ENV: "development", WORKOS_DEMO_ATELIER_ALLOW_TEMP: "1" };
    const restored = await run(
      ["restore", "--target", target, "--data-backup", data.backupDir, "--bundle", bundle, "--key-root", keyRoot],
      { ...baseEnv, WORKOS_DEMO_ATELIER_ROOT: original },
    );
    expect(restored.output).not.toContain("demo_root_not_initialized");
    expect(restored.code).toBe(0);
    expect(existsSync(original)).toBe(false);
    expect(existsSync(join(target, DEMO_ATELIER_MARKER))).toBe(true);
    expect(existsSync(join(target, "demo-atelier-api.pid.json"))).toBe(false);

    // Documented start on the restored target.
    const targetEnv = { ...baseEnv, WORKOS_DEMO_ATELIER_ROOT: target, WORKOS_DEMO_ATELIER_PORT: String(port) };
    stops.push(() => run(["stop"], targetEnv));
    const started = await run(["start"], targetEnv);
    expect(started.code).toBe(0);
    expect(started.output).toContain(`DEMO_ATELIER_URL = http://127.0.0.1:${port}`);

    // Authentication with the restored credentials only.
    const identity = readOwnerReviewIdentity(target)!;
    expect(identity.password).toBe(password);
    const live = await connectDemoFetchTransport({ baseUrl: `http://127.0.0.1:${port}`, email: identity.email, password: identity.password, organizationId: identity.organizationId });
    const people = (await live.client.request("GET", "/api/people")).body?.people as unknown[];
    expect(people).toHaveLength(10);
    const restoredPin = loadDemoSecrets(target).operatorPin("quality");
    expect(restoredPin).toBe(qualityPin);
    await expect(live.operator(qualityPersonId, restoredPin)).resolves.toBeTruthy();

    // Commands on an existing environment keep their guard.
    const refused = await run(["status"], { ...process.env, NODE_ENV: "development", WORKOS_DEMO_ATELIER_ROOT: join(trackTempDir(), "missing") });
    expect(refused.code).not.toBe(0);
  }, 300_000);
});
