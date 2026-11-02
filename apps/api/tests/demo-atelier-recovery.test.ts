import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudBackup } from "../src/cloud/backup.js";
import { connectDemoAppTransport } from "../src/cloud/demoAtelierHttp.js";
import { assertHistoryNotApplied } from "../src/cloud/demoAtelierHistory.js";
import { DEMO_ATELIER_CYCLE_STATE, DEMO_ATELIER_LEDGER, DEMO_ATELIER_MARKER, DEMO_PEOPLE } from "../src/cloud/demoAtelierIdentity.js";
import { fileDemoLedger } from "../src/cloud/demoAtelierLedger.js";
import { createDemoBundle, restoreDemoEnvironment, verifyDemoBundle } from "../src/cloud/demoAtelierRecovery.js";
import {
  DEMO_ATELIER_SECRETS,
  ensureDemoKey,
  generateDemoSecrets,
  loadDemoSecrets,
  readDemoSecretsFile,
  writeNewDemoSecrets,
} from "../src/cloud/demoAtelierSecrets.js";
import { prepareDemoAtelier } from "../src/cloud/demoAtelierSeed.js";
import { ensureOwnerReviewProvisioned, readOwnerReviewIdentity } from "../src/cloud/ownerReviewReset.js";
import { cleanupCloudTemps, openCloudFixture, trackTempDir, type CloudFixture } from "./cloud-harness.js";

const fixtures: CloudFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close();
  }
  cleanupCloudTemps();
});

/** A file-backed demo root with locally generated credentials, as `init` + `prepare` leave it. */
async function demoRoot(): Promise<{ root: string; organizationId: string; password: string }> {
  const root = trackTempDir();
  const password = `t-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const provisioned = await ensureOwnerReviewProvisioned({ cloudRoot: root, password, env: { NODE_ENV: "development" } });
  writeFileSync(join(root, DEMO_ATELIER_MARKER), "FIXTURE_KIND=DEMO_ATELIER_N019_V1\nSYNTHETIC_DEMO_DATA=YES\n");
  writeNewDemoSecrets(root, generateDemoSecrets());
  const fixture = openCloudFixture(root, { env: { NODE_ENV: "development" } });
  const transport = await connectDemoAppTransport({ app: fixture.app, email: provisioned.identity.email, password, organizationId: provisioned.organizationId });
  const report = await prepareDemoAtelier({ transport, ledger: fileDemoLedger(root), secrets: loadDemoSecrets(root) });
  expect(report.refusals).toEqual([]);
  fixture.close();
  return { root, organizationId: provisioned.organizationId, password };
}

describe("N-019 local credentials", () => {
  it("generates distinct per-person PINs, never the old shared constant, and never overwrites them", () => {
    const root = trackTempDir();
    const generated = generateDemoSecrets();
    const pins = Object.values(generated.operatorPins);
    expect(pins).toHaveLength(DEMO_PEOPLE.length);
    expect(new Set(pins).size).toBe(pins.length);
    expect(pins.every((pin) => /^[1-9]\d{7}$/.test(pin))).toBe(true);
    expect(pins).not.toContain("246810");
    writeNewDemoSecrets(root, generated);
    expect(() => writeNewDemoSecrets(root, generateDemoSecrets())).toThrow("demo_secrets_exist");
    expect(readDemoSecretsFile(root)?.operatorPins).toEqual(generated.operatorPins);
  });

  it("keeps the PINs when preparation is resumed", async () => {
    const { root, organizationId, password } = await demoRoot();
    const before = readFileSync(join(root, DEMO_ATELIER_SECRETS), "utf8");
    const fixture = openCloudFixture(root, { env: { NODE_ENV: "development" } });
    fixtures.push(fixture);
    const transport = await connectDemoAppTransport({ app: fixture.app, email: "owner@workos.test", password, organizationId });
    const ledger = fileDemoLedger(root);
    expect((await prepareDemoAtelier({ transport, ledger, secrets: loadDemoSecrets(root) })).applied).toEqual([]);
    expect(readFileSync(join(root, DEMO_ATELIER_SECRETS), "utf8")).toBe(before);
    const secrets = loadDemoSecrets(root);
    for (const person of DEMO_PEOPLE) {
      await expect(transport.operator(ledger.id(`person:${person.key}`)!, secrets.operatorPin(person.key))).resolves.toBeTruthy();
    }
  }, 120_000);
});

describe("N-019 backup bundle and autonomous recovery", () => {
  it("bundles the demo metadata with checksums, without process state, and rejects tampering", async () => {
    const { root } = await demoRoot();
    writeFileSync(join(root, DEMO_ATELIER_CYCLE_STATE), JSON.stringify({ cycleId: "C1", status: "STOPPED", startedAt: "2026-10-23T13:46:44.278Z", steps: { a: { ok: true } }, runnerPid: 1234, heartbeatAt: "2026-10-23T14:00:00.000Z" }));
    const backupRoot = trackTempDir();
    const keyRoot = trackTempDir();
    ensureDemoKey(keyRoot);
    const data = await createCloudBackup({ cloudRoot: root, backupRoot });
    const bundle = createDemoBundle({ root, dataBackupDir: data.backupDir, keyRoot, codeVersion: "test" });
    expect(bundle.startsWith(data.backupDir)).toBe(true);
    expect(existsSync(join(data.backupDir, DEMO_ATELIER_LEDGER))).toBe(false);
    const manifest = verifyDemoBundle(bundle, data.backupDir);
    expect(manifest.files.map((file) => file.path).sort()).toEqual(
      ["credentials.sealed.json", DEMO_ATELIER_CYCLE_STATE, DEMO_ATELIER_LEDGER, `markers/${DEMO_ATELIER_MARKER}`, "markers/SYNTHETIC_REFERENCE", "scenario.json"].sort(),
    );
    const cycle = JSON.parse(readFileSync(join(bundle, DEMO_ATELIER_CYCLE_STATE), "utf8"));
    expect(cycle.runnerPid).toBeUndefined();
    expect(cycle.heartbeatAt).toBeUndefined();
    expect(cycle.status).toBe("STOPPED");
    const sealed = readFileSync(join(bundle, "credentials.sealed.json"), "utf8");
    const pin = loadDemoSecrets(root).operatorPin("cnc1");
    expect(sealed).not.toContain(pin);
    expect(sealed).not.toContain(readOwnerReviewIdentity(root)!.password);
    writeFileSync(join(bundle, DEMO_ATELIER_LEDGER), "{}");
    expect(() => verifyDemoBundle(bundle, data.backupDir)).toThrow(/demo_bundle_checksum/);
  }, 120_000);

  it("refuses to bundle a running cycle", async () => {
    const { root } = await demoRoot();
    writeFileSync(join(root, DEMO_ATELIER_CYCLE_STATE), JSON.stringify({ cycleId: "C1", status: "RUNNING", steps: {}, runnerPid: 1 }));
    const keyRoot = trackTempDir();
    ensureDemoKey(keyRoot);
    const data = await createCloudBackup({ cloudRoot: root, backupRoot: trackTempDir() });
    expect(() => createDemoBundle({ root, dataBackupDir: data.backupDir, keyRoot, codeVersion: "test" })).toThrow("demo_bundle_refused_cycle_running");
  }, 120_000);

  it("recovers into a new root after the original is gone: login, no duplicates, H1 not re-applied", async () => {
    const { root, password } = await demoRoot();
    const ledger = fileDemoLedger(root);
    ledger.mark("history:H1", "synthetic; simulated clock (test marker)");
    const pins = readDemoSecretsFile(root)!.operatorPins;
    const keyRoot = trackTempDir();
    ensureDemoKey(keyRoot);
    const data = await createCloudBackup({ cloudRoot: root, backupRoot: trackTempDir() });
    const bundle = createDemoBundle({ root, dataBackupDir: data.backupDir, keyRoot, codeVersion: "test" });

    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);

    const target = join(trackTempDir(), "restored");
    const result = restoreDemoEnvironment({ dataBackupDir: data.backupDir, bundleDir: bundle, targetRoot: target, keyRoot });
    expect(result.scenario.historyApplied).toEqual(["history:H1"]);
    expect(existsSync(join(target, "demo-atelier-api.pid.json"))).toBe(false);
    expect(existsSync(join(target, "ops", "runtime-lease.json"))).toBe(false);
    expect(readDemoSecretsFile(target)?.operatorPins).toEqual(pins);
    const identity = readOwnerReviewIdentity(target)!;
    expect(identity.password).toBe(password);

    const fixture = openCloudFixture(target, { env: { NODE_ENV: "development" } });
    fixtures.push(fixture);
    const transport = await connectDemoAppTransport({ app: fixture.app, email: identity.email, password: identity.password, organizationId: identity.organizationId });
    const restoredLedger = fileDemoLedger(target);
    const again = await prepareDemoAtelier({ transport, ledger: restoredLedger, secrets: loadDemoSecrets(target) });
    expect(again.applied).toEqual([]);
    expect(again.people).toBe(10);
    expect(() => assertHistoryNotApplied(restoredLedger)).toThrow("demo_history_already_applied");
    const secrets = loadDemoSecrets(target);
    await expect(transport.operator(restoredLedger.id("person:quality")!, secrets.operatorPin("quality"))).resolves.toBeTruthy();
  }, 180_000);

  it("refuses a bundle paired with another data backup", async () => {
    const { root } = await demoRoot();
    const keyRoot = trackTempDir();
    ensureDemoKey(keyRoot);
    const backupRoot = trackTempDir();
    const first = await createCloudBackup({ cloudRoot: root, backupRoot });
    const bundle = createDemoBundle({ root, dataBackupDir: first.backupDir, keyRoot, codeVersion: "test" });
    const second = await createCloudBackup({ cloudRoot: root, backupRoot, createdAt: "2026-10-23T23:59:59.000Z" });
    expect(() => verifyDemoBundle(bundle, second.backupDir)).toThrow("demo_bundle_data_backup_mismatch");
  }, 120_000);
});
