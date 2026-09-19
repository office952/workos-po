import { existsSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import {
  createControlPlane,
  type BootstrapPolicy,
  type CloudOrganization,
  type CloudUser,
  type ControlPlane,
  type MembershipRole,
  type OperationalPlaneDescriptor,
  normalizeEmail,
} from "./controlPlane.js";
import { derivePlanePaths } from "./paths.js";
import { resolveProviderRegistry } from "./bootstrapPolicy.js";
import { createProductSystemRuntime } from "../productSystem/runtime.js";
import {
  openControlPlaneDatabase,
  resolveControlPlaneSqlitePath,
} from "../persistence/controlPlaneSqlite.js";
import { assertCloudPassword, hashCloudPassword } from "./password.js";

export const NEW_ORGANIZATION_MARKERS = [
  "OPERATIONAL_SKILL_FOUNDATION_V1_APPLIED",
  "RESOURCE_COST_EVIDENCE_V1_APPLIED",
] as const;

const CLIENT_PROVISION_CODES = new Set([
  "already_active",
  "conflicting_membership",
  "conflicting_user",
  "email_mismatch",
  "incomplete_organization_exists",
  "multiple_incomplete_organizations",
  "organization_missing",
  "organization_not_resumable",
  "plane_incomplete",
  "plane_missing",
  "production_refused",
  "unexpected_plane_count",
]);

export type ProvisionFaultHook =
  | "before_control_plane_open"
  | "after_org_intent"
  | "after_plane_registration"
  | "during_operational_plane"
  | "after_operational_plane"
  | "during_user_hashing"
  | "after_user_insert"
  | "before_membership"
  | "after_membership_before_active";

export type ProvisionHooks = {
  fault?: ProvisionFaultHook;
};

export type ProvisionResult = {
  organization: CloudOrganization;
  plane: OperationalPlaneDescriptor;
  user: CloudUser;
  alreadyActive: boolean;
  paths: { sqlitePath: string; documentsRoot: string; planeRoot: string };
};

export type ProvisionInspection = {
  organization: CloudOrganization | null;
  plane: OperationalPlaneDescriptor | null;
  planeCount: number;
  userCount: number;
  membershipCount: number;
  operationalPlane:
    | { ok: true }
    | { ok: false; code: "plane_missing" | "plane_incomplete" };
};

export class ProvisionConflictError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "ProvisionConflictError";
    this.code = code;
    this.detail = detail;
  }
}

export function assertCloudProvisionNotProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === "production") {
    throw new ProvisionConflictError("production_refused");
  }
}

export function openProvisionedControlPlane(cloudRoot: string): ControlPlane {
  const db = openControlPlaneDatabase(resolveControlPlaneSqlitePath(cloudRoot));
  return createControlPlane(db, cloudRoot);
}

function triggerFault(hooks: ProvisionHooks | undefined, point: ProvisionFaultHook): void {
  if (hooks?.fault === point) {
    throw new ProvisionConflictError(`provision_fault:${point}`);
  }
}

export function isLegacyIncompleteActive(input: {
  status: CloudOrganization["status"];
  ownerMembershipCount: number;
}): boolean {
  return input.status === "ACTIVE" && input.ownerMembershipCount === 0;
}

export function isOrganizationResumeEligible(
  organization: CloudOrganization,
  controlPlane: ControlPlane,
): boolean {
  if (organization.status === "DISABLED") {
    return false;
  }
  if (organization.status === "PROVISIONING" || organization.status === "FAILED_RETRYABLE") {
    return true;
  }
  return isLegacyIncompleteActive({
    status: organization.status,
    ownerMembershipCount: controlPlane.countOwnerMemberships(organization.organizationId),
  });
}

export function listResumeEligibleOrganizations(controlPlane: ControlPlane): CloudOrganization[] {
  return controlPlane
    .listOrganizations()
    .filter((organization) => isOrganizationResumeEligible(organization, controlPlane));
}

function assertFreshCreateAllowed(controlPlane: ControlPlane, email: string): void {
  const eligible = listResumeEligibleOrganizations(controlPlane);
  if (eligible.length === 1) {
    throw new ProvisionConflictError("incomplete_organization_exists", eligible[0].organizationId);
  }
  if (eligible.length > 1) {
    throw new ProvisionConflictError(
      "multiple_incomplete_organizations",
      eligible.map((organization) => organization.organizationId).join(","),
    );
  }
  if (controlPlane.getUserByEmail(email)) {
    throw new ProvisionConflictError("conflicting_user");
  }
}

export function inspectOperationalPlane(
  cloudRoot: string,
  planeKey: string,
  bootstrapPolicy: BootstrapPolicy,
): { ok: true } | { ok: false; code: "plane_missing" | "plane_incomplete" } {
  const paths = derivePlanePaths(cloudRoot, planeKey);
  if (!existsSync(paths.sqlitePath)) {
    return { ok: false, code: "plane_missing" };
  }
  const db = new Database(paths.sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(`SELECT marker_id FROM runtime_bootstrap_markers`)
      .all() as Array<{ marker_id: string }>;
    const markers = new Set(rows.map((row) => row.marker_id));
    if (bootstrapPolicy === "NEW_ORGANIZATION" || bootstrapPolicy === "SYNTHETIC_TEST") {
      const complete = NEW_ORGANIZATION_MARKERS.every((marker) => markers.has(marker));
      return complete ? { ok: true } : { ok: false, code: "plane_incomplete" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "plane_incomplete" };
  } finally {
    db.close();
  }
}

export function inspectOrganizationProvision(
  controlPlane: ControlPlane,
  organizationId: string,
): ProvisionInspection {
  const organization = controlPlane.getOrganization(organizationId);
  const plane = organization
    ? controlPlane.getPlaneByOrganization(organization.organizationId)
    : null;
  return {
    organization,
    plane,
    planeCount: organization ? controlPlane.countPlanes(organization.organizationId) : 0,
    userCount: controlPlane.countUsers(),
    membershipCount: organization
      ? controlPlane.countMemberships(organization.organizationId)
      : 0,
    operationalPlane: plane
      ? inspectOperationalPlane(controlPlane.cloudRoot, plane.planeKey, plane.bootstrapPolicy)
      : { ok: false, code: "plane_missing" },
  };
}

export function ensureOperationalPlane(
  controlPlane: ControlPlane,
  organization: CloudOrganization,
  plane: OperationalPlaneDescriptor,
): { sqlitePath: string; documentsRoot: string; planeRoot: string } {
  const paths = derivePlanePaths(controlPlane.cloudRoot, plane.planeKey);
  mkdirSync(paths.documentsRoot, { recursive: true });
  const runtime = createProductSystemRuntime(paths.sqlitePath, {
    documentsRoot: paths.documentsRoot,
    bootstrapPolicy: plane.bootstrapPolicy,
    providerRegistry: resolveProviderRegistry(plane.bootstrapPolicy),
    planeIdentity: {
      planeId: plane.planeId,
      organizationId: organization.organizationId,
    },
  });
  runtime.close();
  const inspected = inspectOperationalPlane(
    controlPlane.cloudRoot,
    plane.planeKey,
    plane.bootstrapPolicy,
  );
  if (!inspected.ok) {
    throw new ProvisionConflictError(inspected.code);
  }
  return paths;
}

export async function provisionOrganizationWithPlane(
  controlPlane: ControlPlane,
  input: {
    displayName: string;
    slug?: string;
    bootstrapPolicy?: BootstrapPolicy;
    ownerEmail?: string;
  },
) {
  const organization = controlPlane.createOrganization({
    displayName: input.displayName,
    slug: input.slug,
    ownerEmail: input.ownerEmail,
  });
  const plane = controlPlane.createPlane({
    organizationId: organization.organizationId,
    bootstrapPolicy: input.bootstrapPolicy ?? "NEW_ORGANIZATION",
  });
  const paths = derivePlanePaths(controlPlane.cloudRoot, plane.planeKey);
  if (plane.bootstrapPolicy !== "ADOPT_EXISTING") {
    mkdirSync(paths.documentsRoot, { recursive: true });
    const runtime = createProductSystemRuntime(paths.sqlitePath, {
      documentsRoot: paths.documentsRoot,
      bootstrapPolicy: plane.bootstrapPolicy,
      providerRegistry: resolveProviderRegistry(plane.bootstrapPolicy),
      planeIdentity: {
        planeId: plane.planeId,
        organizationId: organization.organizationId,
      },
    });
    runtime.close();
  }
  return { organization, plane, paths };
}

export async function provisionCloudUser(
  controlPlane: ControlPlane,
  input: { email: string; password: string },
) {
  return controlPlane.createUser(input);
}

export function provisionMembership(
  controlPlane: ControlPlane,
  input: {
    userId: string;
    organizationId: string;
    role: MembershipRole;
  },
) {
  return controlPlane.addMembership(input);
}

async function hashOwnerPassword(
  password: string,
  hooks?: ProvisionHooks,
): Promise<{ passwordHash: Buffer; passwordSalt: Buffer; kdf: string }> {
  triggerFault(hooks, "during_user_hashing");
  return hashCloudPassword(password);
}

function completeOwnerOnControlPlane(
  controlPlane: ControlPlane,
  input: {
    organizationId: string;
    email: string;
    hashed: { passwordHash: Buffer; passwordSalt: Buffer; kdf: string };
  },
  hooks?: ProvisionHooks,
): { user: CloudUser; alreadyActive: boolean } {
  return controlPlane.runImmediateTransaction(() => {
    const latest = controlPlane.getOrganization(input.organizationId);
    if (!latest) {
      throw new ProvisionConflictError("organization_missing");
    }
    const claimed = controlPlane.claimProvisionOwnerEmail(input.organizationId, input.email);
    if (!claimed.ok) {
      throw new ProvisionConflictError(claimed.error);
    }
    const organization = claimed.organization;
    if (organization.status === "DISABLED") {
      throw new ProvisionConflictError("organization_not_resumable");
    }

    const plane = assertResumePlane(controlPlane, organization.organizationId);
    const inspected = inspectOperationalPlane(
      controlPlane.cloudRoot,
      plane.planeKey,
      plane.bootstrapPolicy,
    );
    if (!inspected.ok) {
      throw new ProvisionConflictError(inspected.code);
    }

    const owners = controlPlane.listActiveOwnerMemberships(organization.organizationId);
    if (owners.length > 1) {
      throw new ProvisionConflictError("conflicting_membership");
    }
    if (owners.length === 1) {
      const owner = controlPlane.getUser(owners[0].userId);
      if (!owner || owner.email !== input.email) {
        throw new ProvisionConflictError("conflicting_membership");
      }
      if (organization.status !== "ACTIVE") {
        controlPlane.activateOrganizationForInitialProvision(
          organization.organizationId,
          owner.userId,
        );
        return { user: owner, alreadyActive: false };
      }
      return { user: owner, alreadyActive: true };
    }

    if (
      organization.status !== "PROVISIONING" &&
      organization.status !== "FAILED_RETRYABLE" &&
      !isLegacyIncompleteActive({
        status: organization.status,
        ownerMembershipCount: 0,
      })
    ) {
      throw new ProvisionConflictError("organization_not_resumable");
    }

    const existing = controlPlane.getUserByEmail(input.email);
    let user: CloudUser;
    if (existing) {
      const foreign = controlPlane
        .listMembershipsForUser(existing.userId)
        .filter((item) => item.organizationId !== input.organizationId);
      if (foreign.length > 0) {
        throw new ProvisionConflictError("conflicting_user");
      }
      controlPlane.updateHashedUserPassword({
        userId: existing.userId,
        passwordHash: input.hashed.passwordHash,
        passwordSalt: input.hashed.passwordSalt,
        kdf: input.hashed.kdf,
      });
      user = existing;
    } else {
      user = controlPlane.insertHashedUser({
        email: input.email,
        passwordHash: input.hashed.passwordHash,
        passwordSalt: input.hashed.passwordSalt,
        kdf: input.hashed.kdf,
      });
    }
    triggerFault(hooks, "after_user_insert");
    triggerFault(hooks, "before_membership");
    const currentMembership = controlPlane.getActiveMembership(
      user.userId,
      input.organizationId,
    );
    if (!currentMembership) {
      controlPlane.addMembership({
        userId: user.userId,
        organizationId: input.organizationId,
        role: "owner",
      });
    } else if (currentMembership.role !== "owner") {
      throw new ProvisionConflictError("conflicting_membership");
    }
    triggerFault(hooks, "after_membership_before_active");
    controlPlane.activateOrganizationForInitialProvision(
      organization.organizationId,
      user.userId,
    );
    return { user, alreadyActive: false };
  });
}

function markFailedUnlessClientConflict(
  controlPlane: ControlPlane,
  organizationId: string,
  error: unknown,
): void {
  const code = error instanceof ProvisionConflictError ? error.code : "operational_or_owner_failed";
  if (CLIENT_PROVISION_CODES.has(code)) {
    return;
  }
  const organization = controlPlane.getOrganization(organizationId);
  if (!organization || organization.status === "ACTIVE") {
    return;
  }
  controlPlane.markOrganizationFailed(organizationId, code);
}

function assertResumePlane(controlPlane: ControlPlane, organizationId: string): OperationalPlaneDescriptor {
  const planeCount = controlPlane.countPlanes(organizationId);
  if (planeCount === 0) {
    throw new ProvisionConflictError("plane_missing");
  }
  if (planeCount !== 1) {
    throw new ProvisionConflictError("unexpected_plane_count");
  }
  const plane = controlPlane.getPlaneByOrganization(organizationId);
  if (!plane) {
    throw new ProvisionConflictError("plane_missing");
  }
  return plane;
}

function assertResumeMemberships(
  controlPlane: ControlPlane,
  organizationId: string,
  email: string,
): void {
  const memberships = controlPlane
    .listMembershipsForOrganization(organizationId)
    .filter((item) => item.status === "ACTIVE");
  if (memberships.length > 1) {
    throw new ProvisionConflictError("conflicting_membership");
  }
  if (memberships.length === 1) {
    const member = controlPlane.getUser(memberships[0].userId);
    if (!member || member.email !== email) {
      throw new ProvisionConflictError("conflicting_membership");
    }
  }
  const existing = controlPlane.getUserByEmail(email);
  if (existing && memberships.length === 1 && memberships[0].userId !== existing.userId) {
    throw new ProvisionConflictError("conflicting_user");
  }
}

function alreadyActiveResult(
  controlPlane: ControlPlane,
  organization: CloudOrganization,
  email: string,
): ProvisionResult {
  const owner = controlPlane.getUserByEmail(email);
  const membership = owner
    ? controlPlane.getActiveMembership(owner.userId, organization.organizationId)
    : null;
  if (!owner || membership?.role !== "owner") {
    throw new ProvisionConflictError("already_active");
  }
  const plane = controlPlane.getPlaneByOrganization(organization.organizationId);
  if (!plane) {
    throw new ProvisionConflictError("plane_missing");
  }
  const inspected = inspectOperationalPlane(
    controlPlane.cloudRoot,
    plane.planeKey,
    plane.bootstrapPolicy,
  );
  if (!inspected.ok) {
    throw new ProvisionConflictError(inspected.code);
  }
  return {
    organization,
    plane,
    user: owner,
    alreadyActive: true,
    paths: derivePlanePaths(controlPlane.cloudRoot, plane.planeKey),
  };
}

export async function provisionNewOrganization(input: {
  cloudRoot: string;
  displayName: string;
  email: string;
  password: string;
  bootstrapPolicy?: BootstrapPolicy;
  hooks?: ProvisionHooks;
  env?: NodeJS.ProcessEnv;
}): Promise<ProvisionResult> {
  assertCloudProvisionNotProduction(input.env);
  assertCloudPassword(input.password);
  triggerFault(input.hooks, "before_control_plane_open");
  const email = normalizeEmail(input.email);
  const controlPlane = openProvisionedControlPlane(input.cloudRoot);
  try {
    const registered = controlPlane.runImmediateTransaction(() => {
      assertFreshCreateAllowed(controlPlane, email);
      const organization = controlPlane.createOrganization({
        displayName: input.displayName,
        ownerEmail: email,
      });
      triggerFault(input.hooks, "after_org_intent");
      const plane = controlPlane.createPlane({
        organizationId: organization.organizationId,
        bootstrapPolicy: input.bootstrapPolicy ?? "NEW_ORGANIZATION",
      });
      return { organization, plane };
    });
    try {
      triggerFault(input.hooks, "after_plane_registration");
      triggerFault(input.hooks, "during_operational_plane");
      const paths = ensureOperationalPlane(
        controlPlane,
        registered.organization,
        registered.plane,
      );
      triggerFault(input.hooks, "after_operational_plane");
      const hashed = await hashOwnerPassword(input.password, input.hooks);
      const completed = completeOwnerOnControlPlane(
        controlPlane,
        {
          organizationId: registered.organization.organizationId,
          email,
          hashed,
        },
        input.hooks,
      );
      const user = completed.user;
      const organization = controlPlane.getOrganization(registered.organization.organizationId);
      if (!organization || organization.status !== "ACTIVE") {
        throw new ProvisionConflictError("organization_not_ready");
      }
      return {
        organization,
        plane: registered.plane,
        user,
        alreadyActive: false,
        paths,
      };
    } catch (error) {
      markFailedUnlessClientConflict(
        controlPlane,
        registered.organization.organizationId,
        error,
      );
      throw error;
    }
  } finally {
    controlPlane.close();
  }
}

export async function resumeOrganizationProvision(input: {
  cloudRoot: string;
  organizationId: string;
  email: string;
  password: string;
  hooks?: ProvisionHooks;
  env?: NodeJS.ProcessEnv;
}): Promise<ProvisionResult> {
  assertCloudProvisionNotProduction(input.env);
  assertCloudPassword(input.password);
  const email = normalizeEmail(input.email);
  const controlPlane = openProvisionedControlPlane(input.cloudRoot);
  try {
    const organization = controlPlane.getOrganization(input.organizationId);
    if (!organization) {
      throw new ProvisionConflictError("organization_missing");
    }
    if (organization.status === "ACTIVE" && !isOrganizationResumeEligible(organization, controlPlane)) {
      return alreadyActiveResult(controlPlane, organization, email);
    }
    if (!isOrganizationResumeEligible(organization, controlPlane)) {
      throw new ProvisionConflictError("organization_not_resumable");
    }
    if (organization.provisionOwnerEmail && organization.provisionOwnerEmail !== email) {
      throw new ProvisionConflictError("email_mismatch");
    }
    const plane = assertResumePlane(controlPlane, organization.organizationId);
    assertResumeMemberships(controlPlane, organization.organizationId, email);
    try {
      const paths = ensureOperationalPlane(controlPlane, organization, plane);
      const hashed = await hashOwnerPassword(input.password, input.hooks);
      const completed = completeOwnerOnControlPlane(
        controlPlane,
        {
          organizationId: organization.organizationId,
          email,
          hashed,
        },
        input.hooks,
      );
      const ready = controlPlane.getOrganization(organization.organizationId);
      if (!ready || ready.status !== "ACTIVE") {
        throw new ProvisionConflictError("organization_not_ready");
      }
      return {
        organization: ready,
        plane,
        user: completed.user,
        alreadyActive: completed.alreadyActive,
        paths,
      };
    } catch (error) {
      markFailedUnlessClientConflict(controlPlane, organization.organizationId, error);
      throw error;
    }
  } finally {
    controlPlane.close();
  }
}
