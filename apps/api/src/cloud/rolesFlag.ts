/**
 * V1 Organization Access · phase gate for the scoped roles (production, workshop).
 * Default OFF (MIGRATION_AND_COMPATIBILITY.md §4). When OFF, the scoped roles can be neither
 * written nor used: existing ACTIVE_SCOPED memberships are inactive by code (forward recovery).
 */
export function organizationRolesV1Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORKOS_ORG_ROLES_V1 === "on";
}
