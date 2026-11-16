import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openControlPlaneDatabase, resolveControlPlaneSqlitePath } from "../persistence/controlPlaneSqlite.js";
import { issuePlatformRecovery } from "./accessLifecycle.js";
import { createControlPlane } from "./controlPlane.js";
import { rejectArgvPassword } from "./devProvisionCli.js";

/**
 * V1 Organization Access · D7 pilot-only, platform-assisted recovery.
 *
 * The platform operator verifies the person's identity OUTSIDE the application (pilot procedure),
 * then issues a one-time, 1-hour reset link and hands it directly to that person. The operator
 * never sees or sets a password; the organization owner never sees the link. Audited as
 * `credential.recovery_issued_by_platform`. Not a normal mechanism for commercial SaaS
 * (SAAS_COMMERCIAL_ACCESS_GATE).
 */
export class IssuePasswordRecoveryError extends Error {
  constructor(readonly code: "confirm_required" | "root_missing" | "origin_required" | "user_missing" | "user_disabled") {
    super(code);
    this.name = "IssuePasswordRecoveryError";
  }
}

function readArg(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : "";
}

export function runIssuePasswordRecovery(argv: readonly string[] = process.argv): { link: string; expiresInMinutes: number } {
  rejectArgvPassword(argv);
  if (!argv.includes("--confirm-controlled-access-change")) throw new IssuePasswordRecoveryError("confirm_required");
  const root = readArg(argv, "root");
  const email = readArg(argv, "email");
  const origin = readArg(argv, "public-origin").replace(/\/$/, "");
  if (!/^https?:\/\/[^/\s]+$/.test(origin)) throw new IssuePasswordRecoveryError("origin_required");
  const sqlitePath = resolveControlPlaneSqlitePath(root);
  if (!root || !existsSync(sqlitePath)) throw new IssuePasswordRecoveryError("root_missing");
  const controlPlane = createControlPlane(openControlPlaneDatabase(sqlitePath), root);
  try {
    const result = issuePlatformRecovery(controlPlane, { email });
    if (!result.ok) throw new IssuePasswordRecoveryError(result.error === "user_disabled" ? "user_disabled" : "user_missing");
    return {
      link: `${origin}/resetare-parola#t=${encodeURIComponent(result.value.rawToken)}`,
      expiresInMinutes: result.value.expiresInMinutes,
    };
  } finally {
    controlPlane.close();
  }
}

const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].replaceAll("\\", "/").endsWith("issuePasswordRecoveryCli.ts")
  : false;

if (invokedDirectly) {
  const issued = runIssuePasswordRecovery();
  // Shown only to the platform operator. Hand it directly to the verified person; do not paste it
  // into tickets, chats or logs.
  console.log(`expiresInMinutes: ${issued.expiresInMinutes}`);
  console.log(`link: ${issued.link}`);
}
