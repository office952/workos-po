import { Fragment, useRef, useState } from "react";
import {
  fetchCatalogPresets,
  saveCatalogPreset,
  type CatalogPresetList,
  type CatalogPresetRecord,
  type CatalogPresetSelection,
} from "../../api/catalogCapabilities";
import type { CatalogPresetContractView } from "../../adapters/catalogCapabilitiesAdapter";
import { TransportError } from "../../api/http";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { useResource } from "../../data/useResource";
import "../../styles/surfaces/catalog-v2-variants.css";

type CatalogVariantsProps = {
  productCode: string | null;
  preset: CatalogPresetContractView | null;
};

type SaveFailure = { message: string; reasons: string[]; conflict: boolean };

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

function lifecycleLabel(lifecycle: CatalogPresetRecord["lifecycle"]): string {
  switch (lifecycle) {
    case "PUBLISHED":
      return "Publicată";
    case "DRAFT":
      return "Ciornă";
    case "RETIRED":
      return "Retrasă";
    default: {
      const exhaustive: never = lifecycle;
      return exhaustive;
    }
  }
}

/** Option labels of a saved variant, read from the product's own option list. Unknown values are not shown as codes. */
function selectionLabels(fields: CatalogPresetContractView["fields"], selections: readonly CatalogPresetSelection[]): string {
  const labels = selections.flatMap((selection) => {
    const field = fields.find((item) => item.fieldId === selection.fieldId);
    const option = field?.options.find((item) => item.value === selection.value) ?? field?.blocked.find((item) => item.value === selection.value);
    return option ? [option.label] : [];
  });
  return labels.length > 0 ? labels.join(" · ") : "—";
}

function serverReasons(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const reasons = (body as { reasons?: unknown }).reasons;
  return Array.isArray(reasons) ? reasons.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
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
  const [formOpen, setFormOpen] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  if (!productCode) return null;

  const fields = preset?.fields ?? [];
  const canEdit = list.data?.canEdit === true;
  const presets = list.data?.presets ?? [];
  const selections = selectionsFrom(fields, choices);
  const showForm = canEdit && (formOpen || editing !== null || presets.length === 0);

  function resetForm() {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setDescription("");
    setChoices({});
    setFailure(null);
  }

  /** The form sits under the list on narrow screens; focusing its first field brings it into view. */
  function focusForm() {
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function startEditing(item: CatalogPresetRecord) {
    setEditing(item);
    setFormOpen(true);
    setRetiring(null);
    setName(item.name);
    setDescription(item.description);
    setChoices(Object.fromEntries(item.selections.map((selection) => [selection.fieldId, selection.value])));
    setFailure(null);
    focusForm();
  }

  function reload() {
    if (!productCode) return;
    resetForm();
    setRetiring(null);
    invalidateResources(resourceKeys.catalogPresets(productCode));
  }

  async function save(lifecycle: CatalogPresetRecord["lifecycle"], target: CatalogPresetRecord | null = editing) {
    if (!preset || !productCode || pending || !canEdit) return;
    setPending(true);
    setFailure(null);
    const retire = lifecycle === "RETIRED" && target !== null;
    try {
      await saveCatalogPreset({
        presetId: target?.presetId ?? null,
        expectedRevision: target?.revision ?? null,
        templateCode: productCode,
        name: retire ? target.name : name,
        description: retire ? target.description : description,
        lifecycle,
        selections: retire ? target.selections : selections,
      });
      resetForm();
      setRetiring(null);
      invalidateResources(resourceKeys.catalogPresets(productCode));
    } catch (caught) {
      const transport = caught instanceof TransportError ? caught : null;
      setFailure({
        message: retire
          ? "Varianta nu a fost retrasă."
          : lifecycle === "PUBLISHED" ? "Varianta nu a fost publicată." : "Varianta nu a fost salvată.",
        reasons: transport ? serverReasons(transport.body) : [],
        conflict: transport?.status === 409,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="catv2-variants" aria-labelledby="catalog-variants-heading" data-form={preset && fields.length > 0 && list.data && showForm ? "open" : "closed"}>
      <div className="catv2-variants__list">
        <header className="catv2-section-head">
          <h2 id="catalog-variants-heading" className="catv2-h2">Variante</h2>
          <p className="catv2-lead">
            O variantă păstrează un set de opțiuni reutilizabile ale produsului, ca să nu fie alese din nou la fiecare cerere. Dimensiunile, textul și culorile rămân pe lucrare.
          </p>
        </header>
        {!preset ? <p className="catv2-empty">Acest produs nu are variante reutilizabile definite.</p> : null}
        {preset && fields.length === 0 ? (
          <p className="catv2-empty">Acest produs nu are opțiuni reutilizabile. Dimensiunile, textul și culorile rămân pe lucrare.</p>
        ) : null}
        {preset && fields.length > 0 && list.status === "error" ? (
          <div className="catv2-empty" role="alert">
            <p><strong>Variantele nu au putut fi citite.</strong></p>
            <button type="button" className="catv2-button catv2-button--secondary" onClick={reload}>Reîncearcă</button>
          </div>
        ) : null}
        {preset && fields.length > 0 && !list.data && list.status !== "error" ? <p className="catv2-footnote" role="status">Se citesc variantele.</p> : null}
        {preset && fields.length > 0 && list.data ? (
          <div className="catv2-block">
            <div className="catv2-block__head">
              <h3 className="catv2-h3">Variante salvate <span className="catv2-count">{presets.length}</span></h3>
              {canEdit && !showForm ? (
                <button type="button" className="catv2-button catv2-button--secondary" onClick={() => { setFormOpen(true); focusForm(); }}>Variantă nouă</button>
              ) : null}
            </div>
            {presets.length === 0 ? (
              <div className="catv2-empty">
                <p><strong>Nu există variante salvate.</strong></p>
                {canEdit ? <p>Alege opțiunile din formular și salvează prima variantă.</p> : null}
              </div>
            ) : (
              <table className="catv2-table catv2-variants__table">
                <thead>
                  <tr>
                    <th scope="col">Denumire</th>
                    <th scope="col">Opțiuni</th>
                    <th scope="col">Stare</th>
                    {canEdit ? <th scope="col"><span className="catv2-visually-hidden">Acțiuni</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {presets.map((item) => (
                    <Fragment key={item.presetId}>
                    <tr data-selected={editing?.presetId === item.presetId ? "true" : undefined} data-confirming={retiring === item.presetId ? "true" : undefined}>
                      <th scope="row" className="catv2-variants__name">
                        {item.name}
                        {item.description ? <small>{item.description}</small> : null}
                      </th>
                      <td data-label="Opțiuni" className="catv2-secondary catv2-variants__options">{selectionLabels(fields, item.selections)}</td>
                      <td data-label="Stare" className="catv2-variants__state">
                        <span className="catv2-version">
                          <span data-lifecycle={item.lifecycle}>{lifecycleLabel(item.lifecycle)}</span>
                          <small>revizia {item.revision}</small>
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="catv2-variants__actions">
                          {retiring === item.presetId ? null : (
                            <>
                              {item.lifecycle !== "RETIRED" ? (
                                <button type="button" className="catv2-textbutton" disabled={pending} onClick={() => startEditing(item)}>Continuă</button>
                              ) : null}
                              {item.lifecycle === "PUBLISHED" ? (
                                <button type="button" className="catv2-textbutton" disabled={pending} onClick={() => { setRetiring(item.presetId); setFailure(null); }}>Retrage</button>
                              ) : null}
                            </>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {canEdit && retiring === item.presetId ? (
                      <tr className="catv2-variants__confirm-row">
                        <td colSpan={4}>
                          <div className="catv2-variants__confirm" role="group" aria-label={`Retragerea variantei ${item.name}`}>
                            <p>Retragi varianta? O variantă retrasă nu se redeschide și nu mai poate fi aleasă în Configurator.</p>
                            <button type="button" className="catv2-button catv2-button--secondary" disabled={pending} onClick={() => void save("RETIRED", item)}>Retrage varianta</button>
                            <button type="button" className="catv2-button catv2-button--quiet" disabled={pending} onClick={() => { setRetiring(null); setFailure(null); }}>Renunță</button>
                            {/* A refusal is shown where the retire was asked, not under the whole list. */}
                            {failure ? <FailureMessage failure={failure} onReload={reload} /> : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
            {canEdit && presets.length > 0 ? <p className="catv2-footnote">O variantă retrasă nu se redeschide. Ciornele se văd doar de proprietar.</p> : null}
            {!canEdit ? <p className="catv2-footnote">Poți consulta variantele publicate. Doar proprietarul le poate schimba.</p> : null}
            {failure && !showForm && retiring === null ? <FailureMessage failure={failure} onReload={reload} /> : null}
          </div>
        ) : null}
      </div>
      {preset && fields.length > 0 && list.data && showForm ? (
        <form
          className="catv2-variants__form"
          aria-labelledby="catalog-variant-form-heading"
          onSubmit={(event) => event.preventDefault()}
        >
          <h3 id="catalog-variant-form-heading" className="catv2-h3">{editing ? "Continuă varianta" : "Variantă nouă"}</h3>
          {editing ? (
            <p className="catv2-block__note">
              {lifecycleLabel(editing.lifecycle)} · revizia {editing.revision}. Salvarea creează revizia {editing.revision + 1}; reviziile vechi rămân neschimbate.
            </p>
          ) : null}
          <label className="catv2-field" htmlFor="preset-name">
            <span className="catv2-field__label">Denumirea variantei</span>
            <input ref={nameRef} id="preset-name" className="catv2-field__control" value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="catv2-field" htmlFor="preset-description">
            <span className="catv2-field__label">Descriere · opțional</span>
            <input id="preset-description" className="catv2-field__control" value={description} maxLength={280} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
          </label>
          {fields.map((field) => (
            <fieldset key={field.fieldId} className="catv2-options" disabled={pending}>
              <legend>{field.label}</legend>
              <div className="catv2-options__row">
                {field.options.map((option) => {
                  const chosen = choices[field.fieldId] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="catv2-option"
                      aria-pressed={chosen}
                      onClick={() => setChoices((current) => {
                        const next = { ...current };
                        if (chosen) delete next[field.fieldId];
                        else next[field.fieldId] = option.value;
                        return next;
                      })}
                    >
                      {option.label}
                    </button>
                  );
                })}
                {field.blocked.map((option) => (
                  <button key={option.value} type="button" className="catv2-option" disabled aria-describedby={`preset-blocked-${field.fieldId}-${option.value}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              {field.blocked.map((option) => (
                <p key={option.value} className="catv2-options__blocked" id={`preset-blocked-${field.fieldId}-${option.value}`}>
                  „{option.label}” nu poate fi ales: {option.message}
                </p>
              ))}
            </fieldset>
          ))}
          {editing?.lifecycle === "PUBLISHED" ? (
            <p className="catv2-warning">Salvată ca ciornă, varianta nu mai poate fi aleasă în Configurator până când o publici din nou.</p>
          ) : null}
          {failure && retiring === null ? <FailureMessage failure={failure} onReload={reload} /> : null}
          <div className="catv2-actions">
            <button type="button" className="catv2-button catv2-button--primary" disabled={pending || !name.trim()} onClick={() => void save("PUBLISHED")}>Publică</button>
            <button type="button" className="catv2-button catv2-button--secondary" disabled={pending || !name.trim()} onClick={() => void save("DRAFT")}>Salvează ciorna</button>
            {editing || presets.length > 0 ? (
              <button type="button" className="catv2-button catv2-button--quiet" disabled={pending} onClick={resetForm}>Renunță</button>
            ) : null}
          </div>
          <p className="catv2-footnote">
            Doar proprietarul poate salva și publica. O variantă publicată poate fi aleasă în Configurator; nu înseamnă ofertă, cost complet sau lucrare gata. Definiția produsului: versiunea {preset.templateVersion}.
          </p>
        </form>
      ) : null}
    </section>
  );
}

function FailureMessage({ failure, onReload }: { failure: SaveFailure; onReload: () => void }) {
  return (
    <div className="catv2-failure" role="alert" data-tone={failure.conflict ? "conflict" : "error"}>
      <p><strong>{failure.message}</strong> {failure.reasons.length > 0 ? failure.reasons.join(" ") : "Verifică opțiunile sau reîncarcă lista."}</p>
      {failure.conflict ? <button type="button" className="catv2-button catv2-button--secondary" onClick={onReload}>Reîncarcă lista</button> : null}
    </div>
  );
}
