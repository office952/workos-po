import type { ConfigurationComponentDetails } from "../api/types";

export type TechnicalDetailsState = "current" | "pending" | "unavailable";
const kindLabels = { MEASURED: "Măsurătoare confirmată", TECHNICAL_SETTING: "Setare tehnică", CALCULATED: "Calculat" };

export function ConfigurationTechnicalDetails({ details, state = "current", onEditField }: {
  details: ConfigurationComponentDetails;
  state?: TechnicalDetailsState;
  onEditField?: (fieldId: string) => void;
}) {
  const current = state === "current";
  return <section className="configuration-technical" aria-label={`Detalii tehnice: ${details.label}`}>
    <div className="configuration-technical__heading"><span className="section-label">Date și dependențe</span>{current ? <span>{details.calculationLabel}</span> : null}</div>
    {!current ? <p role="status">{state === "pending" ? "Rezultatele tehnice se actualizează pentru valorile noi." : "Rezultatele tehnice nu sunt disponibile pentru valorile curente. Reîncearcă verificarea configurației."}</p> : null}
    <dl>{details.facts.filter(() => current).map((fact) => <div className="configuration-technical__fact" key={fact.id}>
      <dt>{fact.label}<span>{kindLabels[fact.kind]}</span></dt>
      <dd><strong>{fact.value}</strong><span>{fact.sourceLabel}</span></dd>
    </div>)}</dl>
    {details.inputFields.length > 0 ? <div className="configuration-technical__inputs"><span className="section-label">Date de intrare</span>
      {details.inputFields.map((field) => <div key={field.fieldId}><span><strong>{field.label}</strong><small>Din {field.componentLabel}{current ? ` · ${field.value}` : ""}</small></span>
        {onEditField ? <button type="button" onClick={() => onEditField(field.fieldId)}>Modifică {field.label}</button> : null}
      </div>)}
    </div> : null}
    {current && details.unavailable.length > 0 ? <div className="configuration-technical__issues"><span className="section-label">Calcul de completat</span><ul>{details.unavailable.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
    {details.hasTechnicalSettings || details.hasFormulas ? <nav className="configuration-technical__links" aria-label={`Administrare: ${details.label}`}>
      {details.hasTechnicalSettings ? <a className="text-link" href={`/admin/technical?component=${encodeURIComponent(details.typeId)}`}>Setări tehnice</a> : null}
      {details.hasFormulas ? <a className="text-link" href={`/admin/formulas?component=${encodeURIComponent(details.typeId)}`}>Formule de calcul</a> : null}
      <p>Setările și formulele se administrează pentru organizație. Aici se configurează lucrarea.</p>
    </nav> : null}
  </section>;
}
