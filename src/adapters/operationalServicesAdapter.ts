import type { OperationalServicesAdminTransport } from "../api/types";
import { asBoolean, asRecord, asString } from "./record";

const MODE_LABELS: Record<string, string> = {
  SERVICE_DISABLED: "Dezactivat",
  INTERNAL: "Intern",
  SUBCONTRACTED: "Subcontractat",
  BOTH: "Ambele",
};

export function presentOperationalServices(
  payload: unknown,
): OperationalServicesAdminTransport | null {
  const record = asRecord(payload);
  const services = asRecord(record?.services);
  const capabilities = Array.isArray(services?.capabilities) ? services.capabilities : null;
  if (!capabilities) {
    return null;
  }
  return {
    canWrite: asBoolean(record?.canWrite) ?? false,
    capabilities: capabilities.flatMap((item) => {
      const row = asRecord(item);
      const capabilityId = asString(row?.capabilityId);
      const label = asString(row?.label);
      if (!row || !capabilityId || !label) {
        return [];
      }
      const offerMode = asString(row.offerMode);
      return [
        {
          capabilityId,
          label,
          selectable: row.selectable === true,
          reserved: row.reserved === true,
          offerMode,
          offerModeLabel: offerMode ? MODE_LABELS[offerMode] ?? offerMode : "Neconfigurat",
        },
      ];
    }),
  };
}

export const OPERATIONAL_SERVICE_MODE_OPTIONS = [
  { value: "SERVICE_DISABLED", label: "Dezactivat" },
  { value: "INTERNAL", label: "Intern" },
  { value: "SUBCONTRACTED", label: "Subcontractat" },
  { value: "BOTH", label: "Ambele" },
] as const;
