export const SITE_INSTALLATION_MEASUREMENT_STATUSES = [
  "UNCONFIRMED",
  "CUSTOMER_PROVIDED",
  "OFFICE_MEASURED",
] as const;
export type SiteInstallationMeasurementStatus =
  (typeof SITE_INSTALLATION_MEASUREMENT_STATUSES)[number];

export const SITE_INSTALLATION_FACADE_TYPES = [
  "UNCONFIRMED",
  "CONCRETE",
  "BRICK",
  "METAL",
  "ACM",
  "THERMAL_INSULATION",
  "DRYWALL",
  "GLASS",
  "WOOD",
  "OTHER",
] as const;
export type SiteInstallationFacadeType = (typeof SITE_INSTALLATION_FACADE_TYPES)[number];

export const SITE_INSTALLATION_FIXING_METHODS = [
  "UNCONFIRMED",
  "MECHANICAL_ANCHOR",
  "CHEMICAL_ANCHOR",
  "SCREW",
  "RIVET",
  "ADHESIVE",
  "SUBSTRUCTURE",
  "OTHER",
] as const;
export type SiteInstallationFixingMethod = (typeof SITE_INSTALLATION_FIXING_METHODS)[number];

export const SITE_INSTALLATION_ELECTRICAL_STATES = [
  "UNCONFIRMED",
  "INCLUDED",
  "SUBCONTRACTED",
  "EXCLUDED_CUSTOMER_RESPONSIBILITY",
  "NOT_APPLICABLE",
] as const;
export type SiteInstallationElectricalState =
  (typeof SITE_INSTALLATION_ELECTRICAL_STATES)[number];

export const DEFAULT_SITE_INSTALLATION_COUNTRY_CODE = "RO";
export const SITE_INSTALLATION_MAX_LINEAR_MM = 1_000_000;
export const SITE_INSTALLATION_TEXT_MAX_LENGTH = 120;
export const SITE_INSTALLATION_NOTES_MAX_LENGTH = 2000;

export const SITE_INSTALLATION_FACTS_MUTATION_ERRORS = [
  "not_found",
  "installation_not_selected",
  "installation_facts_locked",
  "invalid_facade_type",
  "invalid_fixing_method",
  "invalid_measurement_status",
  "invalid_site_electrical",
  "invalid_dimensions",
  "invalid_elevation",
  "invalid_country_code",
  "invalid_measured_at",
  "invalid_site_name",
  "invalid_street",
  "invalid_city",
  "invalid_county",
  "invalid_postal_code",
  "invalid_contact_name",
  "invalid_contact_phone",
  "invalid_access_notes",
  "invalid_measurement_notes",
  "invalid_crew_size",
  "invalid_planned_duration",
  "other_note_required",
  "expected_version_required",
  "version_conflict",
] as const;
export type SiteInstallationFactsMutationError =
  (typeof SITE_INSTALLATION_FACTS_MUTATION_ERRORS)[number];

export type SiteInstallationFacts = {
  requestId: string;
  version: number;
  siteName: string | null;
  street: string;
  city: string;
  county: string | null;
  postalCode: string | null;
  countryCode: string;
  contactName: string | null;
  contactPhone: string | null;
  accessNotes: string | null;
  measurementStatus: SiteInstallationMeasurementStatus;
  mountingSurfaceWidthMm: number | null;
  mountingSurfaceHeightMm: number | null;
  installationElevationMm: number | null;
  measuredAt: string | null;
  measurementNotes: string | null;
  facadeType: SiteInstallationFacadeType;
  facadeOtherNote: string | null;
  fixingMethod: SiteInstallationFixingMethod;
  fixingOtherNote: string | null;
  siteElectrical: SiteInstallationElectricalState;
  crewSize: number | null;
  plannedDurationHours: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SiteInstallationFactsPatch = {
  siteName?: string | null;
  street?: string;
  city?: string;
  county?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  accessNotes?: string | null;
  measurementStatus?: string;
  mountingSurfaceWidthMm?: number | null;
  mountingSurfaceHeightMm?: number | null;
  installationElevationMm?: number | null;
  measuredAt?: string | null;
  measurementNotes?: string | null;
  facadeType?: string;
  facadeOtherNote?: string | null;
  fixingMethod?: string;
  fixingOtherNote?: string | null;
  siteElectrical?: string;
  crewSize?: number | null;
  plannedDurationHours?: number | null;
};

export type SiteInstallationFactsMutationResult =
  | { ok: true; facts: SiteInstallationFacts; alreadyApplied: boolean }
  | { ok: false; error: SiteInstallationFactsMutationError };

export function isSiteInstallationMeasurementStatus(
  value: string,
): value is SiteInstallationMeasurementStatus {
  return (SITE_INSTALLATION_MEASUREMENT_STATUSES as readonly string[]).includes(value);
}

export function isSiteInstallationFacadeType(
  value: string,
): value is SiteInstallationFacadeType {
  return (SITE_INSTALLATION_FACADE_TYPES as readonly string[]).includes(value);
}

export function isSiteInstallationFixingMethod(
  value: string,
): value is SiteInstallationFixingMethod {
  return (SITE_INSTALLATION_FIXING_METHODS as readonly string[]).includes(value);
}

export function isSiteInstallationElectricalState(
  value: string,
): value is SiteInstallationElectricalState {
  return (SITE_INSTALLATION_ELECTRICAL_STATES as readonly string[]).includes(value);
}

export function siteInstallationMeasurementStatusLabel(
  status: SiteInstallationMeasurementStatus,
): string {
  switch (status) {
    case "UNCONFIRMED":
      return "Neconfirmate";
    case "CUSTOMER_PROVIDED":
      return "Comunicate de client";
    case "OFFICE_MEASURED":
      return "Măsurate de birou";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function siteInstallationFacadeTypeLabel(type: SiteInstallationFacadeType): string {
  switch (type) {
    case "UNCONFIRMED":
      return "Neconfirmat";
    case "CONCRETE":
      return "Beton";
    case "BRICK":
      return "Cărămidă";
    case "METAL":
      return "Metal";
    case "ACM":
      return "ACM";
    case "THERMAL_INSULATION":
      return "Termoizolație";
    case "DRYWALL":
      return "Gips-carton";
    case "GLASS":
      return "Sticlă";
    case "WOOD":
      return "Lemn";
    case "OTHER":
      return "Altul";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function siteInstallationFixingMethodLabel(
  method: SiteInstallationFixingMethod,
): string {
  switch (method) {
    case "UNCONFIRMED":
      return "Neconfirmat";
    case "MECHANICAL_ANCHOR":
      return "Ancoră mecanică";
    case "CHEMICAL_ANCHOR":
      return "Ancoră chimică";
    case "SCREW":
      return "Șurub";
    case "RIVET":
      return "Nit";
    case "ADHESIVE":
      return "Adeziv";
    case "SUBSTRUCTURE":
      return "Substructură";
    case "OTHER":
      return "Altul";
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

export function siteInstallationElectricalStateLabel(
  state: SiteInstallationElectricalState,
): string {
  switch (state) {
    case "UNCONFIRMED":
      return "Neconfirmat";
    case "INCLUDED":
      return "Inclus în lucrare";
    case "SUBCONTRACTED":
      return "Subcontractat";
    case "EXCLUDED_CUSTOMER_RESPONSIBILITY":
      return "Exclus — responsabilitatea clientului";
    case "NOT_APPLICABLE":
      return "Nu se aplică";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function blankSiteInstallationFacts(input: {
  requestId: string;
  createdAt: string;
}): SiteInstallationFacts {
  return {
    requestId: input.requestId,
    version: 0,
    siteName: null,
    street: "",
    city: "",
    county: null,
    postalCode: null,
    countryCode: DEFAULT_SITE_INSTALLATION_COUNTRY_CODE,
    contactName: null,
    contactPhone: null,
    accessNotes: null,
    measurementStatus: "UNCONFIRMED",
    mountingSurfaceWidthMm: null,
    mountingSurfaceHeightMm: null,
    installationElevationMm: null,
    measuredAt: null,
    measurementNotes: null,
    facadeType: "UNCONFIRMED",
    facadeOtherNote: null,
    fixingMethod: "UNCONFIRMED",
    fixingOtherNote: null,
    siteElectrical: "UNCONFIRMED",
    crewSize: null,
    plannedDurationHours: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function sameSiteInstallationFactsContent(
  left: SiteInstallationFacts,
  right: SiteInstallationFacts,
): boolean {
  return (
    left.siteName === right.siteName &&
    left.street === right.street &&
    left.city === right.city &&
    left.county === right.county &&
    left.postalCode === right.postalCode &&
    left.countryCode === right.countryCode &&
    left.contactName === right.contactName &&
    left.contactPhone === right.contactPhone &&
    left.accessNotes === right.accessNotes &&
    left.measurementStatus === right.measurementStatus &&
    left.mountingSurfaceWidthMm === right.mountingSurfaceWidthMm &&
    left.mountingSurfaceHeightMm === right.mountingSurfaceHeightMm &&
    left.installationElevationMm === right.installationElevationMm &&
    left.measuredAt === right.measuredAt &&
    left.measurementNotes === right.measurementNotes &&
    left.facadeType === right.facadeType &&
    left.facadeOtherNote === right.facadeOtherNote &&
    left.fixingMethod === right.fixingMethod &&
    left.fixingOtherNote === right.fixingOtherNote &&
    left.siteElectrical === right.siteElectrical &&
    left.crewSize === right.crewSize &&
    left.plannedDurationHours === right.plannedDurationHours
  );
}

export function applySiteInstallationFactsPatch(input: {
  selected: boolean;
  hasLinkedQuotes: boolean;
  current: SiteInstallationFacts | null;
  patch: SiteInstallationFactsPatch;
  expectedVersion: number;
  requestId: string;
  updatedAt?: string;
}): SiteInstallationFactsMutationResult {
  if (!input.selected) {
    return { ok: false, error: "installation_not_selected" };
  }
  if (input.hasLinkedQuotes) {
    return { ok: false, error: "installation_facts_locked" };
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    return { ok: false, error: "expected_version_required" };
  }
  const now = input.updatedAt ?? new Date().toISOString();
  const current =
    input.current ??
    blankSiteInstallationFacts({ requestId: input.requestId, createdAt: now });
  if (input.expectedVersion !== current.version) {
    return { ok: false, error: "version_conflict" };
  }

  const merged = mergeFactsPatch(current, input.patch);
  if (!merged.ok) {
    return merged;
  }
  if (input.current && sameSiteInstallationFactsContent(input.current, merged.facts)) {
    return { ok: true, facts: input.current, alreadyApplied: true };
  }
  const creating = input.current === null;
  return {
    ok: true,
    alreadyApplied: false,
    facts: {
      ...merged.facts,
      requestId: input.requestId,
      version: current.version + 1,
      createdAt: creating ? now : current.createdAt,
      updatedAt: now,
    },
  };
}

function mergeFactsPatch(
  current: SiteInstallationFacts,
  patch: SiteInstallationFactsPatch,
): SiteInstallationFactsMutationResult {
  let next: SiteInstallationFacts = { ...current };

  if (patch.siteName !== undefined) {
    const siteName = readOptionalText(patch.siteName, SITE_INSTALLATION_TEXT_MAX_LENGTH);
    if (siteName === false) {
      return { ok: false, error: "invalid_site_name" };
    }
    next = { ...next, siteName };
  }
  if (patch.street !== undefined) {
    const street = readRequiredText(patch.street, SITE_INSTALLATION_TEXT_MAX_LENGTH);
    if (street === null) {
      return { ok: false, error: "invalid_street" };
    }
    next = { ...next, street };
  }
  if (patch.city !== undefined) {
    const city = readRequiredText(patch.city, SITE_INSTALLATION_TEXT_MAX_LENGTH);
    if (city === null) {
      return { ok: false, error: "invalid_city" };
    }
    next = { ...next, city };
  }
  if (patch.county !== undefined) {
    const county = readOptionalText(patch.county, SITE_INSTALLATION_TEXT_MAX_LENGTH);
    if (county === false) {
      return { ok: false, error: "invalid_county" };
    }
    next = { ...next, county };
  }
  if (patch.postalCode !== undefined) {
    const postalCode = readOptionalText(patch.postalCode, 20);
    if (postalCode === false) {
      return { ok: false, error: "invalid_postal_code" };
    }
    next = { ...next, postalCode };
  }
  if (patch.countryCode !== undefined) {
    const countryCode = readCountryCode(patch.countryCode);
    if (!countryCode) {
      return { ok: false, error: "invalid_country_code" };
    }
    next = { ...next, countryCode };
  }
  if (patch.contactName !== undefined) {
    const contactName = readOptionalText(
      patch.contactName,
      SITE_INSTALLATION_TEXT_MAX_LENGTH,
    );
    if (contactName === false) {
      return { ok: false, error: "invalid_contact_name" };
    }
    next = { ...next, contactName };
  }
  if (patch.contactPhone !== undefined) {
    const contactPhone = readOptionalText(
      patch.contactPhone,
      SITE_INSTALLATION_TEXT_MAX_LENGTH,
    );
    if (contactPhone === false) {
      return { ok: false, error: "invalid_contact_phone" };
    }
    next = { ...next, contactPhone };
  }
  if (patch.accessNotes !== undefined) {
    const accessNotes = readOptionalText(
      patch.accessNotes,
      SITE_INSTALLATION_NOTES_MAX_LENGTH,
    );
    if (accessNotes === false) {
      return { ok: false, error: "invalid_access_notes" };
    }
    next = { ...next, accessNotes };
  }
  if (patch.measurementStatus !== undefined) {
    if (!isSiteInstallationMeasurementStatus(patch.measurementStatus)) {
      return { ok: false, error: "invalid_measurement_status" };
    }
    next = { ...next, measurementStatus: patch.measurementStatus };
  }
  if (patch.mountingSurfaceWidthMm !== undefined) {
    const width = readOptionalMillimetres(patch.mountingSurfaceWidthMm);
    if (width === false) {
      return { ok: false, error: "invalid_dimensions" };
    }
    next = { ...next, mountingSurfaceWidthMm: width };
  }
  if (patch.mountingSurfaceHeightMm !== undefined) {
    const height = readOptionalMillimetres(patch.mountingSurfaceHeightMm);
    if (height === false) {
      return { ok: false, error: "invalid_dimensions" };
    }
    next = { ...next, mountingSurfaceHeightMm: height };
  }
  if (patch.installationElevationMm !== undefined) {
    const elevation = readOptionalMillimetres(patch.installationElevationMm);
    if (elevation === false) {
      return { ok: false, error: "invalid_elevation" };
    }
    next = { ...next, installationElevationMm: elevation };
  }
  if (patch.measuredAt !== undefined) {
    const measuredAt = readOptionalMeasuredAt(patch.measuredAt);
    if (measuredAt === false) {
      return { ok: false, error: "invalid_measured_at" };
    }
    next = { ...next, measuredAt };
  }
  if (patch.measurementNotes !== undefined) {
    const measurementNotes = readOptionalText(
      patch.measurementNotes,
      SITE_INSTALLATION_NOTES_MAX_LENGTH,
    );
    if (measurementNotes === false) {
      return { ok: false, error: "invalid_measurement_notes" };
    }
    next = { ...next, measurementNotes };
  }
  if (patch.facadeType !== undefined) {
    if (!isSiteInstallationFacadeType(patch.facadeType)) {
      return { ok: false, error: "invalid_facade_type" };
    }
    next = {
      ...next,
      facadeType: patch.facadeType,
      facadeOtherNote: patch.facadeType === "OTHER" ? next.facadeOtherNote : null,
    };
  }
  if (patch.facadeOtherNote !== undefined) {
    const facadeOtherNote = readOptionalText(
      patch.facadeOtherNote,
      SITE_INSTALLATION_NOTES_MAX_LENGTH,
    );
    if (facadeOtherNote === false) {
      return { ok: false, error: "invalid_access_notes" };
    }
    next = { ...next, facadeOtherNote };
  }
  if (patch.fixingMethod !== undefined) {
    if (!isSiteInstallationFixingMethod(patch.fixingMethod)) {
      return { ok: false, error: "invalid_fixing_method" };
    }
    next = {
      ...next,
      fixingMethod: patch.fixingMethod,
      fixingOtherNote: patch.fixingMethod === "OTHER" ? next.fixingOtherNote : null,
    };
  }
  if (patch.fixingOtherNote !== undefined) {
    const fixingOtherNote = readOptionalText(
      patch.fixingOtherNote,
      SITE_INSTALLATION_NOTES_MAX_LENGTH,
    );
    if (fixingOtherNote === false) {
      return { ok: false, error: "invalid_access_notes" };
    }
    next = { ...next, fixingOtherNote };
  }
  if (patch.siteElectrical !== undefined) {
    if (!isSiteInstallationElectricalState(patch.siteElectrical)) {
      return { ok: false, error: "invalid_site_electrical" };
    }
    next = { ...next, siteElectrical: patch.siteElectrical };
  }
  if (patch.crewSize !== undefined) {
    const crewSize = readOptionalCrewSize(patch.crewSize);
    if (crewSize === false) {
      return { ok: false, error: "invalid_crew_size" };
    }
    next = { ...next, crewSize };
  }
  if (patch.plannedDurationHours !== undefined) {
    const plannedDurationHours = readOptionalPlannedDuration(patch.plannedDurationHours);
    if (plannedDurationHours === false) {
      return { ok: false, error: "invalid_planned_duration" };
    }
    next = { ...next, plannedDurationHours };
  }

  if (next.facadeType === "OTHER" && !next.facadeOtherNote) {
    return { ok: false, error: "other_note_required" };
  }
  if (next.fixingMethod === "OTHER" && !next.fixingOtherNote) {
    return { ok: false, error: "other_note_required" };
  }

  return { ok: true, alreadyApplied: false, facts: next };
}

function readRequiredText(value: string, maxLength: number): string | null {
  if (value.length > maxLength) {
    return null;
  }
  return value.trim();
}

function readOptionalText(
  value: string | null,
  maxLength: number,
): string | null | false {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return false;
  }
  return trimmed.length === 0 ? null : trimmed;
}

function readCountryCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function readOptionalMillimetres(value: number | null): number | null | false {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value <= 0 || value > SITE_INSTALLATION_MAX_LINEAR_MM) {
    return false;
  }
  return value;
}

function readOptionalCrewSize(value: number | null): number | null | false {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    return false;
  }
  return value;
}

function readOptionalPlannedDuration(value: number | null): number | null | false {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    return false;
  }
  const scaled = Math.round(value * 100);
  if (Math.abs(value * 100 - scaled) > 1e-8) {
    return false;
  }
  return scaled / 100;
}

function readOptionalMeasuredAt(value: string | null): string | null | false {
  if (value === null || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return false;
  }
  if (dateOnly) {
    return trimmed;
  }
  return new Date(parsed).toISOString();
}
