import {
  createWorkcenterRegistry,
  workcenterRegistry,
  type WorkcenterRegistry,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { bootstrapProductSystemDisplayStore } from "../productSystem/store.js";
import { ensureCostEvidence } from "../resources/store.js";
import { applyOperationalSkillFoundation, ensureTrustedWorkforce } from "../people/store.js";
import type { BootstrapPolicy } from "./controlPlane.js";

export const EMPTY_WORKCENTER_REGISTRY = createWorkcenterRegistry([], []);

export const PROVIDER_REGISTRY_KINDS = [
  "HUB_MEDIA_PILOT_COMPATIBILITY",
  "EMPTY_FOUNDATION",
  "LEGACY_SINGLE_PLANE",
] as const;

export type ProviderRegistryKind = (typeof PROVIDER_REGISTRY_KINDS)[number];

export { PLATFORM_DEFAULT_COST_NOTE } from "../resources/store.js";

/**
 * SYNTHETIC_TEST is a generic empty-foundation bootstrap policy for isolated
 * test/QA planes. It must not encode named TEST COMPANY truth, Cloud Users,
 * memberships, or sessions. Differentiation belongs to test fixture setup.
 *
 * ADOPT_EXISTING uses the current curated HUB MEDIA workcenter catalog only as
 * first-pilot compatibility. It is not the permanent law that every adopted
 * existing company receives HUB MEDIA equipment. Future adoption must resolve
 * that Organization's own provider configuration. Machine Admin is later.
 */
export function resolveProviderRegistryKind(
  policy: BootstrapPolicy | "SINGLE_PLANE" | undefined,
): ProviderRegistryKind {
  switch (policy) {
    case "ADOPT_EXISTING":
      return "HUB_MEDIA_PILOT_COMPATIBILITY";
    case "NEW_ORGANIZATION":
    case "SYNTHETIC_TEST":
      return "EMPTY_FOUNDATION";
    case "SINGLE_PLANE":
    case undefined:
      return "LEGACY_SINGLE_PLANE";
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

export function resolveProviderRegistry(
  policy: BootstrapPolicy | "SINGLE_PLANE",
): WorkcenterRegistry {
  const kind = resolveProviderRegistryKind(policy);
  switch (kind) {
    case "HUB_MEDIA_PILOT_COMPATIBILITY":
    case "LEGACY_SINGLE_PLANE":
      return workcenterRegistry;
    case "EMPTY_FOUNDATION":
      return EMPTY_WORKCENTER_REGISTRY;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function applyOperationalBootstrap(
  db: SqliteDatabase,
  policy: BootstrapPolicy | undefined,
): void {
  bootstrapProductSystemDisplayStore(db);
  if (policy === "ADOPT_EXISTING") {
    return;
  }
  if (policy === "NEW_ORGANIZATION" || policy === "SYNTHETIC_TEST") {
    ensureCostEvidence(db, policy);
    applyOperationalSkillFoundation(db);
    return;
  }
  ensureCostEvidence(db, "SINGLE_PLANE");
  if (!process.env.VITEST) {
    ensureTrustedWorkforce(db);
  }
}
