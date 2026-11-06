import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { InlineAlert } from "../components/InlineAlert";
import { RequestProductSelection } from "../components/RequestProductSelection";
import { LoadingFloor } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList, loadRequestDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import {
  branchFilterParam,
  branchForQuote,
  filterBranches,
  parseBranchFilter,
  presentCommercialBranches,
  type BranchFilter,
  type CommercialBranch,
} from "../presentation/requestCommercialBranches";
import { presentRequestCommercialProgress } from "../presentation/requestCommercialProgress";
import { presentRequestNextStep } from "../presentation/worklistAction";
import { clientHref, requestHref, requestProductHref } from "../routing/appRoute";
import { hrefPath, originBack } from "../routing/originBack";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { RequestOfferPreview } from "./requests/RequestOfferPreview";
import { RequestProgressBand } from "./requests/RequestProgressBand";
import { CommercialLedger } from "./requests/CommercialLedger";
import { BranchDetail, RequestSummary } from "./requests/BranchDetail";
import { usePreviewHistory } from "../routing/usePreviewHistory";
import { navigate } from "../routing/navigate";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";
import "../styles/surfaces/commercial.css";
import "../styles/surfaces/request-branches.css";
import "../styles/surfaces/commercial-state.css";

type RequestDetailPageProps = {
  requestId: string;
  /**
   * The current query is the only state of this page: the selected branch (?ramura=), the
   * filter (?filtru=) and an offer previewed over the page (?oferta= and &foaie=comanda).
   */
  search?: string;
};

export function RequestDetailPage({ requestId, search = window.location.search }: RequestDetailPageProps) {
  const query = new URLSearchParams(search);
  const previewId = query.get("oferta");
  const previewSheet = query.get("foaie") === "comanda" ? "comanda" : "oferta";
  const requestedKey = query.get("ramura");
  const filter = parseBranchFilter(query.get("filtru"));

  function hrefWith(mutate: (params: URLSearchParams) => void): string {
    const params = new URLSearchParams(search);
    mutate(params);
    const next = params.toString();
    return `${requestHref(requestId)}${next ? `?${next}` : ""}`;
  }

  const preview = usePreviewHistory(
    (id) =>
      hrefWith((params) => {
        params.delete("foaie");
        if (id) params.set("oferta", id);
        else params.delete("oferta");
      }),
    previewId,
  );
  // Closing the preview returns focus to the control that opened it.
  const lastPreview = useRef<string | null>(null);
  useEffect(() => {
    if (previewId) {
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
  const all = branches.branches;
  const visible = filterBranches(all, filter);
  const selected = requestedKey ? (visible.find((branch) => branch.key === requestedKey) ?? null) : null;
  const staleSelection = Boolean(detail && requestedKey && !all.some((branch) => branch.key === requestedKey));
  const progress = presentRequestCommercialProgress({
    branches: all,
    commercialProgress: detail?.commercialProgress ?? null,
    commercialProgressLabel: detail?.commercialProgressLabel ?? null,
  });
  const nextStep = detail ? presentRequestNextStep(detail) : { status: "none" as const };
  const nextTarget = nextStep.status === "ready"
    ? (branchForQuote(all, nextStep.targetQuoteSnapshotId)
      ?? (nextStep.targetAssemblyId ? (all.find((branch) => branch.key === `assembly:${nextStep.targetAssemblyId}`) ?? null) : null))
    : null;

  // The first selection is a step the Back button can undo; moving between branches is not.
  const pushedSelection = useRef(false);
  const [focusOnMount] = useState(requestedKey !== null);
  function select(key: string): void {
    if (key === requestedKey) return;
    const mode = requestedKey ? "replace" : "push";
    if (mode === "push") pushedSelection.current = true;
    navigate(hrefWith((params) => params.set("ramura", key)), mode);
  }
  function clearSelection(): void {
    const key = requestedKey;
    if (pushedSelection.current) {
      pushedSelection.current = false;
      window.history.back();
    } else {
      navigate(hrefWith((params) => params.delete("ramura")), "replace");
    }
    if (key) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-branch-key="${CSS.escape(key)}"]`)?.focus();
      });
    }
  }
  function changeFilter(next: BranchFilter): void {
    pushedSelection.current = false;
    const keepsSelection = requestedKey ? filterBranches(all, next).some((branch) => branch.key === requestedKey) : false;
    navigate(
      hrefWith((params) => {
        const value = branchFilterParam(next);
        if (value) params.set("filtru", value);
        else params.delete("filtru");
        if (!keepsSelection) params.delete("ramura");
      }),
      "replace",
    );
  }
  function activate(branch: CommercialBranch): void {
    if (branch.primaryAction) navigate(branch.primaryAction.href, "push");
  }
  function onRailKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape" && selected && !previewId) {
      event.preventDefault();
      clearSelection();
    }
  }

  const createdLabel = formatTimestamp(detail?.createdAt ?? null);
  const headerTitle = detail?.title?.trim() || detail?.reference || "Cerere";
  // N-018 · opened from the client page, the way back is that page on the same tab; after a
  // direct link it is the request list.
  // Selecting a branch pushes an entry of this same request; that entry is never "the way back".
  const back = originBack(
    { href: "/cereri", label: "Toate cererile" },
    (originHref) => hrefPath(originHref) !== hrefPath(requestHref(requestId)),
  );
  const position = selected ? visible.findIndex((branch) => branch.key === selected.key) : -1;

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
      headerVariant="pilot-compact"
      eyebrow={detail?.reference ? `Cerere · ${detail.reference}` : "Cerere"}
      title={headerTitle}
      meta={
        detail ? (
          <>
            {detail.customerId && detail.customerDisplayName ? (
              <a className="text-link" href={clientHref(detail.customerId)}>
                {detail.customerDisplayName}
              </a>
            ) : (
              <span>{detail.customerDisplayName ?? "Fără client"}</span>
            )}
            {createdLabel ? <span>Înregistrată {createdLabel}</span> : null}
            <span data-testid="request-administrative-status">
              Starea cererii: <strong>{detail.statusLabel}</strong>
            </span>
          </>
        ) : undefined
      }
    >
      <div className="commercial-toolbar request-detail__toolbar">
        <div className="commercial-toolbar__context">
          <a className="text-link" href={back.href} onClick={back.onClick}>{back.text}</a>
        </div>
      </div>
      {request.status === "error" && !detail ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi citită">
          Identitatea cererii nu este disponibilă.
        </InlineAlert>
      ) : null}
      {detail ? (
        <>
          <RequestProgressBand progress={progress} nextStep={nextStep} target={nextTarget} />
          {staleSelection ? (
            <InlineAlert tone="pending" title="Ramura din adresă nu mai este în această cerere">
              Registrul arată ofertele actuale ale cererii; alege din nou ramura.
            </InlineAlert>
          ) : null}
          <div className="request-workspace" data-branch-open={selected ? "true" : undefined}>
            {all.length === 0 ? (
              <section className="ledger ledger--empty" data-testid="request-branches-empty">
                <p className="branch-detail__kicker">Ramuri comerciale · 0</p>
                <h2 className="branch-detail__title">Cererea nu are încă oferte</h2>
                <p>
                  Fiecare ofertă apare aici pe un rând, recunoscută după înscripția ei, cu produsul, starea comercială și fișa lucrării.
                </p>
                {nextStep.status === "ready" && detail.nextAction === "CHOOSE_PRODUCT" ? (
                  <p className="ledger__empty-action">
                    <a className="hit" href={requestProductHref(requestId)}>
                      <span className="button button--primary">
                        {nextStep.label} <span aria-hidden="true">→</span>
                      </span>
                    </a>
                    <span>Pasul vine de la server: cererea acceptă lucru nou.</span>
                  </p>
                ) : null}
              </section>
            ) : (
              <CommercialLedger
                branches={all}
                visible={visible}
                filter={filter}
                selectedKey={selected?.key ?? null}
                focusSelectedOnMount={focusOnMount}
                onFilter={changeFilter}
                onSelect={select}
                onActivate={activate}
                onClear={clearSelection}
              />
            )}
            {all.length > 0 ? (
              <aside
                id="branch-detail"
                className="request-rail"
                aria-label={selected ? `Ramura ${selected.indexLabel} ${selected.title}` : "Rezumatul cererii"}
                data-open={selected ? "true" : undefined}
                onKeyDown={onRailKeyDown}
              >
                {selected ? (
                  <BranchDetail
                    branch={selected}
                    total={all.length}
                    previous={visible[position - 1] ?? null}
                    next={visible[position + 1] ?? null}
                    onSelect={select}
                    onClose={clearSelection}
                    onPreview={(quoteSnapshotId) => preview.open(quoteSnapshotId)}
                    onRetryJobs={jobs.status === "error" ? () => invalidateResources(resourceKeys.jobs()) : null}
                  />
                ) : (
                  <RequestSummary progress={progress} />
                )}
              </aside>
            ) : null}
          </div>
          {branches.local.length > 0 ? (
            <ul className="branch-local" aria-label="Configurări locale">
              {branches.local.map((item) => (
                <li key={item.sessionKey}>
                  <p>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </p>
                  <a className="text-link" href={item.href}>Continuă configurarea</a>
                </li>
              ))}
            </ul>
          ) : null}
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
          <div className="request-context">
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
            onSheet={(sheet) =>
              navigate(
                hrefWith((params) => {
                  if (sheet === "comanda") params.set("foaie", "comanda");
                  else params.delete("foaie");
                }),
                "replace",
              )}
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
