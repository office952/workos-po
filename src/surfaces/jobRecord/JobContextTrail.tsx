import type { JobListItemTransport } from "../../api/types";
import { resourceKeys } from "../../data/resourceKeys";
import { loadQuoteEnvelope, loadRequestDetail } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { presentJobSheetTitle } from "../../presentation/jobSheetIdentity";
import { clientHref, jobHref, requestHref } from "../../routing/appRoute";

/** The offer id behind a source link: the snapshot when known, otherwise the last path segment. */
function sourceOfferId(quoteSnapshotId: string | null, sourceHref: string | null): string | null {
  if (quoteSnapshotId) return quoteSnapshotId;
  const last = sourceHref?.split("?")[0]?.split("/").filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return null;
  }
}

/**
 * N-018 · firul de context: client › cerere › ofertă › lucrare › operație, built only from the
 * job's own links. References come from the existing request and offer reads; while they load
 * (or if a read fails) the step keeps its generic name and stays a working link.
 */
export function JobContextTrail({
  job,
  requestId,
  quoteSnapshotId,
  sourceHref,
  operationLabel,
}: {
  job: JobListItemTransport;
  requestId: string | null;
  quoteSnapshotId: string | null;
  sourceHref: string | null;
  operationLabel: string | null;
}) {
  const request = useResource(requestId ? resourceKeys.request(requestId) : null, () => loadRequestDetail(requestId ?? ""));
  const offerId = sourceOfferId(quoteSnapshotId, sourceHref);
  const offer = useResource(offerId ? resourceKeys.quoteEnvelope(offerId) : null, () => loadQuoteEnvelope(offerId ?? ""));
  const steps: { key: string; label: string; href: string | null }[] = [];
  if (job.customerId) steps.push({ key: "client", label: job.customerDisplayName ?? "Client", href: clientHref(job.customerId) });
  if (requestId) steps.push({ key: "request", label: request.data?.reference || "Cerere", href: requestHref(requestId) });
  if (sourceHref) steps.push({ key: "offer", label: offer.data?.reference || "Ofertă", href: sourceHref });
  steps.push({ key: "job", label: presentJobSheetTitle(job), href: operationLabel ? jobHref(job.jobId) : null });
  if (operationLabel) steps.push({ key: "operation", label: operationLabel, href: null });
  return (
    <nav className="job-trail" aria-label="Firul lucrării">
      <ol>
        {steps.map((step) => (
          <li key={step.key}>
            {step.href ? <a href={step.href}>{step.label}</a> : <span aria-current="page">{step.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
