import type { PreviewTransport } from "../api/types";
import {
  measuredFactsForCanvas,
  workbenchLayerStatus,
  workbenchLayerStatusLabel,
  type WorkbenchSection,
} from "../configuration/workbenchModel";
import { StatusBadge } from "./StatusBadge";
import type { TechnicalDetailsState } from "./ConfigurationTechnicalDetails";

type ConfigurationConstructionCanvasProps = {
  preview: PreviewTransport;
  sections: WorkbenchSection[];
  activeSection: WorkbenchSection | undefined;
  compositionSelected: boolean;
  drafts: Record<string, string>;
  onSelectComponent: (componentId: string) => void;
  technicalState?: TechnicalDetailsState;
};

function readinessPresentation(readiness: PreviewTransport["readiness"], missingCount: number): {
  label: string;
  tone: "ready" | "incomplete" | "pending";
} {
  if (readiness === "ready") {
    return { label: "Configurația este completă pentru verificare", tone: "ready" };
  }
  if (missingCount > 0) {
    return {
      label: missingCount === 1 ? "Lipsește 1 informație obligatorie" : `Lipsesc ${missingCount} informații obligatorii`,
      tone: "incomplete",
    };
  }
  return { label: "Se completează configurația", tone: "pending" };
}

export function ConfigurationConstructionCanvas({
  preview,
  sections,
  activeSection,
  compositionSelected,
  drafts,
  onSelectComponent,
  technicalState = "current",
}: ConfigurationConstructionCanvasProps) {
  const readiness = technicalState === "current"
    ? readinessPresentation(preview.readiness, preview.missing.length)
    : { label: technicalState === "pending" ? "Se verifică modificările" : "Verificarea trebuie reluată", tone: "pending" as const };
  const activeComponentId = compositionSelected ? undefined : activeSection?.componentId;
  const measuredFacts = measuredFactsForCanvas({
    preview,
    activeComponentId,
    activeSection: compositionSelected ? undefined : activeSection,
    drafts,
    technicalState,
  });
  const activeStatus = compositionSelected
    ? ("readonly" as const)
    : activeSection
      ? workbenchLayerStatus(activeSection, preview.missing, drafts)
      : ("configurable" as const);

  return (
    <section className="configuration-construction-context configuration-construction-canvas" aria-label="Plan de construcție">
      <header className="configuration-construction-canvas__header">
        <div>
          <span className="section-label">Plan construcție</span>
          <h3>{compositionSelected ? "Compoziție produs" : activeSection?.title ?? preview.product.label}</h3>
        </div>
        <StatusBadge label={readiness.label} tone={readiness.tone} />
      </header>

      <div className="configuration-construction-canvas__body">
        <div className="configuration-construction-canvas__stack" aria-label="Relația față–spate">
          <p className="configuration-construction-canvas__axis">
            <span>Față</span>
            <span aria-hidden="true">→</span>
            <span>Spate</span>
          </p>
          <ol className="configuration-construction-canvas__layers">
            {preview.selectedComponents.map((component) => {
              const section = sections.find((item) => item.componentId === component.id);
              const pressed = !compositionSelected && activeComponentId === component.id;
              const status = section
                ? workbenchLayerStatus(section, preview.missing, drafts)
                : "readonly";
              return (
                <li
                  key={component.id}
                  className={[
                    pressed ? "is-active" : "",
                    status === "readonly" ? "is-readonly" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                >
                  <button
                    type="button"
                    aria-label={`Selectează ${component.label}`}
                    aria-pressed={pressed}
                    onClick={() => onSelectComponent(component.id)}
                  >
                    <span className="configuration-construction-canvas__layer-label">{component.label}</span>
                    <span className="configuration-construction-canvas__layer-status">
                      {workbenchLayerStatusLabel(status)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="configuration-construction-canvas__schematic-note">
            Reprezentare schematică a straturilor — dimensiunile confirmate provin din configurație și calculul serverului.
          </p>
        </div>

        <div className="configuration-construction-canvas__facts" aria-label="Informații tehnice pentru stratul selectat">
          <div className="configuration-construction-canvas__facts-heading">
            <span className="section-label">Strat activ</span>
            <strong>{compositionSelected ? "Compoziție" : activeSection?.title ?? "—"}</strong>
            <span className="configuration-construction-canvas__facts-status">
              {workbenchLayerStatusLabel(activeStatus)}
            </span>
          </div>
          {measuredFacts.length > 0 ? (
            <dl>
              {measuredFacts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`} className="configuration-construction-canvas__fact">
                  <dt>{fact.label}</dt>
                  <dd>
                    <strong>{fact.value}</strong>
                    <span>
                      {fact.kind === "calculated"
                        ? "Calcul server"
                        : fact.kind === "catalog"
                          ? "Definit în catalog"
                          : "Valoare configurată"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="configuration-construction-canvas__empty" role={technicalState === "pending" ? "status" : undefined}>
              {technicalState === "pending"
                ? "Rezultatele tehnice se actualizează pentru valorile noi."
                : technicalState === "unavailable"
                  ? "Verificarea nu este disponibilă. Reîncearcă actualizarea pentru a vedea valorile calculate."
                : compositionSelected
                  ? "Consultă compoziția în inspectorul din dreapta."
                  : "Completează proprietățile stratului selectat în inspector."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
