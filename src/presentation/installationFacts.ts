const MEASUREMENT_STATUS_LABELS: Record<string, string> = {
  UNCONFIRMED: "Neconfirmate",
  CUSTOMER_PROVIDED: "Comunicate de client",
  OFFICE_MEASURED: "Măsurate de birou",
};

const FACADE_TYPE_LABELS: Record<string, string> = {
  UNCONFIRMED: "Neconfirmat",
  CONCRETE: "Beton",
  BRICK: "Cărămidă",
  METAL: "Metal",
  ACM: "ACM",
  THERMAL_INSULATION: "Termoizolație",
  DRYWALL: "Gips-carton",
  GLASS: "Sticlă",
  WOOD: "Lemn",
  OTHER: "Altul",
};

const FIXING_METHOD_LABELS: Record<string, string> = {
  UNCONFIRMED: "Neconfirmat",
  MECHANICAL_ANCHOR: "Ancoră mecanică",
  CHEMICAL_ANCHOR: "Ancoră chimică",
  SCREW: "Șurub",
  RIVET: "Nit",
  ADHESIVE: "Adeziv",
  SUBSTRUCTURE: "Substructură",
  OTHER: "Altul",
};

const ELECTRICAL_STATE_LABELS: Record<string, string> = {
  UNCONFIRMED: "Neconfirmat",
  INCLUDED: "Inclus în lucrare",
  SUBCONTRACTED: "Subcontractat",
  EXCLUDED_CUSTOMER_RESPONSIBILITY: "Exclus — responsabilitatea clientului",
  NOT_APPLICABLE: "Nu se aplică",
};

const PROVIDER_MODE_LABELS: Record<string, string> = {
  INTERNAL: "Echipă internă",
  SUBCONTRACTED: "Subcontractat",
};

export function presentMeasurementStatusLabel(value: string): string {
  return MEASUREMENT_STATUS_LABELS[value] ?? value;
}

export function presentFacadeTypeLabel(value: string): string {
  return FACADE_TYPE_LABELS[value] ?? value;
}

export function presentFixingMethodLabel(value: string): string {
  return FIXING_METHOD_LABELS[value] ?? value;
}

export function presentElectricalStateLabel(value: string): string {
  return ELECTRICAL_STATE_LABELS[value] ?? value;
}

export function presentInstallationModeLabel(value: string | null): string {
  if (!value) {
    return "Neales";
  }
  return PROVIDER_MODE_LABELS[value] ?? value;
}

export const MEASUREMENT_STATUS_OPTIONS = Object.entries(MEASUREMENT_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const FACADE_TYPE_OPTIONS = Object.entries(FACADE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const FIXING_METHOD_OPTIONS = Object.entries(FIXING_METHOD_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const ELECTRICAL_STATE_OPTIONS = Object.entries(ELECTRICAL_STATE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
