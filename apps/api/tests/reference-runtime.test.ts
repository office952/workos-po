import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeReferenceRoot,
  classifyReferenceRoot,
  ensureSyntheticReferenceRoot,
  hasSyntheticMarker,
  isTrulyEmptyDirectory,
  prepareReferenceRootForCommand,
  resolveReferenceRoot,
} from "../../../scripts/reference-root.mjs";
import {
  REFERENCE_LAUNCH_PNPM_ARGS,
  REFERENCE_PROCESS_MARKER,
  isPositivelyIdentifiedReferenceProcess,
  recordedAllowsStop,
} from "../../../scripts/reference-process.mjs";
import {
  isProtectedOwnerPort,
  portsEligibleForGenericReclaim,
} from "../../../scripts/dev-ports.mjs";

const temps: string[] = [];
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runReferenceRuntime(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", ["scripts/reference-runtime.mjs", command], {
      cwd: repoRoot,
      env: { ...process.env, ...env, NODE_ENV: "development" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolvePromise({ code, stderr, stdout });
    });
  });
}

describe("reference root classification", () => {
  it("uses WORKOS_REFERENCE_ROOT and refuses production", () => {
    const root = join(tmpdir(), "workos-reference-override");
    expect(
      resolveReferenceRoot({
        WORKOS_REFERENCE_ROOT: root,
        WORKOS_CLOUD_ROOT: "C:\\real\\hub-media",
        NODE_ENV: "development",
      }),
    ).toBe(resolveReferenceRoot({ WORKOS_REFERENCE_ROOT: root, NODE_ENV: "test" }));
    expect(() =>
      resolveReferenceRoot({
        WORKOS_REFERENCE_ROOT: root,
        NODE_ENV: "production",
      }),
    ).toThrow(/production_refused/);
  });

  it("fails closed on unclassified existing business storage", () => {
    const root = mkdtempSync(join(tmpdir(), "workos-unclassified-"));
    temps.push(root);
    mkdirSync(join(root, "control"), { recursive: true });
    writeFileSync(join(root, "control", "control-plane.sqlite"), "not-a-db");
    expect(classifyReferenceRoot(root)).toBe("UNCLASSIFIED_BUSINESS_STORAGE");
    expect(() => assertSafeReferenceRoot(root)).toThrow(/unclassified/);
  });

  it("creates a synthetic marker on an empty root", () => {
    const root = mkdtempSync(join(tmpdir(), "workos-reference-empty-"));
    temps.push(root);
    expect(isTrulyEmptyDirectory(root)).toBe(true);
    ensureSyntheticReferenceRoot(root);
    expect(classifyReferenceRoot(root)).toBe("SYNTHETIC_REFERENCE");
  });

  it("refuses to claim ownership of a nonempty unmarked root", () => {
    const root = mkdtempSync(join(tmpdir(), "workos-reference-nonempty-"));
    temps.push(root);
    const planted = join(root, "planted-foreign.txt");
    writeFileSync(planted, "FOREIGN_CONTENT");
    expect(classifyReferenceRoot(root)).toBe("EMPTY_OR_UNKNOWN");
    expect(isTrulyEmptyDirectory(root)).toBe(false);
    expect(() => ensureSyntheticReferenceRoot(root)).toThrow(/nonempty_unmarked/);
    expect(hasSyntheticMarker(root)).toBe(false);
    expect(readFileSync(planted, "utf8")).toBe("FOREIGN_CONTENT");
  });
});

describe("Owner-facing reference command root policy", () => {
  it("reset does not mint SYNTHETIC_REFERENCE on a nonempty unmarked root", () => {
    const root = mkdtempSync(join(tmpdir(), "workos-wrapper-reset-policy-"));
    temps.push(root);
    writeFileSync(join(root, "planted.txt"), "KEEP");
    const prepared = prepareReferenceRootForCommand("reset", {
      WORKOS_REFERENCE_ROOT: root,
      NODE_ENV: "development",
    });
    expect(prepared).toBe(resolve(root));
    expect(hasSyntheticMarker(prepared)).toBe(false);
    expect(readdirSync(prepared).sort()).toEqual(["planted.txt"]);
  });

  it("start may establish ownership only on absent or truly empty roots", () => {
    const absent = join(mkdtempSync(join(tmpdir(), "workos-wrapper-absent-base-")), "new-root");
    temps.push(join(absent, ".."));
    const created = prepareReferenceRootForCommand("start", {
      WORKOS_REFERENCE_ROOT: absent,
      NODE_ENV: "development",
    });
    expect(hasSyntheticMarker(created)).toBe(true);

    const nonempty = mkdtempSync(join(tmpdir(), "workos-wrapper-start-nonempty-"));
    temps.push(nonempty);
    writeFileSync(join(nonempty, "foreign.bin"), "x");
    expect(() =>
      prepareReferenceRootForCommand("start", {
        WORKOS_REFERENCE_ROOT: nonempty,
        NODE_ENV: "development",
      }),
    ).toThrow(/nonempty_unmarked/);
    expect(hasSyntheticMarker(nonempty)).toBe(false);
  });
});

describe("Owner-facing reference:reset end-to-end", () => {
  it("refuses nonempty unmarked roots without creating a marker or deleting planted files", async () => {
    const root = mkdtempSync(join(tmpdir(), "workos-wrapper-reset-e2e-"));
    temps.push(root);
    const plantedPath = join(root, "unrelated-owner-file.txt");
    const plantedBody = "DO_NOT_DELETE_UNRELATED_CONTENT";
    writeFileSync(plantedPath, plantedBody);
    const beforeEntries = readdirSync(root).sort();

    const result = await runReferenceRuntime("reset", {
      WORKOS_REFERENCE_ROOT: root,
      WORKOS_CLOUD_ROOT: "C:\\should\\not\\be\\used",
      NODE_ENV: "development",
    });

    expect(result.code).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toMatch(
      /synthetic_marker_required|owner_review_reset_refused/,
    );
    expect(hasSyntheticMarker(root)).toBe(false);
    expect(existsSync(plantedPath)).toBe(true);
    expect(readFileSync(plantedPath, "utf8")).toBe(plantedBody);
    expect(readdirSync(root).sort()).toEqual(beforeEntries);
  }, 60_000);
});

describe("protected owner reference port", () => {
  it("keeps 8787 out of generic reclaim", () => {
    expect(isProtectedOwnerPort(8787)).toBe(true);
    expect(portsEligibleForGenericReclaim([5173, 8787])).toEqual([5173]);
    expect(portsEligibleForGenericReclaim()).not.toContain(8787);
  });
});

describe("reference process ownership", () => {
  const recorded = {
    pid: 4242,
    classification: "SYNTHETIC_REFERENCE",
    port: 8787,
  };

  it("launches the API with an explicit command-line marker", () => {
    expect(REFERENCE_PROCESS_MARKER).toBe("--workos-reference-runtime");
    expect(REFERENCE_LAUNCH_PNPM_ARGS).toEqual([
      "--filter",
      "@workos-final/api",
      "start",
      "--",
      "--workos-reference-runtime",
    ]);
  });

  it("allows stop only for a recorded synthetic 8787 process whose command line has the marker", () => {
    const command = "pnpm --filter @workos-final/api start -- --workos-reference-runtime";
    expect(recordedAllowsStop(recorded, command)).toEqual({ ok: true });
    expect(isPositivelyIdentifiedReferenceProcess(4242, recorded, command)).toBe(true);
  });

  it("refuses stop when the command line cannot be read", () => {
    expect(recordedAllowsStop(recorded, "")).toEqual({
      ok: false,
      reason: "command_unreadable",
    });
    expect(recordedAllowsStop(recorded, null)).toEqual({
      ok: false,
      reason: "command_unreadable",
    });
  });

  it("refuses stop when the marker is absent even if the recorded kind looks familiar", () => {
    expect(
      recordedAllowsStop(
        { ...recorded, kind: "workos-reference-runtime" },
        "tsx src/index.ts",
      ),
    ).toEqual({ ok: false, reason: "marker_absent" });
    expect(
      recordedAllowsStop(recorded, "node workos-final src/index.ts"),
    ).toEqual({ ok: false, reason: "marker_absent" });
  });

  it("refuses stop when classification or port do not match the Owner reference", () => {
    expect(recordedAllowsStop({ ...recorded, classification: "UNKNOWN" }, "x --workos-reference-runtime")).toEqual({
      ok: false,
      reason: "classification",
    });
    expect(recordedAllowsStop({ ...recorded, port: 28787 }, "x --workos-reference-runtime")).toEqual({
      ok: false,
      reason: "port",
    });
    expect(isPositivelyIdentifiedReferenceProcess(99, recorded, "x --workos-reference-runtime")).toBe(
      false,
    );
  });
});
