import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatTimestamp } from "../presentation/format";
import {
  branchCountLabel,
  filterBranches,
  preferredBranchKey,
  presentCommercialBranches,
} from "../presentation/requestCommercialBranches";
import { statusTone } from "../presentation/statusTone";
import { presentRequestPrimaryAction } from "../presentation/worklistAction";
import { clientHref, requestHref } from "../routing/appRoute";
import { originBack } from "../routing/originBack";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { RequestOfferPreview } from "./requests/RequestOfferPreview";
import { ContextThread } from "./requests/ContextThread";
import { RequestBranchList } from "./requests/RequestBranchList";
import { usePreviewHistory } from "../routing/usePreviewHistory";
import { navigate } from "../routing/navigate";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";
import "../styles/surfaces/commercial.css";
import "../styles/surfaces/request-branches.css";

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
  const detail = request.data;
  const quotedProductLabel = detail?.linkedOffers.find((offer) => offer.kind === "PRODUCT" && !offer.superseded)?.productLabel
    ?? detail?.linkedOffers.find((offer) => offer.kind === "PRODUCT")?.productLabel
    ?? null;
  const branches = useMemo(
    () => presentCommercialBranches({
      offers: detail?.linkedOffers ?? [],
      assemblies: detail?.assemblies ?? [],
      jobs: jobs.data?.jobs ?? [],
      jobsStatus: jobs.status === "error" ? "error" : jobs.status === "success" ? "ready" : "pending",
      session: readConfiguratorSession(),
      requestId,
      customerId: detail?.customerId ?? null,
    }),
    [detail, jobs.data, jobs.status, requestId],
  );
  const [filter, setFilter] = useState<"all" | "attention">(
    () => (new URLSearchParams(search).get("filtru") === "atentie" ? "attention" : "all"),
  );
  const [selection, setSelection] = useState<{ key: string | null; explicit: boolean }>(() => {
    const params = new URLSearchParams(search);
    return { key: params.get("ramura"), explicit: params.has("ramura") };
  });
  const [expandAll, setExpandAll] = useState(false);
  const visibleBranches = filterBranches(branches.branches, filter);
  const shownKey = selection.explicit
    ? (selection.key && visibleBranches.some((branch) => branch.key === selection.key) ? selection.key : null)
    : preferredBranchKey(visibleBranches, null);
  const shownBranch = branches.branches.find((branch) => branch.key === shownKey) ?? null;
  function rememberQuery(mutate: (params: URLSearchParams) => void): void {
    const params = new URLSearchParams(search);
    mutate(params);
    const query = params.toString();
    navigate(`${requestHref(requestId)}${query ? `?${query}` : ""}`, "replace");
  }
  const primary = detail ? presentRequestPrimaryAction(detail) : null;
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
                {branches.branches.length > 0 ? (
                  <span>{branchCountLabel(branches.branches.length, branches.branches.filter((branch) => branch.needsAttention).length)}</span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
        {primary && branches.branches.length === 0 ? (
          <a className="hit" href={primary.actionHref}>
            <span className="button button--primary">{primary.actionLabel}</span>
          </a>
        ) : primary ? (
          <a className="text-link" href={primary.actionHref}>{primary.actionLabel}</a>
        ) : null}
      </div>
      {request.status === "error" && !detail ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi citită">
          Identitatea cererii nu este disponibilă.
        </InlineAlert>
      ) : null}
            {detail ? (
        <div className="request-branches-layout">
          <div className="stack">
            <ContextThread
              label="Fir de context"
              summary={shownBranch ? `Ramura ${shownBranch.indexLabel} · ${shownBranch.title}` : null}
              jump={shownBranch ? { href: "#request-branches-title", label: "Mergi la ramură" } : null}
            />
            <RequestBranchList
              branches={branches.branches}
              visible={visibleBranches}
              filter={filter}
              onFilter={(next) => {
                setFilter(next);
                setExpandAll(false);
                rememberQuery((params) => {
                  if (next === "attention") params.set("filtru", "atentie");
                  else params.delete("filtru");
                });
              }}
              expandedKey={shownKey}
              expandAll={expandAll}
              onToggle={(key) => {
                setExpandAll(false);
                const next = shownKey === key ? null : key;
                setSelection({ key: next, explicit: true });
                rememberQuery((params) => {
                  if (next) params.set("ramura", next);
                  else params.delete("ramura");
                });
              }}
              onExpandAll={() => setExpandAll((value) => !value)}
              onPreview={(quoteSnapshotId) => preview.open(quoteSnapshotId)}
              local={branches.local}
            />
            {detail.nextAction === "CHOOSE_PRODUCT" ? (
              <RequestProductSelection key={detail.requestId} customerId={detail.customerId} requestId={detail.requestId} />
            ) : null}
            {detail.canStartAdditionalWork ? (
              <RequestProductSelection
                key={`${detail.requestId}:additional`}
                customerId={detail.customerId}
                requestId={detail.requestId}
                mode="additional"
                existingLabel={detail.assemblies[0]?.label ?? quotedProductLabel}
              />
            ) : null}
          </div>
          <aside className="stack request-detail__rail" aria-label="Continuare">
            <SurfacePanel title="Ce dorește clientul" label="Ce dorește clientul">
              <p>{detail.description || "Fără descriere."}</p>
            </SurfacePanel>
            <RequestAttachmentsSection
              requestId={detail.requestId}
              attachments={detail.attachments}
              canUploadAttachments={detail.canUploadAttachments}
            />
            <RequestInstallationSection detail={detail} />
            <SurfacePanel title="Continuare" label="Continuare">
              <dl className="fact-grid fact-grid--rail">
                <InfoRow label="Progres comercial" value={detail.commercialProgressLabel?.trim() || "—"} />
                <InfoRow label="Următorul pas" value={primary ? primary.actionLabel : "Nicio acțiune disponibilă"} />
              </dl>
            </SurfacePanel>
          </aside>
        </div>
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
