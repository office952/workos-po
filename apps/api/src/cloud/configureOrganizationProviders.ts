import { readFileSync } from "node:fs";
import { stdin } from "node:process";
import { openSqliteDatabase } from "../persistence/sqlite.js";
import type { ControlPlane } from "./controlPlane.js";
import { derivePlanePaths } from "./paths.js";
import { applyOrganizationProviderConfiguration } from "../workcenters/organizationProviderStore.js";

export async function configureOrganizationProviders(input: {
  controlPlane: ControlPlane;
  organizationId: string;
  config: unknown;
  mode: "dry-run" | "execute";
}): Promise<
  | {
      ok: true;
      alreadyApplied: boolean;
      contentHash: string;
      executed: boolean;
      workcenterCount: number;
      machineCount: number;
    }
  | { ok: false; error: string; detail?: string }
> {
  const organization = input.controlPlane.getOrganization(input.organizationId);
  if (!organization) {
    return { ok: false, error: "organization_missing" };
  }
  if (organization.status !== "ACTIVE") {
    return { ok: false, error: "organization_disabled" };
  }
  const plane = input.controlPlane.getPlaneByOrganization(organization.organizationId);
  if (!plane) {
    return { ok: false, error: "plane_unavailable" };
  }
  const paths = derivePlanePaths(input.controlPlane.cloudRoot, plane.planeKey);
  const db = openSqliteDatabase(paths.sqlitePath);
  try {
    const result = applyOrganizationProviderConfiguration(db, input.config, {
      mode: input.mode,
      source: "cli",
    });
    if (!result.ok) {
      return result;
    }
    return {
      ok: true,
      alreadyApplied: result.alreadyApplied,
      contentHash: result.contentHash,
      executed: result.executed,
      workcenterCount: result.registry.workcenters.length,
      machineCount: result.registry.machines.length,
    };
  } finally {
    db.close();
  }
}

export async function readProviderConfigFromArgv(
  argv: readonly string[],
  input: NodeJS.ReadableStream = stdin,
): Promise<unknown> {
  if (argv.includes("--config-stdin") && argv.includes("--config")) {
    throw new Error("Specify exactly one of --config-stdin or --config");
  }
  if (argv.includes("--config-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const path = readArg(argv, "config");
  if (!path) {
    throw new Error("Required: --config-stdin or --config <file>");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readArg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}
