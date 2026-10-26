import { useEffect, useRef } from "react";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { loadJobDetail } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { presentJobSheetTitle } from "../../presentation/jobSheetIdentity";
import { jobHref } from "../../routing/appRoute";
import "../../styles/surfaces/offers-desk.css";
import "../../styles/surfaces/offers-acceptance.css";

/**
 * N-018 · masa de decizie, after acceptance: what the acceptance did (offer accepted, order
 * created from this frozen version) and, separately, the job as the server reports it now.
 * Right after confirming it reads "Lucrarea"; on a later visit "Lucrarea acum". Acceptance does
 * not start production: the job's own state and next step say what follows.
 */
export function AcceptanceResult({
  reference,
  orderSnapshotId,
  immediate,
}: {
  reference: string;
  orderSnapshotId: string;
  immediate: boolean;
}) {
  const key = resourceKeys.job(orderSnapshotId);
  const job = useResource(key, () => loadJobDetail(orderSnapshotId));
  const current = job.data?.job ?? null;
  const finished = current?.stage === "EXECUTION_COMPLETED";
  const rootRef = useRef<HTMLElement>(null);
  // Right after confirming, focus lands on the result (the confirmation it replaces is gone).
  useEffect(() => {
    if (immediate) rootRef.current?.focus();
  }, [immediate]);
  return (
    <section ref={rootRef} tabIndex={-1} className="offers-acceptance" aria-labelledby="offers-acceptance-title">
      {/* The stamp keeps its one meaning (N-012): the system confirmed the acceptance and the order. */}
      <span className="offers-stamp offers-acceptance__stamp" data-testid="offer-acceptance-stamp" aria-hidden="true">
        <span className="offers-stamp__label">Acceptată</span>
      </span>
      <p id="offers-acceptance-title" className="offers-acceptance__title">Rezultatul acceptării</p>
      <ul className="offers-acceptance__done">
        <li><strong>Oferta acceptată</strong><span>{`versiunea înghețată ${reference}`}</span></li>
        <li><strong>Comanda creată</strong><span>păstrează sumele acestei versiuni</span></li>
      </ul>
      <div className="offers-acceptance__job" aria-live="polite">
        <p className="offers-acceptance__label">{immediate ? "Lucrarea" : "Lucrarea acum"}</p>
        {current ? (
          <>
            <p className="offers-acceptance__name">{presentJobSheetTitle(current)}</p>
            <p className="offers-acceptance__stage">{current.stageLabel}</p>
            {!finished && current.nextActionLabel ? (
              <p className="offers-acceptance__next">{`Urmează: ${current.nextActionLabel}, din fișa lucrării.`}</p>
            ) : null}
          </>
        ) : job.status === "error" ? (
          <p className="offers-acceptance__next">
            Starea lucrării nu a putut fi citită.{" "}
            <button type="button" className="text-link" onClick={() => invalidateResources(key)}>Reîncearcă</button>
          </p>
        ) : (
          <p className="offers-acceptance__next" role="status">Se citește starea lucrării…</p>
        )}
        <a className="offers-acceptance__link" href={jobHref(orderSnapshotId)}>Fișa lucrării →</a>
      </div>
    </section>
  );
}
