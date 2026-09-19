import {
  SITE_INSTALLATION_LABEL,
  SITE_INSTALLATION_SCOPE_ID,
  normalizeOptionalScopeIds,
  sameOptionalScopeIds,
} from "./installation/scope.js";

export const TRANSPORT_CAPABILITY_ID = "TRANSPORT";
export const TRANSPORT_CAPABILITY_LABEL = "Transport";

export const OPERATIONAL_SERVICE_CAPABILITY_IDS = [
  SITE_INSTALLATION_SCOPE_ID,
  TRANSPORT_CAPABILITY_ID,
] as const;
export type OperationalServiceCapabilityId =
  (typeof OPERATIONAL_SERVICE_CAPABILITY_IDS)[number];

export const SELECTABLE_OPERATIONAL_SERVICE_CAPABILITY_IDS = [
  SITE_INSTALLATION_SCOPE_ID,
] as const;

export const ORGANIZATION_SERVICE_OFFER_MODES = [
  "SERVICE_DISABLED",
  "INTERNAL",
  "SUBCONTRACTED",
  "BOTH",
] as const;
export type OrganizationServiceOfferMode =
  (typeof ORGANIZATION_SERVICE_OFFER_MODES)[number];

export const OPERATIONAL_SERVICE_PROVIDER_MODES = [
  "INTERNAL",
  "SUBCONTRACTED",
] as const;
export type OperationalServiceProviderMode =
  (typeof OPERATIONAL_SERVICE_PROVIDER_MODES)[number];

export const ORGANIZATION_SERVICE_OFFER_MUTATION_ERRORS = [
  "unknown_capability",
  "capability_reserved",
  "invalid_offer_mode",
] as const;
export type OrganizationServiceOfferMutationError =
  (typeof ORGANIZATION_SERVICE_OFFER_MUTATION_ERRORS)[number];

export type OrganizationServiceOffer = {
  capabilityId: typeof SITE_INSTALLATION_SCOPE_ID;
  configured: boolean;
  offerMode: OrganizationServiceOfferMode | null;
  version: number | null;
  updatedAt: string | null;
};

export type OrganizationServiceOfferRecord = {
  capabilityId: typeof SITE_INSTALLATION_SCOPE_ID;
  offerMode: OrganizationServiceOfferMode;
  version: number;
  updatedAt: string;
};

export type OrganizationServiceOfferMutationResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      record: OrganizationServiceOfferRecord;
    }
  | { ok: false; error: OrganizationServiceOfferMutationError };

export type SiteInstallationRequestOfferView = {
  capabilityId: typeof SITE_INSTALLATION_SCOPE_ID;
  label: typeof SITE_INSTALLATION_LABEL;
  selected: boolean;
  mode: OperationalServiceProviderMode | null;
  orgConfigured: boolean;
  orgOfferMode: OrganizationServiceOfferMode | null;
  canSelectNew: boolean;
  canChangeSelection: boolean;
  canChangeMode: boolean;
  selectionLocked: boolean;
  showModeControl: boolean;
  availableModes: readonly OperationalServiceProviderMode[];
  persistedSelectionPreserved: boolean;
  persistedModeIncompatible: boolean;
};

export type OperationalServiceCapabilityAdminView = {
  capabilityId: OperationalServiceCapabilityId;
  label: string;
  selectable: boolean;
  reserved: boolean;
  configured: boolean;
  offerMode: OrganizationServiceOfferMode | null;
  version: number | null;
  updatedAt: string | null;
};

export type OperationalServicesAdminProjection = {
  capabilities: readonly OperationalServiceCapabilityAdminView[];
};

export const UNCONFIGURED_SITE_INSTALLATION_OFFER: OrganizationServiceOffer = {
  capabilityId: SITE_INSTALLATION_SCOPE_ID,
  configured: false,
  offerMode: null,
  version: null,
  updatedAt: null,
};

export function isOperationalServiceCapabilityId(
  value: string,
): value is OperationalServiceCapabilityId {
  return (OPERATIONAL_SERVICE_CAPABILITY_IDS as readonly string[]).includes(value);
}

export function isSelectableOperationalServiceCapability(
  value: string,
): value is typeof SITE_INSTALLATION_SCOPE_ID {
  return (SELECTABLE_OPERATIONAL_SERVICE_CAPABILITY_IDS as readonly string[]).includes(
    value,
  );
}

export function isOrganizationServiceOfferMode(
  value: string,
): value is OrganizationServiceOfferMode {
  return (ORGANIZATION_SERVICE_OFFER_MODES as readonly string[]).includes(value);
}

export function isOperationalServiceProviderMode(
  value: string,
): value is OperationalServiceProviderMode {
  return (OPERATIONAL_SERVICE_PROVIDER_MODES as readonly string[]).includes(value);
}

export function operationalServiceCapabilityLabel(
  capabilityId: OperationalServiceCapabilityId,
): string {
  switch (capabilityId) {
    case SITE_INSTALLATION_SCOPE_ID:
      return SITE_INSTALLATION_LABEL;
    case TRANSPORT_CAPABILITY_ID:
      return TRANSPORT_CAPABILITY_LABEL;
    default: {
      const _exhaustive: never = capabilityId;
      return _exhaustive;
    }
  }
}

export function organizationServiceOfferModeLabel(
  offerMode: OrganizationServiceOfferMode,
): string {
  switch (offerMode) {
    case "SERVICE_DISABLED":
      return "Dezactivat";
    case "INTERNAL":
      return "Intern";
    case "SUBCONTRACTED":
      return "Subcontractat";
    case "BOTH":
      return "Intern și subcontractat";
    default: {
      const _exhaustive: never = offerMode;
      return _exhaustive;
    }
  }
}

export function operationalServiceProviderModeLabel(
  mode: OperationalServiceProviderMode,
): string {
  switch (mode) {
    case "INTERNAL":
      return "Echipă internă";
    case "SUBCONTRACTED":
      return "Subcontractat";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function resolveOrganizationServiceOffer(
  stored: {
    offerMode: string;
    version?: number;
    updatedAt?: string;
  } | null,
): OrganizationServiceOffer {
  if (!stored || !isOrganizationServiceOfferMode(stored.offerMode)) {
    return UNCONFIGURED_SITE_INSTALLATION_OFFER;
  }
  return {
    capabilityId: SITE_INSTALLATION_SCOPE_ID,
    configured: true,
    offerMode: stored.offerMode,
    version: stored.version ?? null,
    updatedAt: stored.updatedAt ?? null,
  };
}

export function allowedProviderModes(
  offer: OrganizationServiceOffer,
): readonly OperationalServiceProviderMode[] {
  if (!offer.configured || offer.offerMode === null) {
    return [];
  }
  switch (offer.offerMode) {
    case "SERVICE_DISABLED":
      return [];
    case "INTERNAL":
      return ["INTERNAL"];
    case "SUBCONTRACTED":
      return ["SUBCONTRACTED"];
    case "BOTH":
      return ["INTERNAL", "SUBCONTRACTED"];
    default: {
      const _exhaustive: never = offer.offerMode;
      return _exhaustive;
    }
  }
}

export function canSelectNewOperationalService(
  offer: OrganizationServiceOffer,
): boolean {
  return allowedProviderModes(offer).length > 0;
}

export function sameServiceMode(
  left: OperationalServiceProviderMode | null,
  right: OperationalServiceProviderMode | null,
): boolean {
  return left === right;
}

export function applyOrganizationServiceOffer(input: {
  capabilityId: string;
  offerMode: string;
  current: OrganizationServiceOfferRecord | null;
  updatedAt?: string;
}): OrganizationServiceOfferMutationResult {
  if (!isOperationalServiceCapabilityId(input.capabilityId)) {
    return { ok: false, error: "unknown_capability" };
  }
  if (!isSelectableOperationalServiceCapability(input.capabilityId)) {
    return { ok: false, error: "capability_reserved" };
  }
  if (!isOrganizationServiceOfferMode(input.offerMode)) {
    return { ok: false, error: "invalid_offer_mode" };
  }
  if (input.current && input.current.offerMode === input.offerMode) {
    return { ok: true, alreadyApplied: true, record: input.current };
  }
  return {
    ok: true,
    alreadyApplied: false,
    record: {
      capabilityId: SITE_INSTALLATION_SCOPE_ID,
      offerMode: input.offerMode,
      version: (input.current?.version ?? 0) + 1,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    },
  };
}

export function projectOperationalServicesAdmin(
  offer: OrganizationServiceOffer,
): OperationalServicesAdminProjection {
  return {
    capabilities: OPERATIONAL_SERVICE_CAPABILITY_IDS.map((capabilityId) => {
      const reserved = !isSelectableOperationalServiceCapability(capabilityId);
      if (reserved) {
        return {
          capabilityId,
          label: operationalServiceCapabilityLabel(capabilityId),
          selectable: false,
          reserved: true,
          configured: false,
          offerMode: null,
          version: null,
          updatedAt: null,
        };
      }
      return {
        capabilityId,
        label: operationalServiceCapabilityLabel(capabilityId),
        selectable: true,
        reserved: false,
        configured: offer.configured,
        offerMode: offer.offerMode,
        version: offer.version,
        updatedAt: offer.updatedAt,
      };
    }),
  };
}

export function projectSiteInstallationRequestOffer(input: {
  selected: boolean;
  mode: OperationalServiceProviderMode | null;
  offer: OrganizationServiceOffer;
  hasLinkedQuotes: boolean;
}): SiteInstallationRequestOfferView {
  const availableModes = allowedProviderModes(input.offer);
  const canSelectNew = availableModes.length > 0;
  const selectionLocked = input.hasLinkedQuotes;
  const persistedModeIncompatible =
    input.selected &&
    input.mode !== null &&
    availableModes.length > 0 &&
    !availableModes.includes(input.mode);
  return {
    capabilityId: SITE_INSTALLATION_SCOPE_ID,
    label: SITE_INSTALLATION_LABEL,
    selected: input.selected,
    mode: input.mode,
    orgConfigured: input.offer.configured,
    orgOfferMode: input.offer.offerMode,
    canSelectNew,
    canChangeSelection: !selectionLocked && (input.selected || canSelectNew),
    canChangeMode:
      !selectionLocked &&
      input.selected &&
      availableModes.length > 0 &&
      (availableModes.length > 1 || persistedModeIncompatible),
    selectionLocked,
    showModeControl:
      !selectionLocked &&
      (input.selected || canSelectNew) &&
      (availableModes.length > 1 || persistedModeIncompatible),
    availableModes,
    persistedSelectionPreserved: input.selected && !canSelectNew,
    persistedModeIncompatible,
  };
}

export function applyRequestServiceSelection(input: {
  currentScopeIds: readonly string[];
  currentMode: OperationalServiceProviderMode | null;
  nextScopeIds: readonly string[];
  requestedMode?: OperationalServiceProviderMode | null;
  offer: OrganizationServiceOffer;
  hasLinkedQuotes: boolean;
}):
  | {
      ok: true;
      optionalScopeIds: readonly string[];
      siteInstallationMode: OperationalServiceProviderMode | null;
    }
  | {
      ok: false;
      error:
        | "unknown_optional_scope"
        | "service_not_offered"
        | "service_selection_locked"
        | "service_mode_required"
        | "service_mode_unavailable"
        | "invalid_service_mode";
    } {
  const normalized = normalizeOptionalScopeIds(input.nextScopeIds);
  if (!normalized.ok) {
    return normalized;
  }
  const currentlySelected = input.currentScopeIds.includes(SITE_INSTALLATION_SCOPE_ID);
  const nextSelected = normalized.ids.includes(SITE_INSTALLATION_SCOPE_ID);
  const selectionChanged = !sameOptionalScopeIds(normalized.ids, input.currentScopeIds);
  const requestedModeChange =
    input.requestedMode !== undefined && input.requestedMode !== input.currentMode;
  if (input.hasLinkedQuotes && (selectionChanged || requestedModeChange)) {
    return { ok: false, error: "service_selection_locked" };
  }
  if (nextSelected && !currentlySelected && !canSelectNewOperationalService(input.offer)) {
    return { ok: false, error: "service_not_offered" };
  }
  const nextMode = resolveNextProviderMode({
    currentlySelected,
    nextSelected,
    currentMode: input.currentMode,
    requestedMode: input.requestedMode,
    offer: input.offer,
  });
  if (!nextMode.ok) {
    return nextMode;
  }
  return {
    ok: true,
    optionalScopeIds: normalized.ids,
    siteInstallationMode: nextMode.mode,
  };
}

function resolveNextProviderMode(input: {
  currentlySelected: boolean;
  nextSelected: boolean;
  currentMode: OperationalServiceProviderMode | null;
  requestedMode?: OperationalServiceProviderMode | null;
  offer: OrganizationServiceOffer;
}):
  | { ok: true; mode: OperationalServiceProviderMode | null }
  | {
      ok: false;
      error: "service_mode_required" | "service_mode_unavailable" | "invalid_service_mode";
    } {
  if (!input.nextSelected) {
    if (input.requestedMode) {
      return { ok: false, error: "invalid_service_mode" };
    }
    return { ok: true, mode: null };
  }
  const allowed = allowedProviderModes(input.offer);
  const requestedInPatch = input.requestedMode !== undefined;
  if (allowed.length === 0) {
    if (requestedInPatch && input.requestedMode !== input.currentMode) {
      return { ok: false, error: "service_mode_unavailable" };
    }
    return { ok: true, mode: input.currentMode };
  }
  if (input.currentlySelected && !requestedInPatch) {
    return { ok: true, mode: input.currentMode };
  }
  if (allowed.length === 1) {
    const onlyMode = allowed[0];
    if (requestedInPatch && input.requestedMode !== onlyMode) {
      return { ok: false, error: "invalid_service_mode" };
    }
    return { ok: true, mode: onlyMode };
  }
  const resolved = requestedInPatch ? input.requestedMode : input.currentMode;
  if (resolved === null || resolved === undefined) {
    return { ok: false, error: "service_mode_required" };
  }
  if (!allowed.includes(resolved)) {
    return { ok: false, error: "invalid_service_mode" };
  }
  return { ok: true, mode: resolved };
}
