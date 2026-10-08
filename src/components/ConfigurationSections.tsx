import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import type { PreviewTransport, PresentedFormField } from "../api/types";
import { InfoRow } from "./InfoRow";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";

export type ConfigurationSectionsHandle = { focusField: (fieldId: string) => void };

type ConfigurationSectionsProps = {
  ref?: Ref<ConfigurationSectionsHandle>;
  preview: PreviewTransport;
  drafts: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
};

function fieldValue(field: PresentedFormField, drafts: Record<string, string>): string {
  const value = drafts[field.id]?.trim();
  if (!value) return "—";
  return field.options.find((option) => option.value === value)?.label ?? value;
}

/** Navigation is presentation state. Schema and missing facts remain server-owned. */
export function ConfigurationSections({ preview, drafts, onChange, ref }: ConfigurationSectionsProps) {
  const schemaSections = preview.formSchema?.sections ?? [];
  const sections = [
    ...schemaSections.map((section) => ({
      ...section,
      facts: preview.product.identityFacts.filter((fact) => Boolean(section.componentId) && fact.componentId === section.componentId),
    })),
    ...preview.selectedComponents.filter((component) => !schemaSections.some((section) => section.componentId === component.id)).map((component) => ({
      id: `component:${component.id}`, componentId: component.id, title: component.label, fields: [] as PresentedFormField[],
      facts: preview.product.identityFacts.filter((fact) => fact.componentId === component.id),
    })),
  ];
  const [selected, setSelected] = useState<string | null>(null);
  const active = sections.find((section) => section.id === selected) ?? sections[0];
  const [compositionSelected, setCompositionSelected] = useState(false);
  const panelId = useId();
  const focusField = useRef<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const selectedIndex = compositionSelected ? sections.length : sections.indexOf(active);
  const availableMissing = preview.missing.flatMap((fact) => {
    const section = sections.find((item) => item.fields.some((field) => field.id === fact.fieldId));
    return section && fact.fieldId ? [{ ...fact, fieldId: fact.fieldId, sectionId: section.id }] : [];
  });

  useLayoutEffect(() => {
    if (focusField.current) {
      document.getElementById(focusField.current)?.focus();
      focusField.current = null;
    }
  });

  function selectSection(id: string): void {
    setSelected(id);
    setCompositionSelected(false);
  }

  useImperativeHandle(ref, () => ({ focusField(fieldId) {
    const section = sections.find((item) => item.fields.some((field) => field.id === fieldId));
    if (!section) return;
    focusField.current = fieldId;
    selectSection(section.id);
  } }));

  return (
    <div className="configuration-sections">
      <nav className="configuration-outline" aria-label="Secțiunile produsului">
        <div className="configuration-outline__heading">
          <span className="section-label">Structura produsului</span>
          <p>Selectează secțiunea pe care o configurezi.</p>
        </div>
        {sections.map((section, index) => {
          const missing = preview.missing.filter((fact) => section.fields.some((field) => field.id === fact.fieldId));
          return (
            <button
              key={section.id}
              type="button"
              className="configuration-layer"
              aria-label={section.title}
              aria-pressed={!compositionSelected && active?.id === section.id}
              aria-controls={`${panelId}-${index}`}
              onClick={() => selectSection(section.id)}
            >
              <span className="configuration-layer__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="configuration-layer__content">
                <strong>{section.title}</strong>
                <span className="configuration-layer__values">
                  {section.fields.length > 0
                    ? section.fields.map((field) => fieldValue(field, drafts)).filter((value) => value !== "—").slice(0, 3).join(" · ") || "Valori de completat"
                    : section.facts.map((fact) => fact.value).join(" · ") || "Componentă inclusă"}
                </span>
                {section.fields.length === 0 ? <span className="configuration-layer__fixed">Proprietăți fixe</span> : null}
                {missing.length > 0 ? <span className="configuration-layer__missing">De completat: {missing.map((fact) => fact.label).join(", ")}</span> : null}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="configuration-layer configuration-layer--composition"
          aria-pressed={compositionSelected}
          aria-controls={`${panelId}-composition`}
          onClick={() => setCompositionSelected(true)}
        >
          <span className="configuration-layer__content">
            <strong>Compoziție</strong>
            <span>{preview.selectedComponents.map((component) => component.label).join(" · ") || "Proprietățile produsului"}</span>
            <span className="configuration-layer__fixed">Consultare · definită în catalog</span>
          </span>
        </button>
      </nav>
      <div className="configuration-inspector" ref={editorRef}>
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={`${panelId}-${index}`}
            aria-label={`Setări: ${section.title}`}
            hidden={compositionSelected || active?.id !== section.id}
          >
            <div className="configuration-inspector__heading">
              <span className="section-label">{section.fields.length > 0 ? "Setări pentru această lucrare" : "Componentă definită în produs"}</span>
              <h3>{section.title}</h3>
            </div>
            <div className={`configuration-inspector__body${section.fields.length === 0 ? " configuration-inspector__body--readonly" : ""}`}>
            <div className="configuration-inspector__fields">
              {section.fields.length === 0 ? <div className="configuration-readonly">
                {section.facts.length > 0 ? <dl>{section.facts.map((fact) => <InfoRow key={fact.id} label={fact.label} value={fact.value} />)}</dl> : null}
                <p>Pentru această lucrare, componenta folosește proprietățile fixe definite în catalog.</p>
                <a className="text-link" href={`/catalog?product=${encodeURIComponent(preview.product.code)}`}>Vezi definiția produsului</a>
              </div> : null}
              {section.fields.map((field) => field.type === "select" ? (
                <SelectField key={field.id} id={field.id} label={field.label}
                  value={drafts[field.id] ?? ""} hint={field.hint} error={preview.missing.find((fact) => fact.fieldId === field.id)?.label} options={field.options}
                  onChange={(value) => onChange(field.id, value)} />
              ) : (
                <TextField key={field.id} id={field.id} label={field.label}
                  value={drafts[field.id] ?? ""} hint={field.hint} error={preview.missing.find((fact) => fact.fieldId === field.id)?.label}
                  inputMode={field.type === "number" ? "decimal" : "text"}
                  onChange={(value) => onChange(field.id, value)} />
              ))}
            </div>
            {section.fields.length > 0 && (section.componentId ? section.facts : preview.product.identityFacts).length > 0 ? <aside className="configuration-definition" aria-label={`Definiție în context: ${section.title}`}>
              <span className="section-label">Din definiția produsului</span>
              <dl>{(section.componentId ? section.facts : preview.product.identityFacts).map((fact) => <InfoRow key={fact.id} label={fact.label} value={fact.value} />)}</dl>
              <p>Proprietăți fixe ale produsului ales.</p>
            </aside> : null}
            </div>
          </section>
        ))}
        <section id={`${panelId}-composition`} aria-label="Compoziția produsului" hidden={!compositionSelected}>
          <div className="configuration-inspector__heading">
            <span className="section-label">Definiția produsului</span>
            <h3>Compoziție</h3>
            <p>Proprietățile fixe se consultă aici. Configurația acestei lucrări folosește definiția din catalog.</p>
          </div>
          {preview.product.identityFacts.length > 0 ? (
            <dl>{preview.product.identityFacts.map((fact) => <InfoRow key={fact.id} label={fact.label} value={fact.value} />)}</dl>
          ) : <p>Produsul nu are proprietăți fixe publicate în acest formular.</p>}
          {preview.selectedComponents.length > 0 ? (
            <div className="configuration-composition">
              <span className="section-label">Componente incluse</span>
              <ul>{preview.selectedComponents.map((component) => <li key={component.id}>{component.label}</li>)}</ul>
            </div>
          ) : null}
        </section>
        {availableMissing.length > 0 ? (
          <div className="configuration-missing" aria-label="Câmpuri de completat">
            <span className="section-label">De completat</span>
            {availableMissing.map((fact) => (
              <button key={fact.fieldId} type="button" onClick={() => {
                if (!compositionSelected && active?.id === fact.sectionId) {
                  document.getElementById(fact.fieldId)?.focus();
                } else {
                  focusField.current = fact.fieldId;
                  selectSection(fact.sectionId);
                }
              }}>Completează: {fact.label}</button>
            ))}
          </div>
        ) : null}
        {sections.length > 0 ? (
          <div className="configuration-inspector__navigation" aria-label="Navigare între secțiuni">
            <button type="button" disabled={selectedIndex <= 0} onClick={() => {
              selectSection(sections[selectedIndex - 1].id);
              editorRef.current?.scrollIntoView?.({ block: "nearest" });
            }}>← Înapoi</button>
            <span>{selectedIndex + 1} / {sections.length + 1}</span>
            <button type="button" disabled={compositionSelected} onClick={() => {
              const next = sections[selectedIndex + 1];
              if (next) selectSection(next.id);
              else setCompositionSelected(true);
              editorRef.current?.scrollIntoView?.({ block: "nearest" });
            }}>{selectedIndex === sections.length - 1 ? "Vezi compoziția →" : "Următoarea secțiune →"}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
