import { fetchCatalogPresets, type CatalogPresetRecord } from "../../api/catalogCapabilities";
import { resourceKeys } from "../../data/resourceKeys";
import { useResource } from "../../data/useResource";
import { applyPresetSelections } from "./applyPresetSelections";

type ConfiguratorPresetBarProps = {
  productCode: string;
  drafts: Record<string, string>;
  onApply: (drafts: Record<string, string>) => void;
};

function publishedPresets(payload: unknown): CatalogPresetRecord[] {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { presets?: unknown }).presets)) return [];
  return ((payload as { presets: CatalogPresetRecord[] }).presets).filter((preset) => preset.lifecycle === "PUBLISHED");
}

export function ConfiguratorPresetBar({ productCode, drafts, onApply }: ConfiguratorPresetBarProps) {
  const list = useResource(resourceKeys.catalogPresets(productCode), () => fetchCatalogPresets(productCode));
  const presets = list.status === "success" ? publishedPresets(list.data) : [];
  if (list.status === "error" || presets.length === 0) return null;
  return (
    <label className="catalog-workspace__search">
      Variantă publicată
      <select
        aria-label="Variantă publicată"
        defaultValue=""
        onChange={(event) => {
          const preset = presets.find((item) => item.presetId === event.target.value);
          if (!preset) return;
          onApply(applyPresetSelections(drafts, preset.selections));
        }}
      >
        <option value="">Alege o variantă</option>
        {presets.map((preset) => <option key={preset.presetId} value={preset.presetId}>{preset.name}</option>)}
      </select>
    </label>
  );
}
