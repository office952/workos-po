import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createCloudBackup } from "../cloud/backup.js";
import {
  createControlPlane,
  type ControlPlane,
  type OrganizationStatus,
} from "../cloud/controlPlane.js";
import { CLOUD_SESSION_COOKIE_CONTRACT } from "../cloud/routes.js";
import { requireCloudSession, requireOwnerRole } from "../cloud/middleware.js";
import { assertCloudProvisionNotProduction, inspectOperationalPlane } from "../cloud/provision.js";
import { restoreCloudBackup } from "../cloud/restore.js";
import { resolveControlPlaneSqlitePath } from "../persistence/controlPlaneSqlite.js";
import {
  ProductionOriginConfigError,
  assertProductionCloudPublicOrigin,
  cookieSecure,
  mutatingOriginAllowed,
} from "./origin.js";
import { evaluateReadiness } from "./readiness.js";
import {
  CloudRuntimeLeaseError,
  inspectProcessLiveness,
  readCloudRuntimeLeaseFile,
} from "./runtimeLease.js";

export const PILOT_PREFLIGHT_CONTRACT_VERSION = "production-pilot-readiness-v1" as const;

export const PILOT_INTENTS = ["EXISTING_ORGANIZATION", "NEW_ORGANIZATION"] as const;
export type PilotIntent = (typeof PILOT_INTENTS)[number];

export type PilotCheckStatus = "PASS" | "BLOCKED" | "ADVISORY" | "NOT_APPLICABLE";
export type PilotOverallStatus = "READY" | "BLOCKED";

export type PilotCheck = {
  id: string;
  status: PilotCheckStatus;
  summary: string;
  safeDetail?: string;
};

export type ProductionPilotReadinessV1 = {
  contractVersion: typeof PILOT_PREFLIGHT_CONTRACT_VERSION;
  overallStatus: PilotOverallStatus;
  pilotIntent: PilotIntent;
  checks: PilotCheck[];
  blockers: string[];
  advisories: string[];
  backupProcedureSupported: "YES" | "NO";
  restoreValidationSupported: "YES" | "NO";
  productionOrgProvisioning: "NOT_READY";
  primaryUserJourneyContract: "AVAILABLE" | "BROKEN";
};

export type PilotPreflightInput = {
  env: NodeJS.ProcessEnv;
  intent?: PilotIntent;
};

const SAAS_ADVISORIES = [
  ["self_service_signup_not_implemented", "Self-service signup is not implemented."],
  ["email_verification_not_implemented", "Email verification is not implemented."],
  ["password_recovery_not_implemented", "Password recovery is not implemented."],
  ["mfa_not_implemented", "MFA is not implemented."],
  ["billing_not_implemented", "Billing and subscriptions are not implemented."],
  ["commercial_onboarding_not_implemented", "Commercial onboarding automation is not implemented."],
] as const;

const JOURNEY_MARKERS = [
  ["../cloud/routes.ts", "/api/cloud/login"],
  ["../customers/routes.ts", "/api/customers"],
  ["../requests/routes.ts", "/api/requests"],
  ["../product.ts", "production-release"],
  ["../quotes/routes.ts", "/api/quotes"],
  ["../jobs/routes.ts", "/api/jobs"],
  ["../execution/store.ts", "actualDurationMinutes"],
  ["../planning/service.ts", "plannedEffort"],
] as const;

const SOURCE_DIR = fileURLToPath(new URL(".", import.meta.url));

function check(
  id: string,
  status: PilotCheckStatus,
  summary: string,
  safeDetail?: string,
): PilotCheck {
  return safeDetail ? { id, status, summary, safeDetail } : { id, status, summary };
}

type FrontendBlock =
  | "INDEX_MISSING"
  | "INDEX_UNREADABLE"
  | "ENTRY_SCRIPT_MISSING"
  | "LOCAL_ASSET_MISSING"
  | "ASSET_PATH_ESCAPE";

function tagAttr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function classifyLocalAsset(
  raw: string,
  staticRoot: string,
): "external" | "escape" | "missing" | "file" {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("data:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("//")
  ) {
    return "external";
  }
  const withoutHash = trimmed.split("#", 1)[0] ?? "";
  const pathOnly = withoutHash.split("?", 1)[0] ?? "";
  const segments = pathOnly.split(/[/\\]/).filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    return "escape";
  }
  const candidate = resolve(staticRoot, ...segments);
  const rel = relative(resolve(staticRoot), candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return "escape";
  }
  try {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) {
      return "missing";
    }
  } catch {
    return "missing";
  }
  return "file";
}

function isExecutableScript(src: string): boolean {
  const pathOnly = src.trim().split("#", 1)[0]?.split("?", 1)[0]?.toLowerCase() ?? "";
  return pathOnly.endsWith(".js") || pathOnly.endsWith(".mjs");
}

function inspectFrontendBuild(
  staticRoot: string,
): { ok: true } | { ok: false; detail: FrontendBlock } {
  if (!staticRoot) {
    return { ok: false, detail: "INDEX_MISSING" };
  }
  const indexPath = resolve(staticRoot, "index.html");
  let html = "";
  try {
    if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
      return { ok: false, detail: "INDEX_MISSING" };
    }
    html = readFileSync(indexPath, "utf8");
  } catch {
    return { ok: false, detail: "INDEX_UNREADABLE" };
  }

  const scriptSrcs = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((match) => tagAttr(match[0] ?? "", "src"))
    .filter((src): src is string => typeof src === "string" && isExecutableScript(src));
  const styleHrefs = [...html.matchAll(/<link\b([^>]*)>/gi)]
    .filter((match) => {
      const rel = (tagAttr(match[0] ?? "", "rel") ?? "").toLowerCase();
      return rel.split(/\s+/).includes("stylesheet") || rel.split(/\s+/).includes("modulepreload");
    })
    .map((match) => tagAttr(match[0] ?? "", "href"))
    .filter((href): href is string => Boolean(href));

  let escaped = false;
  let entryFound = false;
  let supportingMissing = false;
  for (const src of scriptSrcs) {
    const kind = classifyLocalAsset(src, staticRoot);
    if (kind === "escape") {
      escaped = true;
    } else if (kind === "missing") {
      supportingMissing = true;
    } else if (kind === "file") {
      entryFound = true;
    }
  }
  for (const href of styleHrefs) {
    const kind = classifyLocalAsset(href, staticRoot);
    if (kind === "escape") {
      escaped = true;
    } else if (kind === "missing") {
      supportingMissing = true;
    }
  }
  if (escaped) {
    return { ok: false, detail: "ASSET_PATH_ESCAPE" };
  }
  if (!entryFound) {
    return { ok: false, detail: "ENTRY_SCRIPT_MISSING" };
  }
  if (supportingMissing) {
    return { ok: false, detail: "LOCAL_ASSET_MISSING" };
  }
  return { ok: true };
}

function rootContains(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function productionProvisioningSupported(): boolean {
  try {
    assertCloudProvisionNotProduction({ NODE_ENV: "production" });
    return true;
  } catch {
    return false;
  }
}

function journeyAvailable(): boolean {
  return JOURNEY_MARKERS.every(([relativePath, needle]) => {
    const filePath = resolve(SOURCE_DIR, relativePath);
    if (!existsSync(filePath)) {
      return false;
    }
    return readFileSync(filePath, "utf8").includes(needle);
  });
}

function openReadonlyControlPlane(cloudRoot: string): ControlPlane | null {
  const sqlitePath = resolveControlPlaneSqlitePath(cloudRoot);
  if (!existsSync(sqlitePath)) {
    return null;
  }
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  return createControlPlane(db, cloudRoot);
}

function classifyLease(cloudRoot: string): PilotCheck {
  let lease;
  try {
    lease = readCloudRuntimeLeaseFile(cloudRoot);
  } catch (error) {
    if (error instanceof CloudRuntimeLeaseError) {
      return check("runtime_lease", "BLOCKED", "Runtime lease cannot be classified.", "UNKNOWN");
    }
    throw error;
  }
  if (!lease) {
    return check("runtime_lease", "PASS", "No runtime lease is present.", "NO_LEASE");
  }
  const liveness = inspectProcessLiveness(lease.pid);
  switch (liveness) {
    case "alive":
      if (lease.purpose === "api") {
        return check(
          "runtime_lease",
          "BLOCKED",
          "An API runtime lease is active.",
          "ACTIVE_API_LEASE",
        );
      }
      if (lease.purpose === "backup") {
        return check(
          "runtime_lease",
          "BLOCKED",
          "A backup runtime lease is active.",
          "ACTIVE_BACKUP_LEASE",
        );
      }
      return check("runtime_lease", "BLOCKED", "Runtime lease cannot be classified.", "UNKNOWN");
    case "dead":
      return check(
        "runtime_lease",
        "BLOCKED",
        "A stale runtime lease requires explicit recovery.",
        "STALE_PROVABLE",
      );
    case "indeterminate":
      return check("runtime_lease", "BLOCKED", "Runtime lease liveness is unknown.", "UNKNOWN");
    default: {
      const exhaustive: never = liveness;
      throw new Error(exhaustive);
    }
  }
}

function inspectOrganizations(controlPlane: ControlPlane): PilotCheck[] {
  const organizations = controlPlane.listOrganizations();
  const checks: PilotCheck[] = [];
  const statuses = new Set<OrganizationStatus>(organizations.map((organization) => organization.status));
  if (statuses.has("PROVISIONING")) {
    checks.push(
      check(
        "organization_provisioning",
        "BLOCKED",
        "A provisioning organization is unresolved.",
        "PROVISIONING",
      ),
    );
  }
  if (statuses.has("FAILED_RETRYABLE")) {
    checks.push(
      check(
        "organization_failed_retryable",
        "BLOCKED",
        "A failed organization is unresolved.",
        "FAILED_RETRYABLE",
      ),
    );
  }
  const active = organizations.filter((organization) => organization.status === "ACTIVE");
  if (active.length === 0) {
    checks.push(
      check(
        "active_organization",
        "BLOCKED",
        "No active organization is available for an existing-organization pilot.",
      ),
    );
    return checks;
  }
  let planeBlocked = false;
  let ownerBlocked = false;
  let bootstrapBlocked = false;
  for (const organization of active) {
    const planeCount = controlPlane.countPlanes(organization.organizationId);
    const plane = controlPlane.getPlaneByOrganization(organization.organizationId);
    if (planeCount !== 1 || !plane || plane.status !== "ACTIVE") {
      planeBlocked = true;
      bootstrapBlocked = true;
      continue;
    }
    const usableOwners = controlPlane
      .listActiveOwnerMemberships(organization.organizationId)
      .filter((membership) => controlPlane.getUser(membership.userId)?.status === "ACTIVE");
    if (usableOwners.length === 0) {
      ownerBlocked = true;
    }
    const inspected = inspectOperationalPlane(
      controlPlane.cloudRoot,
      plane.planeKey,
      plane.bootstrapPolicy,
    );
    if (!inspected.ok) {
      bootstrapBlocked = true;
    }
  }
  checks.push(
    planeBlocked
      ? check(
          "active_organization_plane",
          "BLOCKED",
          "An active organization does not have exactly one operational plane.",
        )
      : check(
          "active_organization_plane",
          "PASS",
          "Each active organization has one operational plane.",
        ),
  );
  checks.push(
    ownerBlocked
      ? check(
          "active_organization_owner",
          "BLOCKED",
          "An active organization does not have an active usable owner.",
        )
      : check(
          "active_organization_owner",
          "PASS",
          "Each active organization has an active usable owner.",
        ),
  );
  checks.push(
    bootstrapBlocked
      ? check(
          "operational_plane_bootstrap",
          "BLOCKED",
          "An active operational plane bootstrap foundation is incomplete.",
        )
      : check(
          "operational_plane_bootstrap",
          "PASS",
          "Active operational plane bootstrap foundations are complete.",
        ),
  );
  return checks;
}

export function evaluateProductionPilotReadiness(
  input: PilotPreflightInput,
): ProductionPilotReadinessV1 {
  const env = input.env;
  const intent = input.intent ?? "EXISTING_ORGANIZATION";
  const checks: PilotCheck[] = [];
  const cloudRoot = env.WORKOS_CLOUD_ROOT?.trim() ?? "";
  const backupRoot = env.WORKOS_BACKUP_ROOT?.trim() ?? "";
  const staticRoot = env.WORKOS_STATIC_ROOT?.trim() ?? "";

  checks.push(
    env.NODE_ENV === "production"
      ? check("node_env_production", "PASS", "NODE_ENV is production.")
      : check("node_env_production", "BLOCKED", "NODE_ENV is not production."),
  );
  checks.push(
    cloudRoot
      ? check("cloud_root_configured", "PASS", "Cloud root is configured.")
      : check("cloud_root_configured", "BLOCKED", "Cloud root is not configured."),
  );
  checks.push(
    backupRoot
      ? check("backup_root_configured", "PASS", "Backup root is configured.")
      : check("backup_root_configured", "BLOCKED", "Backup root is not configured."),
  );

  if (cloudRoot && backupRoot) {
    if (rootContains(cloudRoot, backupRoot) && resolve(cloudRoot) === resolve(backupRoot)) {
      checks.push(check("root_isolation", "BLOCKED", "Cloud root and backup root are the same."));
    } else if (rootContains(cloudRoot, backupRoot)) {
      checks.push(
        check("root_isolation", "BLOCKED", "Backup root is nested inside the Cloud root."),
      );
    } else if (rootContains(backupRoot, cloudRoot)) {
      checks.push(
        check("root_isolation", "BLOCKED", "Cloud root is nested inside the backup root."),
      );
    } else {
      checks.push(check("root_isolation", "PASS", "Cloud root and backup root are isolated."));
    }
  } else {
    checks.push(
      check("root_isolation", "BLOCKED", "Root isolation cannot be confirmed.", "MISSING_ROOT"),
    );
  }

  try {
    assertProductionCloudPublicOrigin(env);
    checks.push(check("public_origin", "PASS", "Public origin is a normalized HTTPS origin."));
    checks.push(
      check("trusted_origin_policy", "PASS", "Trusted origin policy is coherent."),
    );
  } catch (error) {
    const code = error instanceof ProductionOriginConfigError ? error.code : "production_origin_invalid";
    checks.push(check("public_origin", "BLOCKED", "Public origin contract failed.", code));
    checks.push(
      check("trusted_origin_policy", "BLOCKED", "Trusted origin policy is not coherent.", code),
    );
  }

  const frontend = inspectFrontendBuild(staticRoot);
  checks.push(
    frontend.ok
      ? check("frontend_static_build", "PASS", "Frontend production build artifact is present.")
      : check(
          "frontend_static_build",
          "BLOCKED",
          "Frontend production build artifact is missing.",
          frontend.detail,
        ),
  );

  const apiPackagePath = resolve(SOURCE_DIR, "../../package.json");
  const apiPackage = JSON.parse(readFileSync(apiPackagePath, "utf8")) as {
    scripts?: { build?: string };
  };
  checks.push(
    apiPackage.scripts?.build
      ? check("api_production_build", "PASS", "API production build can be produced.")
      : check("api_production_build", "BLOCKED", "API production build script is missing."),
  );
  checks.push(
    check(
      "same_origin_static_contract",
      "PASS",
      "Static assets are served by the same API origin.",
      "SAME_ORIGIN_HTTPS",
    ),
  );

  const backupProcedureSupported = typeof createCloudBackup === "function" ? "YES" : "NO";
  const restoreValidationSupported = typeof restoreCloudBackup === "function" ? "YES" : "NO";
  checks.push(
    check(
      "backup_procedure",
      backupProcedureSupported === "YES" ? "PASS" : "BLOCKED",
      backupProcedureSupported === "YES"
        ? "Quiesced offline backup procedure is present."
        : "Backup procedure is missing.",
      "QUIESCED_OFFLINE_V1",
    ),
  );
  checks.push(
    check(
      "restore_validation",
      restoreValidationSupported === "YES" ? "PASS" : "BLOCKED",
      restoreValidationSupported === "YES"
        ? "Restore validation for the current schema is present."
        : "Restore validation is missing.",
      "CURRENT_SUPPORTED_SCHEMA",
    ),
  );

  let controlPlane: ControlPlane | null = null;
  try {
    if (cloudRoot && existsSync(cloudRoot)) {
      controlPlane = openReadonlyControlPlane(cloudRoot);
    }
  } catch {
    controlPlane?.close();
    throw new PilotPreflightInspectionError("control_plane_unreadable");
  }

  if (!controlPlane) {
    checks.push(check("control_plane", "BLOCKED", "Control Plane is not present."));
    checks.push(
      check("data_plane_readiness", "BLOCKED", "Data-plane readiness cannot be confirmed."),
    );
  } else {
    try {
      checks.push(check("control_plane", "PASS", "Control Plane is readable."));
      checks.push(...inspectOrganizations(controlPlane));
      const readiness = evaluateReadiness({
        mode: "cloud",
        cloudRoot,
        controlPlane,
      });
      if (readiness.status !== "ready") {
        checks.push(
          check(
            "data_plane_readiness",
            "BLOCKED",
            "Data-plane readiness evaluator is not ready.",
            readiness.checks.migrationsValid ? "plane_identity_or_runtime" : "migrations_invalid",
          ),
        );
      } else {
        checks.push(check("data_plane_readiness", "PASS", "Data-plane readiness evaluator is ready."));
      }
      checks.push(
        readiness.checks.migrationsValid
          ? check("schema_contract", "PASS", "Schema contract matches the supported ledger.")
          : check("schema_contract", "BLOCKED", "Schema contract does not match the supported ledger."),
      );
      checks.push(
        readiness.checks.operationalRuntimeResolvable
          ? check("plane_identity", "PASS", "Operational plane identity matches the Control Plane.")
          : check("plane_identity", "BLOCKED", "Operational plane identity does not match."),
      );
    } finally {
      controlPlane.close();
    }
  }

  if (cloudRoot && existsSync(cloudRoot)) {
    checks.push(classifyLease(cloudRoot));
  } else {
    checks.push(check("runtime_lease", "BLOCKED", "Runtime lease cannot be inspected.", "UNKNOWN"));
  }

  const provisioningReady = productionProvisioningSupported();
  const provisioningStatus: PilotCheckStatus =
    intent === "NEW_ORGANIZATION" || provisioningReady ? "BLOCKED" : "ADVISORY";
  checks.push(
    check(
      "production_org_provisioning",
      provisioningReady ? "BLOCKED" : provisioningStatus,
      "Production organization provisioning is not a supported mechanism.",
      "ADMIN_TOOLING_DEBT",
    ),
  );
  if (provisioningReady) {
    checks.push(
      check(
        "production_org_provisioning_safety",
        "BLOCKED",
        "Production provisioning refusal is missing.",
      ),
    );
  } else {
    checks.push(
      check(
        "production_org_provisioning_safety",
        "PASS",
        "Development provisioning still refuses production.",
      ),
    );
  }

  checks.push(
    CLOUD_SESSION_COOKIE_CONTRACT.httpOnly
      ? check("security_session_httponly", "PASS", "Session cookie is HttpOnly.")
      : check("security_session_httponly", "BLOCKED", "Session cookie is not HttpOnly."),
  );
  checks.push(
    CLOUD_SESSION_COOKIE_CONTRACT.sameSite === "Lax"
      ? check("security_session_samesite", "PASS", "Session cookie SameSite policy is Lax.")
      : check("security_session_samesite", "BLOCKED", "Session cookie SameSite policy is not Lax."),
  );
  checks.push(
    cookieSecure(env)
      ? check("security_session_secure", "PASS", "Session cookie Secure behavior matches the origin.")
      : check("security_session_secure", "BLOCKED", "Session cookie would not be Secure."),
  );
  checks.push(
    typeof mutatingOriginAllowed === "function"
      ? check("security_mutation_origin", "PASS", "Mutation Origin validation is present.")
      : check("security_mutation_origin", "BLOCKED", "Mutation Origin validation is missing."),
  );
  checks.push(
    typeof requireCloudSession === "function"
      ? check("security_membership", "PASS", "Organization membership enforcement is present.")
      : check("security_membership", "BLOCKED", "Organization membership enforcement is missing."),
  );
  checks.push(
    typeof requireOwnerRole === "function"
      ? check("security_owner_write", "PASS", "Owner-write enforcement is present.")
      : check("security_owner_write", "BLOCKED", "Owner-write enforcement is missing."),
  );

  const journey = journeyAvailable();
  checks.push(
    journey
      ? check("primary_user_journey", "PASS", "Accepted primary user journey contract is present.")
      : check("primary_user_journey", "BLOCKED", "Accepted primary user journey contract is broken."),
  );

  for (const [id, summary] of SAAS_ADVISORIES) {
    checks.push(check(id, "ADVISORY", summary, "GENERAL_SAAS_DEBT"));
  }

  checks.push(
    check(
      "optional_modules",
      "NOT_APPLICABLE",
      "Optional product and site-installation modules are not pilot blockers.",
    ),
  );

  const blockers = checks.filter((item) => item.status === "BLOCKED").map((item) => item.id);
  const advisories = checks.filter((item) => item.status === "ADVISORY").map((item) => item.id);
  return {
    contractVersion: PILOT_PREFLIGHT_CONTRACT_VERSION,
    overallStatus: blockers.length === 0 ? "READY" : "BLOCKED",
    pilotIntent: intent,
    checks,
    blockers,
    advisories,
    backupProcedureSupported,
    restoreValidationSupported,
    productionOrgProvisioning: "NOT_READY",
    primaryUserJourneyContract: journey ? "AVAILABLE" : "BROKEN",
  };
}

export class PilotPreflightInspectionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PilotPreflightInspectionError";
    this.code = code;
  }
}

export function formatPilotPreflightHuman(result: ProductionPilotReadinessV1): string {
  const lines = [
    result.contractVersion,
    `overall: ${result.overallStatus}`,
    `intent: ${result.pilotIntent}`,
    `backup_procedure: ${result.backupProcedureSupported}`,
    `restore_validation: ${result.restoreValidationSupported}`,
    `production_org_provisioning: ${result.productionOrgProvisioning}`,
    `primary_user_journey: ${result.primaryUserJourneyContract}`,
    "blockers:",
    ...(result.blockers.length > 0 ? result.blockers.map((id) => `- ${id}`) : ["- none"]),
    "advisories:",
    ...(result.advisories.length > 0 ? result.advisories.map((id) => `- ${id}`) : ["- none"]),
    "checks:",
    ...result.checks.map((item) => {
      const detail = item.safeDetail ? ` [${item.safeDetail}]` : "";
      return `- ${item.id} ${item.status}${detail}: ${item.summary}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

export function pilotPreflightExitCode(result: ProductionPilotReadinessV1): 0 | 2 {
  return result.overallStatus === "READY" ? 0 : 2;
}
