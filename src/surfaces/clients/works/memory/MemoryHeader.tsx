import { useId, type ReactNode } from "react";
import type { WorkItem } from "../../../../adapters/customerDossierAdapter";
import { jobHref, requestHref } from "../../../../routing/appRoute";
import { DossierIcon } from "../../dossier/dossierIcons";
import { follow } from "../../dossier/history/follow";
import { StateTag } from "../../dossier/historyParts";
import { workDate } from "../worksModel";

/**
 * R-005 · the identity of the job in the memory (1037:38044): provenance and references, title,
 * site at the time, order date and product, the canonical state (the progress is said once, below),
 * and the single way out to the operational job sheet in Lucrări.
 */
export function MemoryHeader({ item, jobId, children }: { item: WorkItem; jobId: string; children: ReactNode }) {
  const exitNote = useId();
  const sheetHref = jobHref(jobId);
  const request = item.request;
  return (
    <header className="wmem-head">
      <p className="wmem-head__ids">
        <span className="dwdetail__badge">
          <DossierIcon name="wrench" size={12} />
          În WorkOS
        </span>
        {item.reference ? <span className="wmem-head__ref">{item.reference}</span> : null}
        {request ? (
          <a href={requestHref(request.requestId)} onClick={(event) => follow(event, requestHref(request.requestId))}>{`Cerere ${request.reference}`}</a>
        ) : (
          <span>Cerere neînregistrată</span>
        )}
        <span>{item.quote ? `Ofertă ${item.quote.reference}` : "Ofertă neînregistrată"}</span>
      </p>
      <div className="wmem-head__main">
        <div className="wmem-head__identity">
          <h3 id="wmem-title" className="wmem-head__title">{item.title}</h3>
          <p className="wmem-head__facts">
            <span>
              <DossierIcon name="site" size={14} />
              {item.site ? `${item.site.name}${item.siteAtTimeLabel ? ` · ${item.siteAtTimeLabel}` : ""}` : "Sediu neînregistrat"}
            </span>
            <span>
              <DossierIcon name="calendar" size={14} />
              {workDate(item)}
            </span>
            {item.detail && item.detail !== item.title ? <span>{item.detail}</span> : null}
          </p>
        </div>
        <StateTag state={item.state} label={item.stateLabel} />
        <div className="wmem-head__exit">
          <a className="wmem-exit" href={sheetHref} onClick={(event) => follow(event, sheetHref)} aria-describedby={exitNote}>
            Deschide fișa lucrării
            <DossierIcon name="open" size={14} />
          </a>
          <p id={exitNote}>în modulul Lucrări · planul și execuția se gestionează acolo</p>
        </div>
      </div>
      {children}
    </header>
  );
}
