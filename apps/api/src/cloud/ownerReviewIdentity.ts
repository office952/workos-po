/**
 * Owner-review synthetic fixture identity.
 * Lives in code as deterministic fixture labels; passwords stay local-only
 * in the reference-root identity file (outside Git).
 */

export const OWNER_REVIEW_ORG_NAME = "WorkOS Test";
export const OWNER_REVIEW_BOOTSTRAP_POLICY = "SYNTHETIC_TEST" as const;
export const OWNER_REVIEW_FIXTURE_KIND = "OWNER_REVIEW_V1" as const;

export const OWNER_REVIEW_OWNER_EMAIL = "owner@workos.test";
export const OWNER_REVIEW_COMMERCIAL_EMAIL = "comercial@workos.test";
export const OWNER_REVIEW_PRODUCTION_EMAIL = "productie@workos.test";

/** Local synthetic password — never a production credential. */
export const OWNER_REVIEW_DEFAULT_PASSWORD = "workos1234";

export const OWNER_REVIEW_OPERATOR_PIN = "246810";

export const OWNER_REVIEW_PEOPLE = {
  cncOperator: "Ion CNC Demo",
  assemblyOperator: "Maria Ansamblu Demo",
} as const;

export const OWNER_REVIEW_WORKCENTERS = {
  cnc: "Zonă CNC Test",
  assembly: "Zonă Ansamblare Test",
  led: "Zonă LED Test",
} as const;

export const OWNER_REVIEW_MACHINES = {
  cnc: "CNC Router Test",
  assemblyBench: "Banc Ansamblare Test",
  ledBench: "Banc LED Test",
} as const;

export type OwnerReviewIdentityFile = {
  classification: "SYNTHETIC_REFERENCE";
  SYNTHETIC_REFERENCE_DATA: "YES";
  SYNTHETIC_ONLY: "YES";
  REAL_DATA: "NO";
  REAL_CUSTOMER_DATA: "NO";
  PRODUCTION_ELIGIBLE: "NO";
  fixtureKind: typeof OWNER_REVIEW_FIXTURE_KIND;
  bootstrapPolicy: typeof OWNER_REVIEW_BOOTSTRAP_POLICY;
  organization: typeof OWNER_REVIEW_ORG_NAME;
  organizationId?: string;
  email: typeof OWNER_REVIEW_OWNER_EMAIL;
  password: string;
  users: {
    owner: { email: string; role: "owner" };
    commercial: { email: string; role: "member" };
    production: { email: string; role: "member" };
  };
};

export function buildOwnerReviewIdentityFile(
  password: string = OWNER_REVIEW_DEFAULT_PASSWORD,
  organizationId?: string,
): OwnerReviewIdentityFile {
  return {
    classification: "SYNTHETIC_REFERENCE",
    SYNTHETIC_REFERENCE_DATA: "YES",
    SYNTHETIC_ONLY: "YES",
    REAL_DATA: "NO",
    REAL_CUSTOMER_DATA: "NO",
    PRODUCTION_ELIGIBLE: "NO",
    fixtureKind: OWNER_REVIEW_FIXTURE_KIND,
    bootstrapPolicy: OWNER_REVIEW_BOOTSTRAP_POLICY,
    organization: OWNER_REVIEW_ORG_NAME,
    ...(organizationId ? { organizationId } : {}),
    email: OWNER_REVIEW_OWNER_EMAIL,
    password,
    users: {
      owner: { email: OWNER_REVIEW_OWNER_EMAIL, role: "owner" },
      commercial: { email: OWNER_REVIEW_COMMERCIAL_EMAIL, role: "member" },
      production: { email: OWNER_REVIEW_PRODUCTION_EMAIL, role: "member" },
    },
  };
}

export function isOwnerReviewIdentity(value: unknown): value is OwnerReviewIdentityFile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.classification === "SYNTHETIC_REFERENCE" &&
    record.SYNTHETIC_REFERENCE_DATA === "YES" &&
    record.SYNTHETIC_ONLY === "YES" &&
    record.REAL_DATA === "NO" &&
    record.fixtureKind === OWNER_REVIEW_FIXTURE_KIND &&
    record.bootstrapPolicy === OWNER_REVIEW_BOOTSTRAP_POLICY &&
    record.organization === OWNER_REVIEW_ORG_NAME &&
    typeof record.email === "string" &&
    typeof record.password === "string"
  );
}
