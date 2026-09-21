import { asNumber, asRecord, asString } from "./record";

export type TechnicalSettingAdminItem = {
  definitionId: string;
  settingId: string;
  typeId: string;
  label: string;
  description: string;
  value: string;
  unit: string;
  source: string | null;
  sourceLabel: string | null;
  version: number | null;
  status: string | null;
  statusLabel: string | null;
  effectiveFrom: string | null;
};

export type TechnicalSettingHistoryItem = {
  definitionId: string;
  settingId: string;
  version: number;
  status: string;
  statusLabel: string;
  source: string;
  sourceLabel: string;
  value: number | null;
  unit: string;
  createdAt: string | null;
  effectiveFrom: string | null;
};

export type TechnicalSettingsAdminTransport = {
  canEdit: boolean;
  resolutionOk: boolean;
  guidance: string | null;
  settings: TechnicalSettingAdminItem[];
  history: TechnicalSettingHistoryItem[];
};

function numberDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

export function presentTechnicalSettingsAdmin(
  payload: unknown,
): TechnicalSettingsAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const settings = Array.isArray(record.settings)
    ? record.settings.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.settingId !== "string") {
          return [];
        }
        return [
          {
            definitionId: asString(row.definitionId) ?? "",
            settingId: row.settingId,
            typeId: asString(row.typeId) ?? "",
            label: asString(row.label) ?? row.settingId,
            description: asString(row.description) ?? "",
            value: numberDraft(asNumber(row.value)),
            unit: asString(row.unit) ?? "",
            source: asString(row.source),
            sourceLabel: asString(row.sourceLabel),
            version: asNumber(row.version),
            status: asString(row.status),
            statusLabel: asString(row.statusLabel),
            effectiveFrom: asString(row.effectiveFrom),
          },
        ];
      })
    : [];
  const history = Array.isArray(record.history)
    ? record.history.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.version !== "number" || typeof row.settingId !== "string") {
          return [];
        }
        return [
          {
            definitionId: asString(row.definitionId) ?? "",
            settingId: row.settingId,
            version: row.version,
            status: asString(row.status) ?? "",
            statusLabel: asString(row.statusLabel) ?? "",
            source: asString(row.source) ?? "",
            sourceLabel: asString(row.sourceLabel) ?? "",
            value: asNumber(row.value),
            unit: asString(row.unit) ?? "",
            createdAt: asString(row.createdAt),
            effectiveFrom: asString(row.effectiveFrom),
          },
        ];
      })
    : [];
  return {
    canEdit: record.canEdit === true,
    resolutionOk: record.resolutionOk !== false,
    guidance: asString(record.guidance),
    settings,
    history,
  };
}
