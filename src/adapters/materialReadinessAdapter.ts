import { asRecord, asString } from "./record";

export type MaterialReadinessAdmin = {
  canWrite: boolean;
  mode: "DISABLED" | "REQUIRED";
  modeLabel: string;
  source: string;
  version: number;
};

export const MATERIAL_READINESS_MODE_OPTIONS = [
  { value: "DISABLED", label: "Oprit" },
  { value: "REQUIRED", label: "Obligatoriu" },
] as const;

export function presentMaterialReadiness(payload: unknown): MaterialReadinessAdmin | null {
  const record = asRecord(payload);
  const mode = asString(record?.mode);
  const modeLabel = asString(record?.modeLabel);
  if (!record || (mode !== "DISABLED" && mode !== "REQUIRED") || !modeLabel) {
    return null;
  }
  return {
    canWrite: record.canWrite === true,
    mode,
    modeLabel,
    source: asString(record.source) ?? "",
    version: typeof record.version === "number" ? record.version : 0,
  };
}
