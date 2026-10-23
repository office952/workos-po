import type { ReactNode } from "react";
import type { SiteInstallationOperationalTransport } from "../../api/types";
import { JobMaterialPreparation } from "../JobMaterialPreparation";
import { SiteInstallationContextPanel } from "../SiteInstallationContextPanel";

export function JobRecordDates({
  planning = null,
  jobId,
  returnTo,
  consultation,
  site,
  sourceHref,
  sourceLabel,
}: {
  /** N-018 · the priority and deadline editor lives here, with its unsaved-changes state. */
  planning?: ReactNode;
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
            <p>Materiale, montaj și sursa comercială. Consumul efectiv se consultă pe operație.</p>
          </div>
        </header>
        {planning}
        <JobMaterialPreparation jobId={jobId} returnTo={returnTo} consultation={consultation} />
        <div className="job-record__dates-grid">
        <section aria-label="Context de montaj"><h3>Montaj</h3>{site ? <SiteInstallationContextPanel context={site} /> : <p>Nu există context de montaj înregistrat.</p>}</section>
        <section aria-label="Sursa comercială">
          <h2>Sursă comercială acceptată</h2>
          {sourceHref ? <a href={sourceHref}>{sourceLabel}</a> : <p>Legătura către sursă nu este disponibilă.</p>}
        </section>
        </div>
      </section>
    </div>
  );
}
