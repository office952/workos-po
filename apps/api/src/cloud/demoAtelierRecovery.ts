import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DEMO_ATELIER_CYCLE_STATE, DEMO_ATELIER_FIXTURE_KIND, DEMO_ATELIER_LEDGER, DEMO_ATELIER_MARKER } from "./demoAtelierIdentity.js";
import { DEMO_ATELIER_SECRETS, readDemoKey, sealJson, unsealJson, type SealedBlob } from "./demoAtelierSecrets.js";
import { restoreCloudBackup } from "./restore.js";

/**
 * N-019 demo metadata bundle — the demo-specific context the general cloud
 * backup does not (and should not) know about: root markers, the preparation
 * ledger, the cycle state and scenario metadata, plus the local credentials
 * sealed with a per-user key. It sits next to the data backup, paired with it
 * by the data manifest checksum, and never contains process state (PIDs,
 * runtime lease, runner heartbeat).
 *
 * Restore takes only explicit inputs (data backup, bundle, key root, empty
 * target). It never reads the original root.
 */

export const DEMO_BUNDLE_VERSION = 1;
export const DEMO_BUNDLE_SUFFIX = ".demo-n019";
export const DEMO_BUNDLE_MANIFEST = "demo-bundle-manifest.json";
const SYNTHETIC_MARKER = "SYNTHETIC_REFERENCE";
const IDENTITY_FILE = ".reference-identity.json";
const CREDENTIALS_FILE = "credentials.sealed.json";
const SCENARIO_FILE = "scenario.json";

type BundleFile = { path: string; sha256: string; bytes: number };

export type DemoBundleManifest = {
  bundleVersion: typeof DEMO_BUNDLE_VERSION;
  fixtureKind: typeof DEMO_ATELIER_FIXTURE_KIND;
  createdAt: string;
  dataBackup: { name: string; manifestSha256: string };
  files: BundleFile[];
};

export type DemoScenarioMetadata = {
  fixtureKind: typeof DEMO_ATELIER_FIXTURE_KIND;
  organizationId: string | null;
  ownerEmail: string | null;
  codeVersion: string;
  historyApplied: string[];
  chronologyApplied: string[];
  cycle: { id: string; status: string; steps: number } | null;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeAtomic(path: string, content: string | Buffer, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, content, mode === undefined ? undefined : { mode });
  renameSync(temp, path);
}

/** Cycle state without process facts; a RUNNING cycle cannot be bundled. */
export function sanitizeCycleState(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.status === "RUNNING") {
    throw new Error("demo_bundle_refused_cycle_running");
  }
  const { runnerPid, heartbeatAt, ...rest } = raw;
  void runnerPid;
  void heartbeatAt;
  return rest;
}

export function bundleDirFor(dataBackupDir: string): string {
  const resolved = resolve(dataBackupDir);
  return join(dirname(resolved), `${basename(resolved)}${DEMO_BUNDLE_SUFFIX}`);
}

export function createDemoBundle(input: {
  root: string;
  dataBackupDir: string;
  keyRoot: string;
  codeVersion: string;
}): string {
  const out = bundleDirFor(input.dataBackupDir);
  if (existsSync(out)) {
    throw new Error(`demo_bundle_exists:${out}`);
  }
  const dataManifest = readFileSync(join(input.dataBackupDir, "manifest.json"));
  const key = readDemoKey(input.keyRoot);
  const ledgerRaw = readFileSync(join(input.root, DEMO_ATELIER_LEDGER), "utf8");
  const ledger = JSON.parse(ledgerRaw) as { fixtureKind?: string; applied?: Record<string, unknown> };
  if (ledger.fixtureKind !== DEMO_ATELIER_FIXTURE_KIND) {
    throw new Error("demo_bundle_ledger_incompatible");
  }
  const identity = JSON.parse(readFileSync(join(input.root, IDENTITY_FILE), "utf8")) as Record<string, unknown>;
  const secretsPath = join(input.root, DEMO_ATELIER_SECRETS);
  const secrets = existsSync(secretsPath) ? JSON.parse(readFileSync(secretsPath, "utf8")) : null;
  if (!secrets) {
    throw new Error("demo_bundle_refused_no_local_credentials");
  }
  const cyclePath = join(input.root, DEMO_ATELIER_CYCLE_STATE);
  const cycle = existsSync(cyclePath) ? sanitizeCycleState(JSON.parse(readFileSync(cyclePath, "utf8"))) : null;
  const applied = Object.keys(ledger.applied ?? {});
  const scenario: DemoScenarioMetadata = {
    fixtureKind: DEMO_ATELIER_FIXTURE_KIND,
    organizationId: typeof identity.organizationId === "string" ? identity.organizationId : null,
    ownerEmail: typeof identity.email === "string" ? identity.email : null,
    codeVersion: input.codeVersion,
    historyApplied: applied.filter((item) => /^history:[^:]+$/.test(item)),
    chronologyApplied: applied.filter((item) => item.startsWith("chronology:")),
    cycle: cycle ? { id: String(cycle.cycleId), status: String(cycle.status), steps: Object.keys((cycle.steps as object) ?? {}).length } : null,
  };
  const contents: Array<[string, Buffer]> = [
    [`markers/${DEMO_ATELIER_MARKER}`, readFileSync(join(input.root, DEMO_ATELIER_MARKER))],
    [`markers/${SYNTHETIC_MARKER}`, readFileSync(join(input.root, SYNTHETIC_MARKER))],
    [DEMO_ATELIER_LEDGER, Buffer.from(ledgerRaw)],
    [SCENARIO_FILE, Buffer.from(`${JSON.stringify(scenario, null, 2)}\n`)],
    [CREDENTIALS_FILE, Buffer.from(`${JSON.stringify(sealJson({ identity, secrets }, key), null, 2)}\n`)],
  ];
  if (cycle) {
    contents.push([DEMO_ATELIER_CYCLE_STATE, Buffer.from(`${JSON.stringify(cycle, null, 2)}\n`)]);
  }
  const staging = `${out}.partial`;
  const files: BundleFile[] = [];
  for (const [path, bytes] of contents) {
    writeAtomic(join(staging, path), bytes, path === CREDENTIALS_FILE ? 0o600 : undefined);
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  const manifest: DemoBundleManifest = {
    bundleVersion: DEMO_BUNDLE_VERSION,
    fixtureKind: DEMO_ATELIER_FIXTURE_KIND,
    createdAt: new Date().toISOString(),
    dataBackup: { name: basename(resolve(input.dataBackupDir)), manifestSha256: sha256(dataManifest) },
    files,
  };
  writeAtomic(join(staging, DEMO_BUNDLE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(staging, out);
  return out;
}

/** Checks every file against the manifest and the pairing with the data backup. */
export function verifyDemoBundle(bundleDir: string, dataBackupDir: string): DemoBundleManifest {
  const manifest = JSON.parse(readFileSync(join(bundleDir, DEMO_BUNDLE_MANIFEST), "utf8")) as DemoBundleManifest;
  if (manifest.bundleVersion !== DEMO_BUNDLE_VERSION || manifest.fixtureKind !== DEMO_ATELIER_FIXTURE_KIND) {
    throw new Error("demo_bundle_incompatible");
  }
  const dataManifestSha = sha256(readFileSync(join(dataBackupDir, "manifest.json")));
  if (dataManifestSha !== manifest.dataBackup.manifestSha256) {
    throw new Error("demo_bundle_data_backup_mismatch");
  }
  const listed = new Set(manifest.files.map((file) => file.path));
  for (const file of manifest.files) {
    const bytes = readFileSync(join(bundleDir, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`demo_bundle_checksum:${file.path}`);
    }
  }
  const present = [...walk(bundleDir)].filter((path) => path !== DEMO_BUNDLE_MANIFEST);
  for (const path of present) {
    if (!listed.has(path)) throw new Error(`demo_bundle_unlisted_file:${path}`);
  }
  return manifest;
}

function* walk(dir: string, prefix = ""): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(join(dir, entry.name), rel);
    else yield rel;
  }
}

/**
 * Restores data (general cloud restore) and then the demo metadata into an
 * empty target. Credentials are unsealed with the local key and written only
 * into the target. No PID, lease or runner state is written; nothing starts.
 */
export function restoreDemoEnvironment(input: {
  dataBackupDir: string;
  bundleDir: string;
  targetRoot: string;
  keyRoot: string;
}): { targetRoot: string; scenario: DemoScenarioMetadata } {
  verifyDemoBundle(input.bundleDir, input.dataBackupDir);
  const key = readDemoKey(input.keyRoot);
  const sealed = JSON.parse(readFileSync(join(input.bundleDir, CREDENTIALS_FILE), "utf8")) as SealedBlob;
  const credentials = unsealJson<{ identity: unknown; secrets: unknown }>(sealed, key);
  const restored = restoreCloudBackup({ backupDir: input.dataBackupDir, targetRoot: input.targetRoot });
  const target = restored.targetRoot;
  const copy = (from: string, to: string) => writeAtomic(join(target, to), readFileSync(join(input.bundleDir, from)));
  copy(`markers/${DEMO_ATELIER_MARKER}`, DEMO_ATELIER_MARKER);
  copy(`markers/${SYNTHETIC_MARKER}`, SYNTHETIC_MARKER);
  copy(DEMO_ATELIER_LEDGER, DEMO_ATELIER_LEDGER);
  if (existsSync(join(input.bundleDir, DEMO_ATELIER_CYCLE_STATE))) {
    copy(DEMO_ATELIER_CYCLE_STATE, DEMO_ATELIER_CYCLE_STATE);
  }
  writeAtomic(join(target, IDENTITY_FILE), `${JSON.stringify(credentials.identity, null, 2)}\n`, 0o600);
  writeAtomic(join(target, DEMO_ATELIER_SECRETS), `${JSON.stringify(credentials.secrets, null, 2)}\n`, 0o600);
  const scenario = JSON.parse(readFileSync(join(input.bundleDir, SCENARIO_FILE), "utf8")) as DemoScenarioMetadata;
  return { targetRoot: target, scenario };
}
