import type { SiteInstallationOperationalTransport } from "../../api/types";
import { JobMaterialPreparation } from "../JobMaterialPreparation";
import { SiteInstallationContextPanel } from "../SiteInstallationContextPanel";

export function JobRecordDates({
  jobId,
  returnTo,
  consultation,
  site,
  sourceHref,
  sourceLabel,
}: {
  jobId: string;
  returnTo: string;
  consultation: boolean;
  site: SiteInstallationOperationalTransport | null;
  sourceHref: string | null;
  sourceLabel: string;
}) {
  return (
    <div className="job-record">
      <section className="job-record__section" aria-label="Datele lucrării">
        <header>
          <div>
            <h2>Datele lucrării</h2>
            <p>Necesarul estimat și verificările stau aici. Consumul efectiv rămâne pe operația care l-a înregistrat. Contextul de montaj nu confirmă montajul.</p>
          </div>
        </header>
        <JobMaterialPreparation jobId={jobId} returnTo={returnTo} consultation={consultation} />
        {site ? <SiteInstallationContextPanel context={site} /> : <p>Nu există context de montaj înregistrat.</p>}
        <section className="job-sheet__panel" aria-label="Sursa comercială">
          <h2>Sursă comercială acceptată</h2>
          {sourceHref ? <a href={sourceHref}>{sourceLabel}</a> : <p>Legătura către sursă nu este disponibilă.</p>}
        </section>
      </section>
    </div>
  );
}
