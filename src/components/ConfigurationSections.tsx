import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import type { PreviewTransport } from "../api/types";
import {
  buildWorkbenchSections,
  resolveInitialWorkbenchNavigation,
  workbenchFieldError,
  workbenchLayerStatus,
  workbenchLayerStatusLabel,
  workbenchMissingEntries,
  workbenchSectionMissing,
  workbenchSectionNumber,
  workbenchSectionSummary,
  type WorkbenchNavigationState,
  type WorkbenchSection,
} from "../configuration/workbenchModel";
import { ConfigurationVerificationPanel } from "./ConfigurationVerificationPanel";
import { InfoRow } from "./InfoRow";
import { SelectField } from "./SelectField";
import { StatusBadge } from "./StatusBadge";
import { TextField } from "./TextField";
import { ConfigurationTechnicalDetails, type TechnicalDetailsState } from "./ConfigurationTechnicalDetails";

export type ConfigurationSectionsHandle = { focusField: (fieldId: string) => void };

const COMPACT_WORKBENCH_QUERY = "(max-width: 1023px)";

function resolveCompactWorkbenchOrder(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COMPACT_WORKBENCH_QUERY).matches;
}

/** Tablet and phone replace the part list with a selector and fold the missing list. */
function useCompactWorkbenchOrder(): boolean {
  const [compact, setCompact] = useState(resolveCompactWorkbenchOrder);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(COMPACT_WORKBENCH_QUERY);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return compact;
}

type ConfigurationSectionsProps = {
  ref?: Ref<ConfigurationSectionsHandle>;
  preview: PreviewTransport;
  drafts: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  technicalState?: TechnicalDetailsState;
  initialNavigation?: WorkbenchNavigationState | null;
  onNavigationChange?: (navigation: WorkbenchNavigationState) => void;
  footnote?: ReactNode;
};

function editorSummary(section: WorkbenchSection, missingCount: number): string {
  if (section.fields.length === 0) return "Doar consultare · din definiția produsului";
  if (missingCount > 0) {
    return missingCount === 1 ? "1 informație obligatorie lipsă" : `${missingCount} informații obligatorii lipsă`;
  }
  const required = section.fields.filter((field) => field.required).length;
  return required > 0 ? "Informațiile obligatorii sunt completate" : "Câmpuri opționale";
}

/** Navigation is presentation state. Schema and missing facts remain server-owned. */
export function ConfigurationSections({
  preview,
  drafts,
  onChange,
  ref,
  technicalState = "current",
  initialNavigation = null,
  onNavigationChange,
  footnote = null,
}: ConfigurationSectionsProps) {
  const compact = useCompactWorkbenchOrder();
  const sections = buildWorkbenchSections(preview);
  const initial = resolveInitialWorkbenchNavigation(sections, initialNavigation ?? undefined);
  const [selected, setSelected] = useState<string | null>(initial.sectionId);
  const active = sections.find((section) => section.id === selected) ?? sections[0];
  const [compositionSelected, setCompositionSelected] = useState(initial.composition);
  const panelId = useId();
  const focusField = useRef<{ id: string; scroll: boolean } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const activeIndex = compositionSelected ? sections.length : Math.max(0, sections.indexOf(active));
  const missingEntries = workbenchMissingEntries(sections, preview.missing);

  function publishNavigation(next: WorkbenchNavigationState): void {
    onNavigationChange?.(next);
  }

  useLayoutEffect(() => {
    if (focusField.current) {
      const { id, scroll } = focusField.current;
      focusField.current = null;
      focusById(id, scroll);
    }
  });

  function focusById(id: string, scroll: boolean): void {
    const field = document.getElementById(id);
    field?.focus({ preventScroll: true });
    if (scroll) field?.scrollIntoView?.({ block: "center" });
  }

  function selectSection(id: string): void {
    setSelected(id);
    setCompositionSelected(false);
    publishNavigation({ sectionId: id, composition: false });
  }

  function selectComposition(): void {
    setCompositionSelected(true);
    publishNavigation({ sectionId: null, composition: true });
  }

  function openField(fieldId: string, scroll = false): void {
    const section = sections.find((item) => item.fields.some((field) => field.id === fieldId));
    if (!section) return;
    if (!compositionSelected && active?.id === section.id) {
      focusById(fieldId, scroll);
      return;
    }
    focusField.current = { id: fieldId, scroll };
    selectSection(section.id);
  }

  useImperativeHandle(ref, () => ({ focusField: (fieldId: string) => openField(fieldId, true) }));

  function step(to: number): void {
    const next = sections[to];
    if (next) selectSection(next.id);
    else selectComposition();
    editorRef.current?.scrollIntoView?.({ block: "nearest" });
  }

  function stepLabel(index: number): string {
    const target = sections[index];
    return target ? `${workbenchSectionNumber(index)} ${target.title}` : "Compoziție";
  }

  const partNavigation = (
    <div className="configuration-editor__steps" aria-label="Navigare între părți" role="group">
      {activeIndex > 0 ? (
        <button type="button" onClick={() => step(activeIndex - 1)}>← {stepLabel(activeIndex - 1)}</button>
      ) : null}
      {!compositionSelected ? (
        <button type="button" onClick={() => step(activeIndex + 1)}>{stepLabel(activeIndex + 1)} →</button>
      ) : null}
    </div>
  );

  return (
    <div className="configuration-sections" data-layout={compact ? "compact" : "desktop"}>
      {compact ? (
        <div className="configuration-section-selector" data-testid="configuration-section-selector">
          <span className="configuration-section-selector__position" aria-hidden="true">
            {compositionSelected ? "Compoziție" : `Partea ${activeIndex + 1} din ${sections.length}`}
          </span>
          <label className="u-visually-hidden" htmlFor={`${panelId}-selector`}>Partea produsului</label>
          <select
            id={`${panelId}-selector`}
            value={compositionSelected ? "composition" : active?.id ?? ""}
            onChange={(event) => {
              if (event.target.value === "composition") selectComposition();
              else selectSection(event.target.value);
            }}
          >
            {sections.map((section, index) => {
              const status = workbenchLayerStatus(section, preview.missing, drafts);
              const summary = workbenchSectionSummary(status, workbenchSectionMissing(section, preview.missing).length);
              return (
                <option key={section.id} value={section.id}>
                  {`${workbenchSectionNumber(index)} · ${section.title} · ${summary}`}
                </option>
              );
            })}
            <option value="composition">Compoziție · Doar consultare</option>
          </select>
        </div>
      ) : (
        <nav className="configuration-outline" aria-label="Structura produsului">
          <span className="section-label configuration-outline__heading">Structura produsului</span>
          <ol className="configuration-outline__parts">
            {sections.map((section, index) => {
              const status = workbenchLayerStatus(section, preview.missing, drafts);
              const missingCount = workbenchSectionMissing(section, preview.missing).length;
              const statusId = `${panelId}-status-${index}`;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className="configuration-layer"
                    data-status={status}
                    aria-label={section.title}
                    aria-describedby={statusId}
                    aria-pressed={!compositionSelected && active?.id === section.id}
                    aria-controls={`${panelId}-${index}`}
                    onClick={() => selectSection(section.id)}
                  >
                    <span className="configuration-layer__number" aria-hidden="true">
                      {workbenchSectionNumber(index)}
                    </span>
                    <span className="configuration-layer__content">
                      <strong>{section.title}</strong>
                      <span id={statusId} className="configuration-layer__status">
                        {workbenchSectionSummary(status, missingCount)}
                      </span>
                    </span>
                    {status === "complete" ? <span className="configuration-layer__check" aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="configuration-layer configuration-layer--composition"
            data-status="readonly"
            aria-pressed={compositionSelected}
            aria-controls={`${panelId}-composition`}
            onClick={selectComposition}
          >
            <span className="configuration-layer__content">
              <strong>Compoziție</strong>
              <span className="configuration-layer__status">Doar consultare</span>
            </span>
          </button>
        </nav>
      )}
      <div className="configuration-inspector" ref={editorRef}>
        {sections.map((section, index) => {
          const missingCount = workbenchSectionMissing(section, preview.missing).length;
          return (
            <section
              key={section.id}
              id={`${panelId}-${index}`}
              aria-label={`Inspector: ${section.title}`}
              hidden={compositionSelected || active?.id !== section.id}
            >
              <div className="configuration-inspector__heading">
                <div className="configuration-inspector__title">
                  <div className="configuration-inspector__heading-row">
                    <h3><span aria-hidden="true">{workbenchSectionNumber(index)} · </span>{section.title}</h3>
                    {section.fields.length === 0 ? (
                      <StatusBadge label={workbenchLayerStatusLabel("readonly")} tone="pending" />
                    ) : null}
                  </div>
                  <p>{editorSummary(section, missingCount)}</p>
                </div>
                {partNavigation}
              </div>
              <div className="configuration-inspector__body">
                <div className="configuration-inspector__fields">
                  {section.fields.length === 0 ? (
                    <div className="configuration-readonly">
                      {section.facts.length > 0 ? (
                        <dl>
                          {section.facts.map((fact) => (
                            <InfoRow key={fact.id} label={fact.label} value={fact.value} />
                          ))}
                        </dl>
                      ) : null}
                      <p>
                        Proprietățile acestei părți provin din catalogul produsului și din faptele tehnice
                        calculate pentru părțile configurate. Schema acestei lucrări nu permite modificarea
                        independentă a componentei.
                      </p>
                      <a
                        className="text-link"
                        href={`/catalog?product=${encodeURIComponent(preview.product.code)}`}
                      >
                        Vezi definiția produsului
                      </a>
                    </div>
                  ) : null}
                  {section.fields.map((field) =>
                    field.type === "select" ? (
                      <SelectField
                        key={field.id}
                        id={field.id}
                        label={field.label}
                        value={drafts[field.id] ?? ""}
                        hint={field.hint}
                        error={workbenchFieldError(field, preview.missing, drafts[field.id], technicalState === "current")}
                        options={field.options}
                        onChange={(value) => onChange(field.id, value)}
                      />
                    ) : (
                      <TextField
                        key={field.id}
                        id={field.id}
                        label={field.label}
                        value={drafts[field.id] ?? ""}
                        hint={field.hint}
                        error={workbenchFieldError(field, preview.missing, drafts[field.id], technicalState === "current")}
                        inputMode={field.type === "number" ? "decimal" : "text"}
                        onChange={(value) => onChange(field.id, value)}
                      />
                    ),
                  )}
                </div>
                {section.fields.length > 0 &&
                (section.componentId ? section.facts : preview.product.identityFacts).length > 0 ? (
                  <aside
                    className="configuration-definition"
                    aria-label={`Definiție în context: ${section.title}`}
                  >
                    <span className="section-label">Din definiția produsului</span>
                    <dl>
                      {(section.componentId ? section.facts : preview.product.identityFacts).map((fact) => (
                        <InfoRow key={fact.id} label={fact.label} value={fact.value} />
                      ))}
                    </dl>
                  </aside>
                ) : null}
              </div>
              {!compositionSelected
                ? preview.componentDetails
                    ?.filter((detail) => detail.componentId === section.componentId)
                    .map((detail) => (
                      <ConfigurationTechnicalDetails
                        key={detail.componentId}
                        details={detail}
                        state={technicalState}
                        onEditField={openField}
                      />
                    ))
                : null}
            </section>
          );
        })}
        <section id={`${panelId}-composition`} aria-label="Compoziția produsului" hidden={!compositionSelected}>
          <div className="configuration-inspector__heading">
            <div className="configuration-inspector__title">
              <h3>Compoziție</h3>
              <p>Doar consultare · configurația acestei lucrări folosește definiția din catalog.</p>
            </div>
            {partNavigation}
          </div>
          {preview.product.identityFacts.length > 0 ? (
            <dl>
              {preview.product.identityFacts.map((fact) => (
                <InfoRow key={fact.id} label={fact.label} value={fact.value} />
              ))}
            </dl>
          ) : (
            <p>Produsul nu are proprietăți fixe publicate în acest formular.</p>
          )}
          {preview.selectedComponents.length > 0 ? (
            <div className="configuration-composition">
              <span className="section-label">Componente incluse</span>
              <ul>
                {preview.selectedComponents.map((component) => (
                  <li key={component.id}>{component.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        {footnote ? <div className="configuration-inspector__footnote">{footnote}</div> : null}
      </div>
      <ConfigurationVerificationPanel
        entries={missingEntries}
        readiness={preview.readiness}
        technicalState={technicalState}
        compact={compact}
        onOpen={(entry) => openField(entry.fieldId, true)}
      />
    </div>
  );
}
