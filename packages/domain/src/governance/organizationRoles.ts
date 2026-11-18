import type { FinancialAccessScope } from "../commercial/financialAccess.js";

/**
 * V1 Organization Access — the single server-owned catalogue of organization roles and what each
 * one may do. Contract: WORKOS_V1_ORGANIZATION_ACCESS_CONTRACT (ROLE_PERMISSION_MATRIX.md §3–§4,
 * AUTHORIZATION_CHECK_INVENTORY.md). Roles are fixed; there is no per-organization RBAC.
 *
 * `member` keeps exactly the rights it had before V1 (label: Comercial). An unknown role has no
 * capability at all — it is never treated as `member`.
 */
export const ORGANIZATION_ROLES = ["owner", "member", "production", "workshop"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** Roles that existed before V1. They keep the ACTIVE membership status. */
export const LEGACY_ORGANIZATION_ROLES = ["owner", "member"] as const;
/** Roles introduced by V1. Stored with ACTIVE_SCOPED so that a pre-V1 build refuses them. */
export const SCOPED_ORGANIZATION_ROLES = ["production", "workshop"] as const;

export const ACTIVE_MEMBERSHIP_STATUS = "ACTIVE" as const;
export const ACTIVE_SCOPED_MEMBERSHIP_STATUS = "ACTIVE_SCOPED" as const;
export const REVOKED_MEMBERSHIP_STATUS = "REVOKED" as const;
export type OrganizationMembershipStatus =
  | typeof ACTIVE_MEMBERSHIP_STATUS
  | typeof ACTIVE_SCOPED_MEMBERSHIP_STATUS
  | typeof REVOKED_MEMBERSHIP_STATUS;

export const ORGANIZATION_CAPABILITIES = [
  "org.access.read",
  "org.access.manage",
  "org.settings.read",
  "org.settings.manage",
  "costs.internal.read",
  "costs.internal.manage",
  "resources.read",
  "resources.manage",
  "customers.read",
  "customers.write",
  "customers.financials.read",
  "customers.terms.read",
  "customers.terms.write",
  "requests.read",
  "requests.write",
  "requests.decide",
  "requests.outcome.manage",
  "configurator.use",
  "assemblies.read",
  "assemblies.manage",
  "prices.client.read",
  "prices.manual.set",
  "offering.policy.use",
  "quotes.read",
  "quotes.create",
  "quotes.price_exception.approve",
  "quotes.accept",
  "quotes.accept.incomplete_cost",
  "production.release",
  "planning.read",
  "planning.manage",
  "jobs.read",
  "jobs.files.write",
  "execution.operate",
  "execution.supervise",
  "materials.decide",
  "inventory.read",
  "inventory.adjust",
] as const;
export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];

const MEMBER_CAPABILITIES: readonly OrganizationCapability[] = [
  "org.access.read",
  "org.settings.read",
  "resources.read",
  "customers.read",
  "customers.write",
  "customers.financials.read",
  "customers.terms.read",
  "requests.read",
  "requests.write",
  "requests.outcome.manage",
  "configurator.use",
  "assemblies.read",
  "prices.client.read",
  "offering.policy.use",
  "quotes.read",
  "quotes.create",
  "planning.read",
  "jobs.read",
  "jobs.files.write",
  "execution.operate",
  "materials.decide",
  "inventory.read",
];

/** D4: plans, releases and supervises execution; no people/PIN/stock administration. */
const PRODUCTION_CAPABILITIES: readonly OrganizationCapability[] = [
  "org.settings.read",
  "resources.read",
  "customers.read",
  "requests.read",
  "planning.read",
  "planning.manage",
  "production.release",
  "jobs.read",
  "jobs.files.write",
  "execution.operate",
  "execution.supervise",
  "materials.decide",
  "inventory.read",
];

/** Workshop terminal: released work and execution only. */
const WORKSHOP_CAPABILITIES: readonly OrganizationCapability[] = ["jobs.read", "execution.operate"];

export const ROLE_CAPABILITIES: Readonly<Record<OrganizationRole, ReadonlySet<OrganizationCapability>>> = {
  owner: new Set(ORGANIZATION_CAPABILITIES),
  member: new Set(MEMBER_CAPABILITIES),
  production: new Set(PRODUCTION_CAPABILITIES),
  workshop: new Set(WORKSHOP_CAPABILITIES),
};

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === "string" && (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

export function isScopedOrganizationRole(role: OrganizationRole): boolean {
  return (SCOPED_ORGANIZATION_ROLES as readonly string[]).includes(role);
}

/** Fail-closed: an unknown or missing role has no capability. */
export function roleCan(role: unknown, capability: OrganizationCapability): boolean {
  return isOrganizationRole(role) && ROLE_CAPABILITIES[role].has(capability);
}

/**
 * The single role that holds a capability, or null when several roles (or none) hold it.
 * Start uses it to say "only your role can take this step" from the matrix itself.
 */
export function capabilityExclusiveRole(capability: OrganizationCapability): OrganizationRole | null {
  const holders = ORGANIZATION_ROLES.filter((role) => ROLE_CAPABILITIES[role].has(capability));
  return holders.length === 1 ? (holders[0] ?? null) : null;
}

export function capabilitiesForRole(role: unknown): OrganizationCapability[] {
  if (!isOrganizationRole(role)) return [];
  return ORGANIZATION_CAPABILITIES.filter((capability) => ROLE_CAPABILITIES[role].has(capability));
}

/** The active membership status a role must be stored with (compatibility invariant). */
export function activeStatusForRole(role: OrganizationRole): "ACTIVE" | "ACTIVE_SCOPED" {
  return isScopedOrganizationRole(role) ? ACTIVE_SCOPED_MEMBERSHIP_STATUS : ACTIVE_MEMBERSHIP_STATUS;
}

/** Exactly the (role, status) pairs that grant access. Anything else is inactive. */
export function isActiveMembershipPair(role: unknown, status: unknown): boolean {
  return isOrganizationRole(role) && status === activeStatusForRole(role);
}

/** Exactly the (role, status) pairs the database accepts. */
export function isValidMembershipPair(role: unknown, status: unknown): boolean {
  return isOrganizationRole(role) && (status === REVOKED_MEMBERSHIP_STATUS || status === activeStatusForRole(role));
}

/** The highest financial scope a role may ever see. */
export function roleFinancialScope(role: unknown): FinancialAccessScope {
  if (roleCan(role, "costs.internal.read")) return "owner";
  if (roleCan(role, "prices.client.read")) return "commercial";
  return "workshop";
}

const SCOPE_RANK: Record<FinancialAccessScope, number> = { workshop: 0, commercial: 1, owner: 2 };

/** The effective scope never exceeds what the role allows. */
export function narrowFinancialScope(
  scope: FinancialAccessScope,
  role: unknown,
): FinancialAccessScope {
  const roleScope = roleFinancialScope(role);
  return SCOPE_RANK[scope] <= SCOPE_RANK[roleScope] ? scope : roleScope;
}

export const ORGANIZATION_ROLE_PRESENTATION: Readonly<
  Record<OrganizationRole, { label: string; summary: string; cannot: string }>
> = {
  owner: {
    label: "Proprietar",
    summary: "Administrează firma: acces, setări, costuri, oferte acceptate, producție.",
    cannot: "—",
  },
  member: {
    label: "Comercial",
    summary:
      "Clienți, cereri, configurare și oferte; vede prețul clientului; stabilește prețul și îngheață oferta când regulile de ofertare ale firmei permit; decide rezultatul cererii; poate lucra în atelier prin PIN.",
    cannot: "Nu vede costuri interne, nu modifică regulile de ofertare și nu acceptă oferte.",
  },
  production: {
    label: "Producție",
    summary: "Planifică, eliberează în producție și supraveghează execuția.",
    cannot: "Nu vede prețuri, costuri sau condiții comerciale; nu administrează oameni, PIN-uri sau stoc.",
  },
  workshop: {
    label: "Atelier",
    summary: "Execută operațiile lucrărilor eliberate, cu identificare prin PIN.",
    cannot: "Nu vede prețuri, costuri, clienți, oferte sau condiții comerciale.",
  },
};
