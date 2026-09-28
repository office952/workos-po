import { useEffect, useMemo } from "react";
import { InlineAlert } from "../components/InlineAlert";
import { InfoRow } from "../components/InfoRow";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList, loadRequestDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import { presentRequestPrimaryAction } from "../presentation/worklistAction";
import { clientHref, quoteHref, requestHref } from "../routing/appRoute";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { LinkedJobs } from "./LinkedJobs";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";

type RequestDetailPageProps = {
  requestId: string;
};

export function RequestDetailPage({ requestId }: RequestDetailPageProps) {
  const request = useResource(resourceKeys.request(requestId), () => loadRequestDetail(requestId));
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const requestJobs = useMemo(
    () => (jobs.data ?? []).filter((item) => item.requestId === requestId),
    [jobs.data, requestId],
  );
  const detail = request.data;
  const primary = detail ? presentRequestPrimaryAction(detail) : null;
  const createdLabel = formatTimestamp(detail?.createdAt ?? null);
  const headerTitle = detail?.reference || detail?.title || "Cerere";
  const headerLead =
    detail && detail.reference && detail.reference !== detail.title ? detail.title : undefined;

  useEffect(() => {
    if (!detail) {
      return;
    }
    const stored = readConfiguratorSession();
    writeConfiguratorSession({
      ...stored,
      customerId: detail.customerId,
      requestId: detail.requestId,
      customerLabel: detail.customerDisplayName,
      requestLabel: detail.reference || detail.title,
    });
  }, [detail]);

  return (
    <SlicePage
      contextLabel="Cerere"
      currentHref={requestHref(requestId)}
      workspace="object"
      eyebrow="Cerere"
      title={headerTitle}
      lead={headerLead}
      meta={
        detail ? (
          <>
            {detail.customerId && detail.customerDisplayName ? (
              <a className="text-link" href={clientHref(detail.customerId)}>
                {detail.customerDisplayName}
              </a>
            ) : (
              (detail.customerDisplayName ?? "Fără client")
            )}
            {createdLabel ? <> · Creată {createdLabel}</> : null}
          </>
        ) : undefined
      }
      status={
        detail ? (
          <StatusBadge label={detail.statusLabel} tone={statusTone("workflow")} />
        ) : null
      }
      action={
        primary ? (
          <a className="hit" href={primary.actionHref}>
            <span className="button button--primary">{primary.actionLabel}</span>
          </a>
        ) : null
      }
    >
      {request.status === "error" && !detail ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi citită">
          Identitatea cererii nu este disponibilă.
        </InlineAlert>
      ) : null}
      {detail ? (
        <>
          <div className="stack">
            <SurfacePanel title="Ce dorește clientul" label="Ce dorește clientul">
              <p>{detail.description || "Fără descriere."}</p>
            </SurfacePanel>
            <RequestAttachmentsSection
              requestId={detail.requestId}
              attachments={detail.attachments}
              canUploadAttachments={detail.canUploadAttachments}
            />
            <RequestInstallationSection detail={detail} />
          </div>
          <aside className="stack" aria-label="Continuare">
            <SurfacePanel variant="quiet" title="Continuare" label="Continuare">
              <dl className="fact-grid">
                <InfoRow
                  label="Progres comercial"
                  value={detail.commercialProgressLabel?.trim() || "—"}
                />
              </dl>
              {primary ? (
                <p className="ui-note">Urmează: {primary.actionLabel}</p>
              ) : (
                <p className="ui-note">Nu există o continuare canonică pe această cerere.</p>
              )}
            </SurfacePanel>
            {detail.linkedOffers.length > 0 ? (
              <SurfacePanel variant="quiet" title="Oferte legate" label="Oferte legate">
                {detail.linkedOffers.map((offer) => (
                  <p key={offer.quoteSnapshotId}>
                    <a
                      className="text-link"
                      href={quoteHref(offer.productCode, offer.quoteSnapshotId)}
                    >
                      {offer.reference ? `Deschide oferta ${offer.reference}` : "Deschide oferta"}
                    </a>
                  </p>
                ))}
              </SurfacePanel>
            ) : null}
            <LinkedJobs title="Lucrări legate" jobs={requestJobs} />
          </aside>
        </>
      ) : request.status !== "error" ? (
        <SurfacePanel title="Ce dorește clientul" label="Ce dorește clientul" busy>
          <LoadingFloor variant="facts" label="Se citește cererea" />
        </SurfacePanel>
      ) : null}
    </SlicePage>
  );
}
