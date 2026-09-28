import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  buildOwnerReviewIdentityFile,
  isOwnerReviewIdentity,
  OWNER_REVIEW_BOOTSTRAP_POLICY,
  OWNER_REVIEW_DEFAULT_PASSWORD,
  OWNER_REVIEW_ORG_NAME,
  type OwnerReviewIdentityFile,
} from "./ownerReviewIdentity.js";
import { openProvisionedControlPlane, provisionNewOrganization } from "./provision.js";
import { ensureOwnerReviewUsers } from "./ownerReviewUsers.js";

export const OWNER_REVIEW_IDENTITY_FILENAME = ".reference-identity.json";
export const SYNTHETIC_REFERENCE_MARKER = "SYNTHETIC_REFERENCE";

const MARKER_BODY = [
  "SYNTHETIC_REFERENCE_DATA=YES",
  "REAL_DATA=NO",
  "REAL_HUB_MEDIA=NO",
  "CLASSIFICATION=SYNTHETIC_REFERENCE",
  "",
].join("\n");

export type OwnerReviewResetRefusal =
  | "production_refused"
  | "root_unclassified"
  | "synthetic_marker_required"
  | "identity_missing"
  | "identity_not_owner_review"
  | "plane_not_synthetic"
  | "org_id_selector_forbidden"
  | "arbitrary_org_forbidden";

export class OwnerReviewResetError extends Error {
  readonly code: OwnerReviewResetRefusal;

  constructor(code: OwnerReviewResetRefusal, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "OwnerReviewResetError";
    this.code = code;
  }
}

export function identityPath(root: string): string {
  return join(root, OWNER_REVIEW_IDENTITY_FILENAME);
}

export function markerPath(root: string): string {
  return join(root, SYNTHETIC_REFERENCE_MARKER);
}

export function hasSyntheticReferenceMarker(root: string): boolean {
  const path = markerPath(root);
  if (!existsSync(path)) {
    return false;
  }
  try {
    return readFileSync(path, "utf8").includes("SYNTHETIC_REFERENCE");
  } catch {
    return false;
  }
}

function looksLikeBusinessStorage(root: string): boolean {
  return (
    existsSync(join(root, "control", "control-plane.sqlite")) ||
    existsSync(join(root, "organizations")) ||
    existsSync(join(root, "product-system.sqlite"))
  );
}

export function classifyOwnerReviewRoot(
  root: string,
): "ABSENT" | "SYNTHETIC_REFERENCE" | "UNCLASSIFIED_BUSINESS_STORAGE" | "EMPTY_OR_UNKNOWN" {
  const resolved = resolve(root);
  if (!existsSync(resolved)) {
    return "ABSENT";
  }
  if (hasSyntheticReferenceMarker(resolved)) {
    return "SYNTHETIC_REFERENCE";
  }
  if (looksLikeBusinessStorage(resolved)) {
    return "UNCLASSIFIED_BUSINESS_STORAGE";
  }
  return "EMPTY_OR_UNKNOWN";
}

export function readOwnerReviewIdentity(root: string): OwnerReviewIdentityFile | null {
  const path = identityPath(root);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isOwnerReviewIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeOwnerReviewIdentity(
  root: string,
  identity: OwnerReviewIdentityFile,
): void {
  writeFileSync(identityPath(root), `${JSON.stringify(identity, null, 2)}\n`);
}

function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production") {
    throw new OwnerReviewResetError("production_refused");
  }
}

/**
 * True only for an existing directory with zero entries.
 * ABSENT paths are not empty directories. EMPTY_OR_UNKNOWN may be nonempty.
 */
export function isTrulyEmptyOwnerReviewRoot(root: string): boolean {
  const resolved = resolve(root);
  if (!existsSync(resolved)) {
    return false;
  }
  return readdirSync(resolved).length === 0;
}

/**
 * Non-destructive provision may create/mark ABSENT or truly empty unmarked roots.
 * Existing nonempty unmarked directories and unclassified business storage are refused.
 * Do not infer safety from EMPTY_OR_UNKNOWN alone.
 */
function assertProvisionableRoot(root: string): void {
  const classification = classifyOwnerReviewRoot(root);
  switch (classification) {
    case "ABSENT":
    case "SYNTHETIC_REFERENCE":
      return;
    case "EMPTY_OR_UNKNOWN":
      if (!isTrulyEmptyOwnerReviewRoot(root)) {
        throw new OwnerReviewResetError(
          "root_unclassified",
          "Provisioning refuses nonempty unmarked directories",
        );
      }
      return;
    case "UNCLASSIFIED_BUSINESS_STORAGE":
      throw new OwnerReviewResetError("root_unclassified");
    default: {
      const _exhaustive: never = classification;
      throw new OwnerReviewResetError("root_unclassified", String(_exhaustive));
    }
  }
}

/**
 * Destructive reset requires proven synthetic ownership before any wipe.
 * ABSENT may proceed as create-only (wipe is a no-op).
 * EMPTY_OR_UNKNOWN (empty or nonempty unmarked) and unclassified storage refuse.
 */
function assertResettableRoot(root: string): "ABSENT" | "SYNTHETIC_REFERENCE" {
  const classification = classifyOwnerReviewRoot(root);
  switch (classification) {
    case "ABSENT":
    case "SYNTHETIC_REFERENCE":
      return classification;
    case "UNCLASSIFIED_BUSINESS_STORAGE":
      throw new OwnerReviewResetError("root_unclassified");
    case "EMPTY_OR_UNKNOWN":
      throw new OwnerReviewResetError(
        "synthetic_marker_required",
        "Reset requires a proven SYNTHETIC_REFERENCE marker before any destructive wipe",
      );
    default: {
      const _exhaustive: never = classification;
      throw new OwnerReviewResetError("root_unclassified", String(_exhaustive));
    }
  }
}

function isLegacySyntheticIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.classification === "SYNTHETIC_REFERENCE" &&
    record.SYNTHETIC_REFERENCE_DATA === "YES" &&
    record.REAL_DATA === "NO"
  );
}

function assertPlaneSyntheticIfPresent(root: string, requireSyntheticPlane: boolean): void {
  if (!requireSyntheticPlane) {
    return;
  }
  const controlPath = join(root, "control", "control-plane.sqlite");
  if (!existsSync(controlPath)) {
    return;
  }
  const controlPlane = openProvisionedControlPlane(root);
  try {
    for (const organization of controlPlane.listOrganizations()) {
      const plane = controlPlane.getPlaneByOrganization(organization.organizationId);
      if (!plane) {
        continue;
      }
      if (plane.bootstrapPolicy !== OWNER_REVIEW_BOOTSTRAP_POLICY) {
        throw new OwnerReviewResetError(
          "plane_not_synthetic",
          `${organization.displayName}:${plane.bootstrapPolicy}`,
        );
      }
    }
  } finally {
    controlPlane.close();
  }
}

/**
 * Fail-closed reset of the isolated Owner reference Cloud root.
 * Never accepts arbitrary organization id/name selectors.
 */
export async function resetOwnerReviewRoot(input: {
  cloudRoot: string;
  password?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Forbidden selectors — any truthy value causes hard refusal.
   * Kept as explicit parameters so callers cannot silently bypass.
   */
  organizationId?: string;
  organizationName?: string;
  allOrganizations?: boolean;
}): Promise<{
  cloudRoot: string;
  organizationId: string;
  identity: OwnerReviewIdentityFile;
  users: Awaited<ReturnType<typeof ensureOwnerReviewUsers>>;
}> {
  const env = input.env ?? process.env;
  assertNotProduction(env);
  if (input.organizationId) {
    throw new OwnerReviewResetError("org_id_selector_forbidden");
  }
  if (input.organizationName && input.organizationName !== OWNER_REVIEW_ORG_NAME) {
    throw new OwnerReviewResetError("arbitrary_org_forbidden", input.organizationName);
  }
  if (input.allOrganizations) {
    throw new OwnerReviewResetError("arbitrary_org_forbidden", "all");
  }

  const root = resolve(input.cloudRoot);
  // Validate classification BEFORE any destructive call.
  assertResettableRoot(root);

  const existingIdentityRaw = existsSync(identityPath(root))
    ? (() => {
        try {
          return JSON.parse(readFileSync(identityPath(root), "utf8")) as unknown;
        } catch {
          return null;
        }
      })()
    : null;
  const existingIdentity = isOwnerReviewIdentity(existingIdentityRaw)
    ? existingIdentityRaw
    : null;

  if (existsSync(join(root, "control", "control-plane.sqlite"))) {
    if (!existingIdentityRaw) {
      throw new OwnerReviewResetError("identity_missing");
    }
    if (!existingIdentity && !isLegacySyntheticIdentity(existingIdentityRaw)) {
      throw new OwnerReviewResetError("identity_not_owner_review");
    }
    // OWNER_REVIEW_V1 roots must already be SYNTHETIC_TEST.
    // Narrow legacy exception: a proven SYNTHETIC_REFERENCE marker plus a
    // pre-OWNER_REVIEW_V1 synthetic identity may still be wiped/upgraded even
    // when the plane was provisioned as NEW_ORGANIZATION.
    assertPlaneSyntheticIfPresent(root, Boolean(existingIdentity));
  }

  // Defense in depth: wipe refuses unless marker is present (ABSENT is a no-op).
  wipeSyntheticRootContents(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(markerPath(root), MARKER_BODY);

  const password = input.password ?? OWNER_REVIEW_DEFAULT_PASSWORD;
  const provisioned = await provisionNewOrganization({
    cloudRoot: root,
    displayName: OWNER_REVIEW_ORG_NAME,
    email: buildOwnerReviewIdentityFile(password).email,
    password,
    bootstrapPolicy: OWNER_REVIEW_BOOTSTRAP_POLICY,
    env,
  });

  const identity = buildOwnerReviewIdentityFile(
    password,
    provisioned.organization.organizationId,
  );
  writeOwnerReviewIdentity(root, identity);

  const users = await ensureOwnerReviewUsers({ cloudRoot: root, password });
  return {
    cloudRoot: root,
    organizationId: provisioned.organization.organizationId,
    identity,
    users,
  };
}

function wipeSyntheticRootContents(root: string): void {
  if (!existsSync(root)) {
    return;
  }
  if (!hasSyntheticReferenceMarker(root)) {
    throw new OwnerReviewResetError(
      "synthetic_marker_required",
      "Destructive wipe requires a proven SYNTHETIC_REFERENCE marker",
    );
  }
  for (const entry of readdirSync(root)) {
    rmSync(join(root, entry), { recursive: true, force: true });
  }
}

/**
 * Ensures a fresh WorkOS Test org exists on an absent, truly empty, or marked
 * synthetic root without wiping when already correctly provisioned.
 * Never claims ownership of an existing nonempty unmarked directory.
 */
export async function ensureOwnerReviewProvisioned(input: {
  cloudRoot: string;
  password?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  cloudRoot: string;
  organizationId: string;
  identity: OwnerReviewIdentityFile;
  alreadyActive: boolean;
}> {
  const env = input.env ?? process.env;
  assertNotProduction(env);
  const root = resolve(input.cloudRoot);
  assertProvisionableRoot(root);
  mkdirSync(root, { recursive: true });
  if (!hasSyntheticReferenceMarker(root)) {
    writeFileSync(markerPath(root), MARKER_BODY);
  }

  const password = input.password ?? OWNER_REVIEW_DEFAULT_PASSWORD;
  const existing = readOwnerReviewIdentity(root);
  const controlExists = existsSync(join(root, "control", "control-plane.sqlite"));
  if (existing && controlExists) {
    if (!isOwnerReviewIdentity(existing)) {
      throw new OwnerReviewResetError("identity_not_owner_review");
    }
    assertPlaneSyntheticIfPresent(root, true);
    await ensureOwnerReviewUsers({ cloudRoot: root, password: existing.password });
    return {
      cloudRoot: root,
      organizationId: existing.organizationId ?? "",
      identity: existing,
      alreadyActive: true,
    };
  }
  if (controlExists && !existing) {
    throw new OwnerReviewResetError("identity_missing");
  }

  const provisioned = await provisionNewOrganization({
    cloudRoot: root,
    displayName: OWNER_REVIEW_ORG_NAME,
    email: buildOwnerReviewIdentityFile(password).email,
    password,
    bootstrapPolicy: OWNER_REVIEW_BOOTSTRAP_POLICY,
    env,
  });
  const identity = buildOwnerReviewIdentityFile(
    password,
    provisioned.organization.organizationId,
  );
  writeOwnerReviewIdentity(root, identity);
  await ensureOwnerReviewUsers({ cloudRoot: root, password });
  return {
    cloudRoot: root,
    organizationId: provisioned.organization.organizationId,
    identity,
    alreadyActive: provisioned.alreadyActive,
  };
}
