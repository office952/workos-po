import { asRecord, asString } from "./record";

export type ExternalProductionProviderRow = {
  providerId: string;
  name: string;
  active: boolean;
};

export type ExternalProductionAdmin = {
  canWrite: boolean;
  mode: "DISABLED" | "ENABLED";
  modeLabel: string;
  source: string;
  version: number;
  providers: ExternalProductionProviderRow[];
};

export const EXTERNAL_PRODUCTION_MODE_OPTIONS = [
  { value: "DISABLED", label: "Oprit" },
  { value: "ENABLED", label: "Activ" },
] as const;

export function presentExternalProduction(payload: unknown): ExternalProductionAdmin | null {
  const record = asRecord(payload);
  const mode = asString(record?.mode);
  const modeLabel = asString(record?.modeLabel);
  if (!record || (mode !== "DISABLED" && mode !== "ENABLED") || !modeLabel) {
    return null;
  }
  return {
    canWrite: record.canWrite === true,
    mode,
    modeLabel,
    source: asString(record.source) ?? "",
    version: typeof record.version === "number" ? record.version : 0,
    providers: presentProviders(record.providers),
  };
}

function presentProviders(value: unknown): ExternalProductionProviderRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    const providerId = asString(row?.providerId);
    const name = asString(row?.name);
    if (!providerId || !name || typeof row?.active !== "boolean") {
      return [];
    }
    return [{ providerId, name, active: row.active }];
  });
}
