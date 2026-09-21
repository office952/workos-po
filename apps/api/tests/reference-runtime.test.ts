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
