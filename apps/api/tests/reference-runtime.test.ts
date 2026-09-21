import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeReferenceRoot,
  classifyReferenceRoot,
  ensureSyntheticReferenceRoot,
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

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
    ensureSyntheticReferenceRoot(root);
    expect(classifyReferenceRoot(root)).toBe("SYNTHETIC_REFERENCE");
  });
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
