import {
  addOrganizationUser,
  AddOrganizationUserError,
} from "./addOrganizationUser.js";
import {
  OWNER_REVIEW_BOOTSTRAP_POLICY,
  OWNER_REVIEW_COMMERCIAL_EMAIL,
  OWNER_REVIEW_DEFAULT_PASSWORD,
  OWNER_REVIEW_ORG_NAME,
  OWNER_REVIEW_OWNER_EMAIL,
  OWNER_REVIEW_PRODUCTION_EMAIL,
} from "./ownerReviewIdentity.js";
import { openProvisionedControlPlane } from "./provision.js";

export type EnsureOwnerReviewUsersResult = {
  organizationId: string;
  organizationName: string;
  bootstrapPolicy: string;
  users: Array<{ email: string; role: "owner" | "member"; kind: string }>;
};

function requireSyntheticPlane(cloudRoot: string): {
  organizationId: string;
  bootstrapPolicy: string;
} {
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  try {
    const organizations = controlPlane.listOrganizations();
    const match = organizations.find((item) => item.displayName === OWNER_REVIEW_ORG_NAME);
    if (!match) {
      throw new Error("owner_review_org_missing");
    }
    const plane = controlPlane.getPlaneByOrganization(match.organizationId);
    if (!plane) {
      throw new Error("owner_review_plane_missing");
    }
    if (plane.bootstrapPolicy !== OWNER_REVIEW_BOOTSTRAP_POLICY) {
      throw new Error(`owner_review_plane_not_synthetic:${plane.bootstrapPolicy}`);
    }
    return {
      organizationId: match.organizationId,
      bootstrapPolicy: plane.bootstrapPolicy,
    };
  } finally {
    controlPlane.close();
  }
}

async function ensureMember(
  cloudRoot: string,
  organizationId: string,
  email: string,
  password: string,
): Promise<{ email: string; role: "member"; kind: string }> {
  try {
    const result = await addOrganizationUser({
      cloudRoot,
      organizationId,
      email,
      role: "member",
      confirmControlledAccessChange: true,
      passwordSupplied: true,
      readPassword: async () => password,
    });
    return { email: result.email, role: "member", kind: result.kind };
  } catch (error) {
    if (
      error instanceof AddOrganizationUserError &&
      error.code === "password_not_applicable"
    ) {
      const attached = await addOrganizationUser({
        cloudRoot,
        organizationId,
        email,
        role: "member",
        confirmControlledAccessChange: true,
        passwordSupplied: false,
        readPassword: async () => {
          throw new Error("password_not_expected_for_existing_user");
        },
      });
      return { email: attached.email, role: "member", kind: attached.kind };
    }
    throw error;
  }
}

/**
 * Ensures commercial + production Cloud members on the WorkOS Test org.
 * Owner is created by provision; members attach via the controlled-access helper.
 * Refuses non-SYNTHETIC_TEST planes.
 */
export async function ensureOwnerReviewUsers(input: {
  cloudRoot: string;
  password?: string;
}): Promise<EnsureOwnerReviewUsersResult> {
  const password = input.password ?? OWNER_REVIEW_DEFAULT_PASSWORD;
  const { organizationId, bootstrapPolicy } = requireSyntheticPlane(input.cloudRoot);
  const commercial = await ensureMember(
    input.cloudRoot,
    organizationId,
    OWNER_REVIEW_COMMERCIAL_EMAIL,
    password,
  );
  const production = await ensureMember(
    input.cloudRoot,
    organizationId,
    OWNER_REVIEW_PRODUCTION_EMAIL,
    password,
  );
  return {
    organizationId,
    organizationName: OWNER_REVIEW_ORG_NAME,
    bootstrapPolicy,
    users: [
      { email: OWNER_REVIEW_OWNER_EMAIL, role: "owner", kind: "PROVISIONED_OWNER" },
      commercial,
      production,
    ],
  };
}
