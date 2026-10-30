import { useState } from "react";
import {
  fetchCatalogPresets,
  saveCatalogPreset,
  type CatalogPresetList,
  type CatalogPresetRecord,
  type CatalogPresetSelection,
} from "../../api/catalogCapabilities";
import type { CatalogPresetContractView } from "../../adapters/catalogCapabilitiesAdapter";
import { TransportError } from "../../api/http";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { useResource } from "../../data/useResource";

type CatalogVariantsProps = {
  productCode: string | null;
  preset: CatalogPresetContractView | null;
};

function parseList(payload: unknown): CatalogPresetList | null {
  if (typeof payload !== "object" || payload === null) return null;
  const row = payload as { canEdit?: unknown; presets?: unknown };
  if (typeof row.canEdit !== "boolean" || !Array.isArray(row.presets)) return null;
  const presets: CatalogPresetRecord[] = [];
  for (const item of row.presets) {
    if (typeof item !== "object" || item === null) return null;
    const preset = item as CatalogPresetRecord;
    if (typeof preset.presetId !== "string" || typeof preset.revision !== "number" || typeof preset.name !== "string") return null;
    if (preset.lifecycle !== "DRAFT" && preset.lifecycle !== "PUBLISHED" && preset.lifecycle !== "RETIRED") return null;
    if (!Array.isArray(preset.selections)) return null;
    presets.push(preset);
  }
  return { canEdit: row.canEdit, presets };
}

function selectionsFrom(fields: CatalogPresetContractView["fields"], choices: Record<string, string>): CatalogPresetSelection[] {
  return fields.flatMap((field) => {
    const value = choices[field.fieldId];
    return value ? [{ fieldId: field.fieldId, value }] : [];
  });
}

export function CatalogVariants({ productCode, preset }: CatalogVariantsProps) {
  const list = useResource(
    productCode && preset ? resourceKeys.catalogPresets(productCode) : null,
    async () => {
      const parsed = parseList(await fetchCatalogPresets(productCode ?? ""));
      if (!parsed) throw new Error("unpresentable_presets");
      return parsed;
    },
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CatalogPresetRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!productCode) return null;

  async function save(lifecycle: CatalogPresetRecord["lifecycle"], target = editing) {
    if (!preset || !productCode || pending || !list.data?.canEdit) return;
    setPending(true);
    setError(null);
    try {
      await saveCatalogPreset({
        presetId: target?.presetId ?? null,
        expectedRevision: target?.revision ?? null,
        templateCode: productCode,
        name: lifecycle === "RETIRED" && target ? target.name : name,
        description: lifecycle === "RETIRED" && target ? target.description : description,
        lifecycle,
        selections: target && lifecycle === "RETIRED" ? target.selections : selectionsFrom(preset.fields, choices),
      });
      setEditing(null);
      setName("");
      setDescription("");
      setChoices({});
      invalidateResources(resourceKeys.catalogPresets(productCode));
    } catch (caught) {
      setError(caught instanceof TransportError ? "Varianta nu a putut fi salvată. Verifică opțiunile sau reîncarcă lista." : "Varianta nu a putut fi salvată.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="catalog-workspace__variants" aria-labelledby="catalog-variants-heading">
      <h2 id="catalog-variants-heading">Variantele organizației</h2>
      {!preset ? <p>Contractul de variante nu este disponibil în această citire.</p> : null}
      {preset && preset.fields.length === 0 ? <p>Acest produs nu are opțiuni reutilizabile. Dimensiunile, textul și culorile rămân pe lucrare.</p> : null}
      {list.status === "error" ? <p>Variantele nu au putut fi citite.</p> : null}
      {preset && preset.fields.length > 0 && list.data ? (
        <>
          <p className="ui-note">Definiția platformei, versiunea {preset.templateVersion}. O variantă publicată nu înseamnă ofertă, cost complet sau lucrare gata.</p>
          <ul className="catalog-workspace__products">
            {list.data.presets.length === 0 ? <li>Nu există variante salvate.</li> : null}
            {list.data.presets.map((item) => (
              <li key={item.presetId}>
                <strong>{item.name}</strong>
                <span className="ui-note">{item.lifecycle === "PUBLISHED" ? "Publicată" : item.lifecycle === "DRAFT" ? "Ciornă" : "Retrasă"} · revizia {item.revision}</span>
                {item.description ? <span>{item.description}</span> : null}
                {list.data?.canEdit && item.lifecycle !== "RETIRED" ? (
                  <Button variant="secondary" disabled={pending} onClick={() => { setEditing(item); setName(item.name); setDescription(item.description); setChoices(Object.fromEntries(item.selections.map((selection) => [selection.fieldId, selection.value]))); }}>Continuă</Button>
                ) : null}
                {list.data?.canEdit && item.lifecycle === "PUBLISHED" ? (
                  <Button variant="secondary" disabled={pending} onClick={() => { setEditing(item); setName(item.name); setDescription(item.description); void save("RETIRED", item); }}>Retrage</Button>
                ) : null}
              </li>
            ))}
          </ul>
          {list.data.canEdit ? (
            <>
              <TextField id="preset-name" label="Numele variantei" value={name} onChange={setName} disabled={pending} />
              <TextField id="preset-description" label="Descriere" value={description} onChange={setDescription} disabled={pending} />
              {preset.fields.map((field) => (
                <div key={field.fieldId} className="catalog-workspace__search">
                  <label htmlFor={`preset-${field.fieldId}`}>{field.label}</label>
                  <select id={`preset-${field.fieldId}`} value={choices[field.fieldId] ?? ""} disabled={pending} onChange={(event) => setChoices((current) => ({ ...current, [field.fieldId]: event.target.value }))}>
                    <option value="">Neselectat</option>
                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {field.blocked.map((option) => <span key={option.value} className="ui-note">{option.label}: {option.message}</span>)}
                </div>
              ))}
              <div className="catalog-workspace__links">
                <Button disabled={pending || !name.trim()} onClick={() => void save("DRAFT")}>Salvează ciorna</Button>
                <Button disabled={pending || !name.trim()} onClick={() => void save("PUBLISHED")}>Publică</Button>
              </div>
            </>
          ) : <p>Poți consulta variantele publicate. Doar proprietarul le poate schimba.</p>}
          {error ? <p>{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}
