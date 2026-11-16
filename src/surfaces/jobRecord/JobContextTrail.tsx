import type { JobListItemTransport } from "../../api/types";
import { resourceKeys } from "../../data/resourceKeys";
import { loadQuoteEnvelope, loadRequestDetail } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { presentJobSheetTitle } from "../../presentation/jobSheetIdentity";
import { clientWorkMemoryHref, jobHref, requestHref } from "../../routing/appRoute";
import { capabilityAllows } from "../../presentation/capabilityAccess";

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
  capabilities = null,
  requestId,
  quoteSnapshotId,
  sourceHref,
  operationLabel,
}: {
  job: JobListItemTransport;
  /** Server capabilities of the active organization; null = do not narrow (legacy / single-plane). */
  capabilities?: readonly string[] | null;
  requestId: string | null;
  quoteSnapshotId: string | null;
  sourceHref: string | null;
  operationLabel: string | null;
}) {
  // V1: a role without access to a section (Atelier) keeps the client name as an operational
  // reference, but gets no link to it and no Cerere / Ofertă step (nor their reads).
  const canClient = capabilityAllows(capabilities, "customers.read");
  const canRequest = capabilityAllows(capabilities, "requests.read");
  const canOffer = capabilityAllows(capabilities, "quotes.read");
  const shownRequestId = canRequest ? requestId : null;
  const request = useResource(shownRequestId ? resourceKeys.request(shownRequestId) : null, () => loadRequestDetail(shownRequestId ?? ""));
  const offerId = canOffer ? sourceOfferId(quoteSnapshotId, sourceHref) : null;
  const offer = useResource(offerId ? resourceKeys.quoteEnvelope(offerId) : null, () => loadQuoteEnvelope(offerId ?? ""));
  const steps: { key: string; label: string; href: string | null }[] = [];
  if (job.customerId) steps.push({ key: "client", label: job.customerDisplayName ?? "Client", href: canClient ? clientWorkMemoryHref(job.customerId, job.jobId) : null });
  if (shownRequestId) steps.push({ key: "request", label: request.data?.reference || "Cerere", href: requestHref(shownRequestId) });
  if (sourceHref && canOffer) steps.push({ key: "offer", label: offer.data?.reference || "Ofertă", href: sourceHref });
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
