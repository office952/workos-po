import type { PreviewTransport } from "../api/types";
import { InfoRow } from "./InfoRow";
import { ConfigurationTechnicalDetails, type TechnicalDetailsState } from "./ConfigurationTechnicalDetails";

export function ConfigurationReview({ preview, drafts, onEdit, technicalState = "current" }: {
  preview: PreviewTransport;
  drafts: Record<string, string>;
  onEdit: (fieldId: string) => void;
  technicalState?: TechnicalDetailsState;
}) {
  const previewCurrent = technicalState === "current";
  return <section className="configuration-summary" aria-label="Rezumat tehnic">
    <div className="configuration-summary__heading">
      <span className="section-label">Înainte de confirmare</span>
      <h2>Verifică configurația</h2>
      <p>Verifică valorile acestei lucrări. Confirmarea le trimite pentru calcul și pregătirea ofertei.</p>
      {!previewCurrent ? <p role="status">{technicalState === "pending"
        ? "Se verifică modificările. Rezultatele și lipsurile din calculul anterior sunt suspendate."
        : "Previzualizarea nu este disponibilă. Reîncearcă actualizarea înainte de confirmare."}</p> : null}
    </div>
    <div className="configuration-summary__sections">
      {preview.formSchema?.sections.map((section) => <section key={section.id} aria-label={`Rezumat: ${section.title}`}>
        <h3>{section.title}</h3>
        <dl>{section.fields.map((field) => {
          const value = drafts[field.id]?.trim() ?? "";
          const display = field.options.find((option) => option.value === value)?.label ?? value;
          const missing = previewCurrent ? preview.missing.find((fact) => fact.fieldId === field.id) : undefined;
          return <div key={field.id} className="configuration-summary__row">
            <dt>{field.label}</dt><dd>{display || "—"}{missing ? <span className="configuration-summary__missing">{missing.label} · de completat</span> : null}</dd>
            <button type="button" aria-label={`Modifică ${field.label}`} onClick={() => onEdit(field.id)}>Modifică</button>
          </div>;
        })}</dl>
      </section>)}
      {preview.product.identityFacts.length > 0 ? <section aria-label="Definiția produsului în rezumat">
        <h3>Din definiția produsului</h3>
        <dl>{preview.product.identityFacts.map((fact) => <InfoRow key={fact.id} label={fact.label} value={fact.value} />)}</dl>
      </section> : null}
      {previewCurrent ? preview.componentDetails?.map((detail) => <section key={detail.componentId} aria-label={`Calcul tehnic: ${detail.label}`}>
        <h3>{detail.label}</h3><ConfigurationTechnicalDetails details={detail} state={technicalState} onEditField={onEdit} />
      </section>) : null}
    </div>
  </section>;
}
