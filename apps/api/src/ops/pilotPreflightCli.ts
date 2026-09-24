import { fileURLToPath } from "node:url";
import {
  evaluateProductionPilotReadiness,
  formatPilotPreflightHuman,
  PILOT_INTENTS,
  pilotPreflightExitCode,
  type PilotIntent,
  type ProductionPilotReadinessV1,
} from "./pilotPreflight.js";

export type PilotPreflightCliResult =
  | { ok: true; exitCode: 0 | 2; result: ProductionPilotReadinessV1 }
  | { ok: false; exitCode: 3; body: ProductionPilotReadinessV1 };

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function parseIntent(raw: string | undefined): PilotIntent {
  if (!raw || raw === "existing") {
    return "EXISTING_ORGANIZATION";
  }
  if (raw === "new") {
    return "NEW_ORGANIZATION";
  }
  throw new Error("invalid_intent");
}

export function runPilotPreflightCli(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): PilotPreflightCliResult {
  const json = argv.includes("--json");
  try {
    if (!PILOT_INTENTS.includes(parseIntent(readFlag(argv, "intent")))) {
      throw new Error("invalid_intent");
    }
    const nextEnv: NodeJS.ProcessEnv = { ...env };
    const cloudRoot = readFlag(argv, "cloud-root");
    const backupRoot = readFlag(argv, "backup-root");
    const staticRoot = readFlag(argv, "static-root");
    const publicOrigin = readFlag(argv, "public-origin");
    if (cloudRoot) {
      nextEnv.WORKOS_CLOUD_ROOT = cloudRoot;
    }
    if (backupRoot) {
      nextEnv.WORKOS_BACKUP_ROOT = backupRoot;
    }
    if (staticRoot) {
      nextEnv.WORKOS_STATIC_ROOT = staticRoot;
    }
    if (publicOrigin) {
      nextEnv.WORKOS_PUBLIC_ORIGIN = publicOrigin;
    }
    delete nextEnv.WORKOS_SQLITE_PATH;
    const result = evaluateProductionPilotReadiness({
      env: nextEnv,
      intent: parseIntent(readFlag(argv, "intent")),
    });
    const text = json ? `${JSON.stringify(result)}\n` : formatPilotPreflightHuman(result);
    process.stdout.write(text);
    return { ok: true, exitCode: pilotPreflightExitCode(result), result };
  } catch {
    const body: ProductionPilotReadinessV1 = {
      contractVersion: "production-pilot-readiness-v1",
      overallStatus: "BLOCKED",
      pilotIntent: "EXISTING_ORGANIZATION",
      checks: [
        {
          id: "inspection_error",
          status: "BLOCKED",
          summary: "Preflight inspection failed closed.",
          safeDetail: "INSPECTION_ERROR",
        },
      ],
      blockers: ["inspection_error"],
      advisories: [],
      backupProcedureSupported: "NO",
      restoreValidationSupported: "NO",
      productionOrgProvisioning: "NOT_READY",
      primaryUserJourneyContract: "BROKEN",
    };
    const text = json ? `${JSON.stringify(body)}\n` : formatPilotPreflightHuman(body);
    process.stdout.write(text);
    return { ok: false, exitCode: 3, body };
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("pilotPreflightCli.ts")
  : false;

if (invokedDirectly) {
  const outcome = runPilotPreflightCli();
  process.exitCode = outcome.exitCode;
}
