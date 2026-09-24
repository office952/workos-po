import {
  siteInstallationElectricalStateLabel,
  siteInstallationFacadeTypeLabel,
  siteInstallationFixingMethodLabel,
  type SiteInstallationElectricalState,
  type SiteInstallationFacadeType,
  type SiteInstallationFacts,
  type SiteInstallationFixingMethod,
  type SiteInstallationMeasurementStatus,
} from "./facts.js";

export const FROZEN_HOST_CONTEXT_SCHEMA_VERSION = 1 as const;
export const FROZEN_HOST_CONTEXT_KIND = "EXISTING_SITE_SURFACE" as const;
export const FROZEN_MOUNTING_INTERFACE_SCHEMA_VERSION = 1 as const;
export const FROZEN_MOUNTING_INTERFACE_KIND = "WORK_ON_EXISTING_HOST" as const;
export const FROZEN_SITE_EXECUTION_CONTEXT_SCHEMA_VERSION = 1 as const;

export type FrozenHostContextV1 = {
  schemaVersion: typeof FROZEN_HOST_CONTEXT_SCHEMA_VERSION;
  kind: typeof FROZEN_HOST_CONTEXT_KIND;
  sourceRequestId: string;
  sourceFactsVersion: number;
  measurementStatus: SiteInstallationMeasurementStatus;
  surfaceType: SiteInstallationFacadeType;
  surfaceOtherNote?: string;
  mountingSurfaceWidthMm?: number;
  mountingSurfaceHeightMm?: number;
  measurementNotes?: string;
};

export type FrozenMountingInterfaceV1 = {
  schemaVersion: typeof FROZEN_MOUNTING_INTERFACE_SCHEMA_VERSION;
  kind: typeof FROZEN_MOUNTING_INTERFACE_KIND;
  fixingMethod: SiteInstallationFixingMethod;
  fixingOtherNote?: string;
};

export type FrozenSiteExecutionContextV1 = {
  schemaVersion: typeof FROZEN_SITE_EXECUTION_CONTEXT_SCHEMA_VERSION;
  siteName?: string;
  street: string;
  city: string;
  county?: string;
  postalCode?: string;
  countryCode: string;
  contactName?: string;
  contactPhone?: string;
  accessNotes?: string;
  installationElevationMm?: number;
  siteElectrical: SiteInstallationElectricalState;
  crewSize?: number;
  plannedDurationHours?: number;
};

export type FrozenSiteInstallationContexts = {
  hostContext: FrozenHostContextV1;
  mountingInterface: FrozenMountingInterfaceV1;
  siteExecutionContext: FrozenSiteExecutionContextV1;
};

const COMPLETABLE_ELECTRICAL = new Set<SiteInstallationElectricalState>([
  "EXCLUDED_CUSTOMER_RESPONSIBILITY",
  "NOT_APPLICABLE",
]);

export function freezeSiteInstallationContexts(
  facts: SiteInstallationFacts,
  requestId: string,
): FrozenSiteInstallationContexts | null {
  if (facts.requestId !== requestId || facts.version < 1) {
    return null;
  }
  if (facts.measurementStatus === "UNCONFIRMED" || facts.facadeType === "UNCONFIRMED") {
    return null;
  }
  if (facts.fixingMethod === "UNCONFIRMED") {
    return null;
  }
  if (!COMPLETABLE_ELECTRICAL.has(facts.siteElectrical)) {
    return null;
  }
  const street = facts.street.trim();
  const city = facts.city.trim();
  const countryCode = facts.countryCode.trim();
  if (!street || !city || !countryCode) {
    return null;
  }
  if (facts.facadeType === "OTHER" && !facts.facadeOtherNote?.trim()) {
    return null;
  }
  if (facts.fixingMethod === "OTHER" && !facts.fixingOtherNote?.trim()) {
    return null;
  }
  const width = optionalPositive(facts.mountingSurfaceWidthMm);
  const height = optionalPositive(facts.mountingSurfaceHeightMm);
  const elevation = optionalPositive(facts.installationElevationMm);
  if (
    facts.mountingSurfaceWidthMm !== null && width === undefined ||
    facts.mountingSurfaceHeightMm !== null && height === undefined ||
    facts.installationElevationMm !== null && elevation === undefined
  ) {
    return null;
  }
  const hostContext: FrozenHostContextV1 = {
    schemaVersion: FROZEN_HOST_CONTEXT_SCHEMA_VERSION,
    kind: FROZEN_HOST_CONTEXT_KIND,
    sourceRequestId: facts.requestId,
    sourceFactsVersion: facts.version,
    measurementStatus: facts.measurementStatus,
    surfaceType: facts.facadeType,
    ...optionalText("surfaceOtherNote", facts.facadeOtherNote),
    ...(width !== undefined ? { mountingSurfaceWidthMm: width } : {}),
    ...(height !== undefined ? { mountingSurfaceHeightMm: height } : {}),
    ...optionalText("measurementNotes", facts.measurementNotes),
  };
  const mountingInterface: FrozenMountingInterfaceV1 = {
    schemaVersion: FROZEN_MOUNTING_INTERFACE_SCHEMA_VERSION,
    kind: FROZEN_MOUNTING_INTERFACE_KIND,
    fixingMethod: facts.fixingMethod,
    ...optionalText("fixingOtherNote", facts.fixingOtherNote),
  };
  const siteExecutionContext: FrozenSiteExecutionContextV1 = {
    schemaVersion: FROZEN_SITE_EXECUTION_CONTEXT_SCHEMA_VERSION,
    ...optionalText("siteName", facts.siteName),
    street,
    city,
    ...optionalText("county", facts.county),
    ...optionalText("postalCode", facts.postalCode),
    countryCode,
    ...optionalText("contactName", facts.contactName),
    ...optionalText("contactPhone", facts.contactPhone),
    ...optionalText("accessNotes", facts.accessNotes),
    ...(elevation !== undefined ? { installationElevationMm: elevation } : {}),
    siteElectrical: facts.siteElectrical,
    ...(facts.crewSize && facts.crewSize > 0 ? { crewSize: facts.crewSize } : {}),
    ...(facts.plannedDurationHours && facts.plannedDurationHours > 0
      ? { plannedDurationHours: facts.plannedDurationHours }
      : {}),
  };
  return { hostContext, mountingInterface, siteExecutionContext };
}

export function isFrozenHostContextV1(value: FrozenHostContextV1 | undefined): boolean {
  if (!value) {
    return false;
  }
  if (
    value.schemaVersion !== 1 ||
    value.kind !== FROZEN_HOST_CONTEXT_KIND ||
    value.sourceRequestId.trim() === "" ||
    !Number.isInteger(value.sourceFactsVersion) ||
    value.sourceFactsVersion < 1 ||
    value.measurementStatus === "UNCONFIRMED" ||
    value.surfaceType === "UNCONFIRMED"
  ) {
    return false;
  }
  if (value.surfaceType === "OTHER" && !value.surfaceOtherNote?.trim()) {
    return false;
  }
  return optionalDimension(value.mountingSurfaceWidthMm) && optionalDimension(value.mountingSurfaceHeightMm);
}

export function isFrozenMountingInterfaceV1(
  value: FrozenMountingInterfaceV1 | undefined,
): boolean {
  if (!value) {
    return false;
  }
  if (
    value.schemaVersion !== 1 ||
    value.kind !== FROZEN_MOUNTING_INTERFACE_KIND ||
    value.fixingMethod === "UNCONFIRMED"
  ) {
    return false;
  }
  return value.fixingMethod !== "OTHER" || Boolean(value.fixingOtherNote?.trim());
}

export function isFrozenSiteExecutionContextV1(
  value: FrozenSiteExecutionContextV1 | undefined,
  providerMode: "INTERNAL" | "SUBCONTRACTED",
): boolean {
  if (!value || value.schemaVersion !== 1) {
    return false;
  }
  if (!value.street.trim() || !value.city.trim() || !value.countryCode.trim()) {
    return false;
  }
  if (
    value.siteElectrical !== "EXCLUDED_CUSTOMER_RESPONSIBILITY" &&
    value.siteElectrical !== "NOT_APPLICABLE"
  ) {
    return false;
  }
  if (!optionalDimension(value.installationElevationMm)) {
    return false;
  }
  if (providerMode === "INTERNAL") {
    return (value.crewSize ?? 0) > 0 && (value.plannedDurationHours ?? 0) > 0;
  }
  return true;
}

export type SiteInstallationOperationalView = {
  providerMode: "INTERNAL" | "SUBCONTRACTED";
  providerModeLabel: string;
  siteName: string | null;
  street: string;
  city: string;
  surfaceTypeLabel: string;
  mountingSurfaceWidthMm: number | null;
  mountingSurfaceHeightMm: number | null;
  fixingMethodLabel: string;
  installationElevationMm: number | null;
  siteElectricalLabel: string;
  accessNotes: string | null;
  contactName: string | null;
  contactPhone: string | null;
  crewSize: number | null;
  plannedDurationHours: number | null;
};

export function projectSiteInstallationOperationalView(input: {
  providerMode: "INTERNAL" | "SUBCONTRACTED";
  hostContext: FrozenHostContextV1;
  mountingInterface: FrozenMountingInterfaceV1;
  siteExecutionContext: FrozenSiteExecutionContextV1;
}): SiteInstallationOperationalView {
  const execution = input.siteExecutionContext;
  return {
    providerMode: input.providerMode,
    providerModeLabel: input.providerMode === "INTERNAL" ? "Intern" : "Subcontractat",
    siteName: execution.siteName ?? null,
    street: execution.street,
    city: execution.city,
    surfaceTypeLabel: siteInstallationFacadeTypeLabel(input.hostContext.surfaceType),
    mountingSurfaceWidthMm: input.hostContext.mountingSurfaceWidthMm ?? null,
    mountingSurfaceHeightMm: input.hostContext.mountingSurfaceHeightMm ?? null,
    fixingMethodLabel: siteInstallationFixingMethodLabel(input.mountingInterface.fixingMethod),
    installationElevationMm: execution.installationElevationMm ?? null,
    siteElectricalLabel: siteInstallationElectricalStateLabel(execution.siteElectrical),
    accessNotes: execution.accessNotes ?? null,
    contactName: execution.contactName ?? null,
    contactPhone: execution.contactPhone ?? null,
    crewSize: input.providerMode === "INTERNAL" ? execution.crewSize ?? null : null,
    plannedDurationHours:
      input.providerMode === "INTERNAL" ? execution.plannedDurationHours ?? null : null,
  };
}

export function copyFrozenHostContext(value: FrozenHostContextV1): FrozenHostContextV1 {
  return { ...value };
}

export function copyFrozenMountingInterface(
  value: FrozenMountingInterfaceV1,
): FrozenMountingInterfaceV1 {
  return { ...value };
}

export function copyFrozenSiteExecutionContext(
  value: FrozenSiteExecutionContextV1,
): FrozenSiteExecutionContextV1 {
  return { ...value };
}

function optionalPositive(value: number | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function optionalDimension(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value > 0);
}

function optionalText<K extends string>(
  key: K,
  value: string | null,
): Partial<Record<K, string>> {
  const text = value?.trim() ?? "";
  return text ? ({ [key]: text } as Partial<Record<K, string>>) : {};
}
