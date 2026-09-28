import { existsSync } from "node:fs";
import {
  createControlPlane,
  normalizeEmail,
  type CloudUser,
  type ControlPlane,
  type MembershipRole,
  type OrganizationStatus,
  type UserStatus,
} from "./controlPlane.js";
import { assertCloudPassword, hashCloudPassword } from "./password.js";
import {
  openControlPlaneDatabase,
  resolveControlPlaneSqlitePath,
} from "../persistence/controlPlaneSqlite.js";

export const ADD_ORGANIZATION_USER_RESULTS = [
  "CREATED_NEW_USER",
  "ATTACHED_EXISTING_USER",
  "REACTIVATED_MEMBERSHIP",
  "ALREADY_MEMBER",
  "USER_DISABLED",
] as const;

export type AddOrganizationUserResultKind = (typeof ADD_ORGANIZATION_USER_RESULTS)[number];

export type AddOrganizationUserResult = {
  kind: AddOrganizationUserResultKind;
  organizationId: string;
  email: string;
  role: MembershipRole;
};

export type AddOrganizationUserErrorCode =
  | "confirm_required"
  | "invalid_role"
  | "invalid_email"
  | "organization_missing"
  | "organization_not_administrable"
  | "user_disabled"
  | "password_not_applicable"
  | "identity_conflict"
  | "membership_conflict";

export class AddOrganizationUserError extends Error {
  readonly code: AddOrganizationUserErrorCode;

  constructor(code: AddOrganizationUserErrorCode) {
    super(code);
    this.name = "AddOrganizationUserError";
    this.code = code;
  }
}

export type AddOrganizationUserHooks = {
  beforeMembership?: () => void;
};

type MembershipMutationKind = "attached" | "reactivated" | "already";

type MembershipMutation = {
  kind: MembershipMutationKind;
  role: MembershipRole;
};

function assertOrganizationAdministrable(status: OrganizationStatus): void {
  switch (status) {
    case "ACTIVE":
      return;
    case "PROVISIONING":
    case "FAILED_RETRYABLE":
    case "DISABLED":
      throw new AddOrganizationUserError("organization_not_administrable");
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function assertUserCanBeAttached(status: UserStatus): void {
  switch (status) {
    case "ACTIVE":
      return;
    case "DISABLED":
      throw new AddOrganizationUserError("user_disabled");
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function parseOrganizationUserRole(role: string): MembershipRole {
  switch (role) {
    case "owner":
    case "member":
      return role;
    default:
      throw new AddOrganizationUserError("invalid_role");
  }
}

function requireAdministrableOrganization(
  controlPlane: ControlPlane,
  organizationId: string,
): void {
  const organization = controlPlane.getOrganization(organizationId);
  if (!organization) {
    throw new AddOrganizationUserError("organization_missing");
  }
  assertOrganizationAdministrable(organization.status);
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function mutateMembership(
  controlPlane: ControlPlane,
  input: {
    user: CloudUser;
    organizationId: string;
    email: string;
    role: MembershipRole;
    hooks?: AddOrganizationUserHooks;
  },
): MembershipMutation {
  requireAdministrableOrganization(controlPlane, input.organizationId);
  const user = controlPlane.getUser(input.user.userId);
  if (!user || user.email !== input.email) {
    throw new AddOrganizationUserError("identity_conflict");
  }
  assertUserCanBeAttached(user.status);
  const membership = controlPlane.getMembershipForUserInOrganization(
    user.userId,
    input.organizationId,
  );
  if (!membership) {
    input.hooks?.beforeMembership?.();
    controlPlane.addMembership({
      userId: user.userId,
      organizationId: input.organizationId,
      role: input.role,
    });
    return { kind: "attached", role: input.role };
  }
  switch (membership.status) {
    case "ACTIVE":
      return { kind: "already", role: membership.role };
    case "REVOKED": {
      input.hooks?.beforeMembership?.();
      const reactivated = controlPlane.reactivateRevokedMembership({
        membershipId: membership.membershipId,
        organizationId: input.organizationId,
        role: input.role,
      });
      if (!reactivated || reactivated.membershipId !== membership.membershipId) {
        throw new AddOrganizationUserError("membership_conflict");
      }
      return { kind: "reactivated", role: reactivated.role };
    }
    default: {
      const _exhaustive: never = membership.status;
      return _exhaustive;
    }
  }
}

function resultFromMutation(
  kind: AddOrganizationUserResultKind,
  input: { organizationId: string; email: string; role: MembershipRole },
): AddOrganizationUserResult {
  return {
    kind,
    organizationId: input.organizationId,
    email: input.email,
    role: input.role,
  };
}

function existingUserResult(
  mutation: MembershipMutation,
  input: { organizationId: string; email: string },
): AddOrganizationUserResult {
  switch (mutation.kind) {
    case "attached":
      return resultFromMutation("ATTACHED_EXISTING_USER", {
        ...input,
        role: mutation.role,
      });
    case "reactivated":
      return resultFromMutation("REACTIVATED_MEMBERSHIP", {
        ...input,
        role: mutation.role,
      });
    case "already":
      return resultFromMutation("ALREADY_MEMBER", {
        ...input,
        role: mutation.role,
      });
    default: {
      const _exhaustive: never = mutation.kind;
      return _exhaustive;
    }
  }
}

function runMembershipTransaction<T>(controlPlane: ControlPlane, work: () => T): T {
  try {
    return controlPlane.runImmediateTransaction(work);
  } catch (error) {
    if (error instanceof AddOrganizationUserError) {
      throw error;
    }
    if (isUniqueConstraint(error)) {
      throw new AddOrganizationUserError("identity_conflict");
    }
    throw error;
  }
}

export async function addOrganizationUser(input: {
  cloudRoot: string;
  organizationId: string;
  email: string;
  role: string;
  confirmControlledAccessChange: boolean;
  passwordSupplied: boolean;
  readPassword: () => Promise<string>;
  hooks?: AddOrganizationUserHooks;
}): Promise<AddOrganizationUserResult> {
  if (!input.confirmControlledAccessChange) {
    throw new AddOrganizationUserError("confirm_required");
  }
  const role = parseOrganizationUserRole(input.role);
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new AddOrganizationUserError("invalid_email");
  }
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new AddOrganizationUserError("organization_missing");
  }
  const sqlitePath = resolveControlPlaneSqlitePath(input.cloudRoot);
  if (!existsSync(sqlitePath)) {
    throw new AddOrganizationUserError("organization_missing");
  }
  const controlPlane = createControlPlane(
    openControlPlaneDatabase(sqlitePath),
    input.cloudRoot,
  );
  try {
    requireAdministrableOrganization(controlPlane, organizationId);
    const existing = controlPlane.getUserByEmail(email);
    if (existing) {
      assertUserCanBeAttached(existing.status);
      if (input.passwordSupplied) {
        throw new AddOrganizationUserError("password_not_applicable");
      }
      const mutation = runMembershipTransaction(controlPlane, () =>
        mutateMembership(controlPlane, {
          user: existing,
          organizationId,
          email,
          role,
          hooks: input.hooks,
        }),
      );
      return existingUserResult(mutation, { organizationId, email });
    }

    const password = await input.readPassword();
    assertCloudPassword(password);
    const hashed = await hashCloudPassword(password);
    return runMembershipTransaction(controlPlane, () => {
      requireAdministrableOrganization(controlPlane, organizationId);
      const raced = controlPlane.getUserByEmail(email);
      if (raced) {
        assertUserCanBeAttached(raced.status);
        if (input.passwordSupplied) {
          throw new AddOrganizationUserError("password_not_applicable");
        }
        const mutation = mutateMembership(controlPlane, {
          user: raced,
          organizationId,
          email,
          role,
          hooks: input.hooks,
        });
        return existingUserResult(mutation, { organizationId, email });
      }
      const user = controlPlane.insertHashedUser({
        email,
        passwordHash: hashed.passwordHash,
        passwordSalt: hashed.passwordSalt,
        kdf: hashed.kdf,
      });
      const mutation = mutateMembership(controlPlane, {
        user,
        organizationId,
        email,
        role,
        hooks: input.hooks,
      });
      if (mutation.kind !== "attached") {
        throw new AddOrganizationUserError("membership_conflict");
      }
      return resultFromMutation("CREATED_NEW_USER", {
        organizationId,
        email,
        role: mutation.role,
      });
    });
  } finally {
    controlPlane.close();
  }
}
