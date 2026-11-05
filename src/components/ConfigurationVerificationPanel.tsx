import type { ConfigurationReadiness } from "../api/types";
import { workbenchMissingByPart, type WorkbenchMissingEntry } from "../configuration/workbenchModel";
import type { TechnicalDetailsState } from "./ConfigurationTechnicalDetails";

type ConfigurationVerificationPanelProps = {
  entries: readonly WorkbenchMissingEntry[];
  readiness: ConfigurationReadiness;
  technicalState: TechnicalDetailsState;
  compact: boolean;
  onOpen: (entry: WorkbenchMissingEntry) => void;
};

function countLabel(entries: readonly WorkbenchMissingEntry[], readiness: ConfigurationReadiness, technicalState: TechnicalDetailsState): string {
  if (technicalState === "pending") return "Se verifică valorile noi";
  if (entries.length > 0) return `Lipsesc · ${entries.length}`;
  return readiness === "ready" ? "Nimic lipsă" : "Configurația nu este gata";
}

function MissingList({ entries, onOpen }: Pick<ConfigurationVerificationPanelProps, "entries" | "onOpen">) {
  return (
    <ul className="configuration-verification__list">
      {entries.map((entry) => (
        <li key={entry.fieldId}>
          <button type="button" aria-label={`Completează: ${entry.label}`} onClick={() => onOpen(entry)}>
            <span className="configuration-verification__part" aria-hidden="true">{entry.sectionNumber}</span>
            <span className="configuration-verification__label">{entry.label}</span>
            <span aria-hidden="true">→</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Server-reported missing facts, one list, each opening its part and field. */
export function ConfigurationVerificationPanel({ entries, readiness, technicalState, compact, onOpen }: ConfigurationVerificationPanelProps) {
  const tone = entries.length > 0 ? "attention" : readiness === "ready" && technicalState !== "pending" ? "ready" : "pending";
  if (compact) {
    if (entries.length === 0) {
      return (
        <p className="configuration-verification configuration-verification--compact" data-tone={tone}>
          <strong>{countLabel(entries, readiness, technicalState)}</strong>
          <span>după ultima evaluare</span>
        </p>
      );
    }
    return (
      <details className="configuration-verification configuration-verification--compact" data-tone={tone}>
        <summary>
          <strong>Lipsesc {entries.length}</strong>
          <span className="configuration-verification__parts">{workbenchMissingByPart(entries).join(" · ")}</span>
          <span className="configuration-verification__toggle">Listă</span>
        </summary>
        <MissingList entries={entries} onOpen={onOpen} />
      </details>
    );
  }
  return (
    <aside className="configuration-verification" aria-label="Verificare" data-tone={tone}>
      <span className="section-label">Verificare</span>
      <p className="configuration-verification__count">{countLabel(entries, readiness, technicalState)}</p>
      {entries.length > 0 ? <MissingList entries={entries} onOpen={onOpen} /> : null}
      <p className="configuration-verification__note">Valoarea comercială apare numai după confirmarea configurației de către server.</p>
    </aside>
  );
}
