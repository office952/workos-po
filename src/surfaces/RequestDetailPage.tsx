import { useEffect, useMemo } from "react";
import type { RequestAssemblyWorkTransport } from "../api/types";
import { InlineAlert } from "../components/InlineAlert";
import { RequestProductSelection } from "../components/RequestProductSelection";
import { InfoRow } from "../components/InfoRow";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList, loadRequestDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatMoney, formatTimestamp } from "../presentation/format";
import { presentQuoteHistoryState } from "../presentation/quoteHistory";
import { statusTone } from "../presentation/statusTone";
import { presentRequestPrimaryAction } from "../presentation/worklistAction";
import {
  assemblyHref,
  assemblyQuoteHref,
  clientHref,
  executionHref,
  jobHref,
  registryQuoteHref,
  requestHref,
} from "../routing/appRoute";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { LinkedJobs } from "./LinkedJobs";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";
import "../styles/surfaces/commercial.css";

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
      surface="cereri-detail"
      headerVariant="pilot"
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
    >
      <div className="commercial-toolbar request-detail__toolbar">
        <div className="commercial-toolbar__context">
          <a className="text-link" href="/cereri">← Toate cererile</a>
          {detail ? (
            <div className="request-progress" data-testid="request-progress">
              <span className="request-progress__item" data-testid="request-administrative-status">
                <span className="section-label">Stare administrativă</span>
                <StatusBadge label={detail.statusLabel} tone={statusTone("workflow")} />
              </span>
              <span className="request-progress__item" data-testid="request-commercial-progress">
                <span className="section-label">Progres comercial</span>
                <StatusBadge
                  label={detail.commercialProgressLabel?.trim() || "—"}
                  tone={statusTone("workflow")}
                />
              </span>
            </div>
          ) : null}
        </div>
        {primary ? (
          <a className="hit" href={primary.actionHref}>
            <span className="button button--primary">{primary.actionLabel}</span>
          </a>
        ) : null}
      </div>
      {request.status === "error" && !detail ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi citită">
          Identitatea cererii nu este disponibilă.
        </InlineAlert>
      ) : null}
      {detail ? (
        <>
          <div className="stack request-detail__main">
            {detail.assemblies.length > 0 ? <RequestAssemblyWorkPanel assemblies={detail.assemblies} /> : null}
            {detail.nextAction === "CHOOSE_PRODUCT" && <RequestProductSelection key={detail.requestId} customerId={detail.customerId} requestId={detail.requestId} />}
            {detail.canStartAdditionalWork && (
              <RequestProductSelection
                key={`${detail.requestId}:additional`}
                customerId={detail.customerId}
                requestId={detail.requestId}
                mode="additional"
                existingLabel={detail.assemblies[0]?.label ?? null}
              />
            )}
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
          <aside className="stack request-detail__rail" aria-label="Continuare">
            <SurfacePanel title="Continuare" label="Continuare">
              <dl className="fact-grid fact-grid--rail">
                <InfoRow
                  label="Progres comercial"
                  value={detail.commercialProgressLabel?.trim() || "—"}
                />
                <InfoRow
                  label="Următorul pas"
                  value={primary ? primary.actionLabel : "Nicio acțiune disponibilă"}
                />
              </dl>
            </SurfacePanel>
            {detail.linkedOffers.length > 0 ? (
              <SurfacePanel variant="quiet" title="Oferte legate" label="Oferte legate">
                <ul className="request-linked-offers">
                  {detail.linkedOffers.map((offer) => (
                    <li key={offer.quoteSnapshotId} className="request-linked-offers__item">
                      <a className="text-link" href={registryQuoteHref(offer)}>
                        {offer.reference ? `Deschide oferta ${offer.reference}` : "Deschide oferta"}
                      </a>
                      <span className="request-linked-offers__meta">
                        {[offer.kindLabel, offer.productLabel, presentQuoteHistoryState(offer)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {offer.orderSnapshotId ? (
                        <a className="text-link" href={jobHref(offer.orderSnapshotId)}>
                          Deschide comanda
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
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

function RequestAssemblyWorkPanel({ assemblies }: { assemblies: RequestAssemblyWorkTransport[] }) {
  return (
    <SurfacePanel title="Lucrul comercial al cererii" label="Lucrul comercial al cererii">
      <ul className="request-assembly-work">
        {assemblies.map((work) => (
          <li key={work.assemblyId} className="request-assembly-work__item">
            <div className="request-assembly-work__heading">
              <strong>{work.label}</strong>
              <StatusBadge label={work.stageLabel} tone={statusTone("workflow")} />
            </div>
            <dl className="fact-grid fact-grid--rail">
              {work.quoteGrossPrice !== null ? (
                <InfoRow
                  label="Ofertă comună"
                  value={formatMoney(work.quoteGrossPrice, work.currency ?? "EUR")}
                />
              ) : null}
              {work.revisionPending ? (
                <InfoRow label="Revizie" value="Ansamblul a fost modificat după ofertă" />
              ) : null}
              {!work.membersEditable ? (
                <InfoRow label="Configurații" value="Doar consultare (comandă acceptată)" />
              ) : null}
            </dl>
            <p className="request-assembly-work__links">
              <a className="text-link" href={assemblyHref(work.assemblyId)}>
                {work.membersEditable && !work.quoteSnapshotId ? "Continuă ansamblul" : "Deschide ansamblul"}
              </a>
              {work.quoteSnapshotId ? (
                <a className="text-link" href={assemblyQuoteHref(work.quoteSnapshotId)}>
                  Deschide oferta comună
                </a>
              ) : null}
              {work.orderSnapshotId ? (
                <a className="text-link" href={jobHref(work.orderSnapshotId)}>
                  Deschide comanda
                </a>
              ) : null}
              {work.executionPlanId ? (
                <a className="text-link" href={executionHref(work.executionPlanId)}>
                  Deschide execuția
                </a>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </SurfacePanel>
  );
}
