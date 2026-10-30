import { getJson, postJson } from "./http";

export function fetchCatalogCapabilities(): Promise<unknown> {
  return getJson("/api/catalog/capabilities");
}

export type CatalogPresetSelection = { fieldId: string; value: string };

export type CatalogPresetRecord = {
  presetId: string;
  revision: number;
  lifecycle: "DRAFT" | "PUBLISHED" | "RETIRED";
  name: string;
  description: string;
  templateCode: string;
  templateVersion: string;
  selections: CatalogPresetSelection[];
  supersedesRevision: number | null;
};

export type CatalogPresetList = {
  canEdit: boolean;
  presets: CatalogPresetRecord[];
};

export function fetchCatalogPresets(templateCode: string): Promise<unknown> {
  return getJson(`/api/catalog/presets?templateCode=${encodeURIComponent(templateCode)}`);
}

export function saveCatalogPreset(body: {
  presetId: string | null;
  expectedRevision: number | null;
  templateCode: string;
  name: string;
  description: string;
  lifecycle: CatalogPresetRecord["lifecycle"];
  selections: CatalogPresetSelection[];
}): Promise<unknown> {
  return postJson("/api/catalog/presets", body);
}
