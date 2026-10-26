import { useEffect, useMemo, useRef } from "react";
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
import { originBack } from "../routing/originBack";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { LinkedJobs } from "./LinkedJobs";
import { RequestOfferPreview } from "./requests/RequestOfferPreview";
import { usePreviewHistory } from "../routing/usePreviewHistory";
import { navigate } from "../routing/navigate";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";
import "../styles/surfaces/commercial.css";
import "../styles/surfaces/request-thread.css";

type RequestDetailPageProps = {
  requestId: string;
  /** The current query: an offer previewed over the page lives in ?oferta= (and &foaie=comanda). */
  search?: string;
};

function requestPreviewHref(requestId: string, offerId: string | null, sheet: "oferta" | "comanda" = "oferta"): string {
  const base = `/cereri/${encodeURIComponent(requestId)}`;
  if (!offerId) return base;
  const params = new URLSearchParams({ oferta: offerId });
  if (sheet === "comanda") params.set("foaie", "comanda");
  return `${base}?${params.toString()}`;
}

export function RequestDetailPage({ requestId, search = window.location.search }: RequestDetailPageProps) {
  const query = new URLSearchParams(search);
  const previewId = query.get("oferta");
  const previewSheet = query.get("foaie") === "comanda" ? "comanda" : "oferta";
  const preview = usePreviewHistory((id) => requestPreviewHref(requestId, id), previewId);
  // Closing the preview returns focus to the control that opened it.
  const lastPreview = useRef<string | null>(null);
  useEffect(() => {
    if (previewId) {
      // The first offer opened names the opener; moving to another offer keeps it.
      lastPreview.current ??= previewId;
      return;
    }
    const previous = lastPreview.current;
    lastPreview.current = null;
    if (previous) document.querySelector<HTMLElement>(`[data-preview-opener="${CSS.escape(previous)}"]`)?.focus();
  }, [previewId]);
  const request = useResource(resourceKeys.request(requestId), () => loadRequestDetail(requestId));
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const requestJobs = useMemo(
    () => (jobs.data?.jobs ?? []).filter((item) => item.requestId === requestId),
    [jobs.data, requestId],
  );
  const detail = request.data;
  const primary = detail ? presentRequestPrimaryAction(detail) : null;
  const currentStep = primary ? stepOfDestination(primary.actionHref) : null;
  const createdLabel = formatTimestamp(detail?.createdAt ?? null);
  const headerTitle = detail?.reference || detail?.title || "Cerere";
  const headerLead =
    detail && detail.reference && detail.reference !== detail.title ? detail.title : undefined;
  // N-018 · opened from the client page, the way back is that page on the same tab; after a
  // direct link it is the request list.
  const back = originBack({ href: "/cereri", label: "Toate cererile" });

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
          <a className="text-link" href={back.href} onClick={back.onClick}>{back.text}</a>
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
          {/* N-018 · firul cererii: four steps built only from the request's own data and links.
              Which action is current is the server's (P1); it is shown on the step its destination
              belongs to, and in the toolbar as before. No step status is computed here. */}
          <ol className="stack request-detail__main request-thread" aria-label="Firul cererii">
            <li className="request-thread__step" aria-labelledby="request-step-brief" data-current={currentStep === 1 || undefined}>
              <h2 id="request-step-brief" className="request-thread__title">1 · Brief</h2>
              {currentStep === 1 && primary ? <CurrentAction label={primary.actionLabel} href={primary.actionHref} /> : null}
              <SurfacePanel title="Ce dorește clientul" label="Ce dorește clientul">
                <p>{detail.description || "Fără descriere."}</p>
              </SurfacePanel>
              <RequestAttachmentsSection
                requestId={detail.requestId}
                attachments={detail.attachments}
                canUploadAttachments={detail.canUploadAttachments}
              />
              <RequestInstallationSection detail={detail} />
            </li>
            <li className="request-thread__step" aria-labelledby="request-step-work" data-current={currentStep === 2 || undefined}>
              <h2 id="request-step-work" className="request-thread__title">2 · Ce se realizează</h2>
              {currentStep === 2 && primary ? <CurrentAction label={primary.actionLabel} href={primary.actionHref} /> : null}
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
              {detail.assemblies.length === 0 && detail.nextAction !== "CHOOSE_PRODUCT" && !detail.canStartAdditionalWork ? (
                <p className="request-thread__empty">Nu există încă un ansamblu în această cerere.</p>
              ) : null}
            </li>
            <li className="request-thread__step" aria-labelledby="request-step-offer" data-current={currentStep === 3 || undefined}>
              <h2 id="request-step-offer" className="request-thread__title">{detail.linkedOffers.length ? `3 · Oferta · ${detail.linkedOffers.length}` : "3 · Oferta"}</h2>
              {currentStep === 3 && primary ? <CurrentAction label={primary.actionLabel} href={primary.actionHref} /> : null}
              {detail.linkedOffers.length > 0 ? (
                <SurfacePanel variant="quiet" title="Oferte legate" label="Oferte legate">
                  <ul className="request-linked-offers">
                    {detail.linkedOffers.map((offer) => (
                      <li key={offer.quoteSnapshotId} className="request-linked-offers__item">
                        <button
                          type="button"
                          className="text-link"
                          data-preview-opener={offer.quoteSnapshotId}
                          aria-haspopup="dialog"
                          onClick={() => preview.open(offer.quoteSnapshotId)}
                        >
                          {offer.reference ? `Previzualizează oferta ${offer.reference}` : "Previzualizează oferta"}
                        </button>
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
              ) : <p className="request-thread__empty">Nicio ofertă încă.</p>}
            </li>
            <li className="request-thread__step" aria-labelledby="request-step-job" data-current={currentStep === 4 || undefined}>
              <h2 id="request-step-job" className="request-thread__title">{requestJobs.length ? `4 · Lucrarea · ${requestJobs.length}` : "4 · Lucrarea"}</h2>
              {currentStep === 4 && primary ? <CurrentAction label={primary.actionLabel} href={primary.actionHref} /> : null}
              {requestJobs.length ? <LinkedJobs title="Lucrări legate" jobs={requestJobs} /> : <p className="request-thread__empty">Nicio lucrare încă.</p>}
            </li>
          </ol>
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
          </aside>
        </>
      ) : request.status !== "error" ? (
        <SurfacePanel title="Ce dorește clientul" label="Ce dorește clientul" busy>
          <LoadingFloor variant="facts" label="Se citește cererea" />
        </SurfacePanel>
      ) : null}
      {previewId ? (() => {
        const offers = detail?.linkedOffers ?? [];
        const index = offers.findIndex((offer) => offer.quoteSnapshotId === previewId);
        return (
          <RequestOfferPreview
            offerId={previewId}
            sheet={previewSheet}
            position={{ index, count: offers.length }}
            onSheet={(sheet) => navigate(requestPreviewHref(requestId, previewId, sheet), "replace")}
            onMove={(delta) => {
              const next = offers[index + delta];
              if (next) preview.open(next.quoteSnapshotId);
            }}
            onClose={preview.close}
          />
        );
      })() : null}
    </SlicePage>
  );
}

/**
 * N-018 · where the server's current action leads, as a step of the thread. Only the destination
 * is read (no state is interpreted); an unknown destination places it nowhere.
 */
function stepOfDestination(href: string): 1 | 2 | 3 | 4 | null {
  const url = new URL(href, "https://workos.local");
  if (url.pathname.startsWith("/lucrari")) return 4;
  if (url.pathname.startsWith("/oferte") || url.pathname.startsWith("/quotes")) return 3;
  if (url.searchParams.has("alege-produs") || url.pathname.startsWith("/configurator") || url.pathname === "/ansamblu") return 2;
  return null;
}

function CurrentAction({ label, href }: { label: string; href: string }) {
  return (
    <p className="request-thread__current">
      <span className="request-thread__current-label">Acțiunea curentă</span>
      <a className="text-link" href={href}>{label} →</a>
    </p>
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
                  Deschide în Atelier
                </a>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </SurfacePanel>
  );
}
