import { useEffect, useId, useRef, useState } from "react";
import { customerHistoryQueryString, fetchCustomerHistory } from "../../../api/customerDossier";
import type { CustomerWorkspaceTransport } from "../../../api/types";
import { presentCustomerHistory } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { ErrorState } from "../../../components/ErrorState";
import { invalidateResources } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";
import { newRequestHref } from "../../../routing/appRoute";
import { navigate } from "../../../routing/navigate";
import { fromSitesOrigin } from "../sites/originFromSites";
import { SitesOriginBand } from "../sites/SitesOrigin";
import { usePreviewHistory } from "../../../routing/usePreviewHistory";
import { RequestOfferPreview } from "../../requests/RequestOfferPreview";
import { useBandMode } from "./bandModel";
import { useCustomerDossier, useHistoryTotals } from "./dossierModel";
import { DocumentViewer } from "../documents/DocumentViewer";
import { DOCUMENT_PARAM, useDocumentPreview } from "../documents/useDocumentPreview";
import { FilterSheet } from "./FilterSheet";
import { HistoryFilterGroups } from "./history/HistoryFilterGroups";
import { CollapsedCard, ExpandedCard } from "./history/HistoryEntryCard";
import type { Opened } from "./history/opened";
import { HistoryJumpRow, HistoryResultLine, HistoryTools } from "./history/HistoryTools";
import { HistoryWatch } from "./history/HistoryWatch";
import { HistoryYearRail } from "./history/HistoryYearRail";
import { useYearInView, yearAnchorId } from "./history/yearInView";
import { watchModel } from "./history/watchModel";
import { countLabel, groupByYear } from "./historyModel";
import { clientListHref, EXPANDED_PARAM, useClientListContext } from "./listContext";
import { PhotoViewer } from "./PhotoViewer";

export { FilterSheet } from "./FilterSheet";

const PAGE_SIZE = 20;

/**
 * N-020 design final · Istoric (Figma 604:8132; „De urmărit” 649:14128; căutare 588:8038; 1280
 * 588:6732; 768 588:7090; telefon 649:14364 / 580:4114; fără activitate 578:2874): everything
 * documented for this client — requests with their offers and works, works recorded after the
 * fact and uploaded documents — newest first, by year. Broader than Lucrări. The search, the
 * filters, the page and the open entry live in the URL and in this client's list memory; the
 * states, counts and relations are the server's.
 */
export function ClientHistorySection({
  customerId,
  search,
  workspace,
  canCreate,
  onRecord,
  uploadHref,
}: {
  customerId: string;
  search: string;
  workspace: CustomerWorkspaceTransport;
  canCreate: boolean;
  /** "Adaugă lucrare istorică" (only with the permission). */
  onRecord: (() => void) | null;
  /** "Încarcă document" (only with the permission). */
  uploadHref: string | null;
}) {
  const dossier = useCustomerDossier(customerId);
  const totals = useHistoryTotals(customerId);
  const mode = useBandMode();
  const { context, text, setText, apply, filtered } = useClientListContext(customerId, "istoric", search);
  const expanded = new URLSearchParams(search).get(EXPANDED_PARAM);
  const [opened, setOpened] = useState<Opened>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // After "Restrânge", the focus goes back to that entry's "Extinde"; after "Extinde", to its "Restrânge".
  const [collapsed, setCollapsed] = useState<string | null>(null);
  const [expandedHere, setExpandedHere] = useState<string | null>(null);
  const searchId = useId();

  const query = {
    q: context.q || undefined,
    year: context.year || undefined,
    site: context.site || undefined,
    state: context.state || undefined,
    provenance: context.provenance || undefined,
    page: context.page,
    pageSize: PAGE_SIZE,
  };
  const key = resourceKeys.customerHistory(customerId, customerHistoryQueryString(query));
  const history = useResource(key, async () => {
    const presented = presentCustomerHistory(await fetchCustomerHistory(customerId, query));
    if (!presented) throw new Error("unpresentable");
    return presented;
  });
  // While another search or filter loads, the last result stays (busy): the tools keep their place
  // and the focus. The section is mounted per client, so nothing crosses from another client.
  const [lastShown, setLastShown] = useState(history.data);
  if (history.data && history.data !== lastShown) setLastShown(history.data);
  const data = history.data ?? (history.status === "loading" || history.status === "idle" ? lastShown : undefined);
  // A new answer is on its way while the last one stays on screen: it is not presented as current.
  const pending = !history.data && history.status === "loading" && Boolean(data);
  const focusSearch = () => document.getElementById(searchId)?.focus();
  const groups = data ? groupByYear(data.entries) : [];
  const inView = useYearInView(customerId, groups.map((group) => group.year));

  // Every year of the client (unfiltered), and the years the current search and the other filters
  // reach. yearCounts already leave the year filter out, so a selected year with no matches stays
  // dimmed and a year the search still reaches stays selectable.
  const allYears = [...(totals.data?.facets.yearCounts ?? [])].sort((left, right) => right.year - left.year);
  const firstYear = allYears.length ? allYears[allYears.length - 1]?.year ?? null : null;
  const reachedYears = (data?.facets.yearCounts ?? []).filter((item) => item.count > 0);
  const present = new Set<number>(reachedYears.map((item) => item.year));
  // A year the search reaches shows how many entries it has now (588:8038, 712:22460); one it does
  // not reach keeps its whole count, dimmed (588:8038).
  const shownCount = new Map((data?.facets.yearCounts ?? []).map((item) => [item.year, item.count]));
  const railYears = allYears.map((item) => (present.has(item.year) ? { year: item.year, count: shownCount.get(item.year) ?? item.count } : item));
  // Filtered on a site (712:22460) the list speaks of that site only: the client-wide „De urmărit”
  // is not shown there. A text search never hides it.
  const watch = context.site ? null : watchModel(customerId, workspace, dossier.data ?? null);
  const provenanceLabels = Object.fromEntries((totals.data?.facets.provenances ?? data?.facets.provenances ?? []).map((item) => [item.provenance, item.label]));
  // "acum 5 ani" next to an older year (579:6351): counted from today, a reading aid only.
  const thisYear = new Date().getFullYear();
  const noActivity = totals.data?.totals.entries === 0;

  const toggle = (entryId: string) => {
    setCollapsed(expanded === entryId ? entryId : null);
    setExpandedHere(expanded === entryId ? null : entryId);
    const extra: Record<string, string> = expanded === entryId ? {} : { [EXPANDED_PARAM]: entryId };
    navigate(clientListHref(customerId, "istoric", context, extra), "replace");
  };

  // An offer of the open project previewed over the list (813:31187 „Previzualizează”), in the same
  // dossier as in Oferte: ?oferta= (&foaie=comanda) next to the search, the filters and the open entry.
  // The first preview is a new history entry, so Back closes it; closing gives the focus back to the
  // control that opened it.
  const params = new URLSearchParams(search);
  const previewId = expanded ? params.get("oferta") : null;
  const previewSheet = params.get("foaie") === "comanda" ? "comanda" : "oferta";
  const previewHref = (id: string | null, sheet: "oferta" | "comanda" = "oferta") =>
    clientListHref(customerId, "istoric", context, {
      ...(expanded ? { [EXPANDED_PARAM]: expanded } : {}),
      ...(id ? { oferta: id, ...(sheet === "comanda" ? { foaie: "comanda" } : {}) } : {}),
    });
  const preview = usePreviewHistory((id) => previewHref(id), previewId);
  // A file of an entry opens in the one document viewer of the client page (`document=`).
  const documentPreview = useDocumentPreview(search, (documentId) => clientListHref(customerId, "istoric", context, { ...(expanded ? { [EXPANDED_PARAM]: expanded } : {}), ...(documentId ? { [DOCUMENT_PARAM]: documentId } : {}) }));
  const onOpened = (next: Opened) => (next?.kind === "file" ? documentPreview.open(next.document.documentId) : setOpened(next));
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
  const previewOffers = expanded ? (data?.entries.find((entry) => entry.entryId === expanded)?.branches ?? []).flatMap((branch) => (branch.quote ? [branch.quote.quoteSnapshotId] : [])) : [];

  const jumpToYear = (year: number) => {
    const target = document.getElementById(yearAnchorId(year));
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.focus({ preventScroll: true });
    } else {
      apply({ year: String(year) });
    }
  };
  const toTop = () => {
    const first = groups[0];
    if (first) jumpToYear(first.year);
  };

  // Opened from Sedii (712:22460), the way back names that site and returns to the same entry.
  const fromSites = fromSitesOrigin(customerId);
  const siteName = context.site ? data?.facets.sites.find((site) => site.siteId === context.site)?.name ?? null : null;

  return (
    <section className="hist" aria-labelledby={`${searchId}-title`} data-dossier-section="istoric" data-mode={mode}>
      {/* Opened from Sedii (712:22460): the way back and what the list shows, on one row above the title. */}
      {fromSites ? (
        <SitesOriginBand back={fromSites} siteName={siteName}>
          {filtered && data ? <HistoryResultLine data={data} context={context} apply={apply} setText={setText} pending={pending} afterChange={focusSearch} /> : null}
        </SitesOriginBand>
      ) : null}
      <header className="hist__head">
        <h2 id={`${searchId}-title`} className="hist__title">Istoric</h2>
        {/* The first year with a documented entry — not the start of the commercial relationship. */}
        {/* R1: the total left the navigation; the view says it, with the first documented year. */}
        {firstYear !== null ? <p className="hist__first">{`${countLabel(totals.data?.totals.entries ?? 0, "intrare", "intrări")} din ${firstYear} până azi · prima activitate documentată: ${firstYear}`}</p> : noActivity ? <p className="hist__first">Nicio activitate documentată încă</p> : null}
      </header>

      {noActivity ? (
        <div className="hist-empty">
          <h3>Istoricul se completează singur pe măsură ce lucrezi cu acest client.</h3>
          <p>Aici vor apărea, pe ani, cererile și ofertele, lucrările, documentele și fotografiile. Dacă ai lucrat cu clientul înainte de WorkOS, poți adăuga lucrările vechi ca înregistrări istorice.</p>
          <p className="hist-empty__actions">
            {canCreate ? <button type="button" className="cdh-create" onClick={() => navigate(newRequestHref(customerId))}>+ Cerere nouă</button> : null}
            {onRecord ? <button type="button" className="hcard__button" onClick={onRecord}>Adaugă lucrare istorică</button> : null}
            {uploadHref ? <button type="button" className="hcard__button" onClick={() => navigate(uploadHref)}>Încarcă document</button> : null}
          </p>
        </div>
      ) : (
        <>
          {watch ? <HistoryWatch model={watch} compactLabels={mode === "phone"} /> : null}
          <div className="hist__tools">
            <HistoryTools mode={mode} data={data} context={context} text={text} setText={setText} apply={apply} filtered={filtered} showCount={false} onFilters={() => setFiltersOpen(true)} searchId={searchId} />
          </div>
          {mode !== "desktop" ? <HistoryJumpRow years={railYears.filter((item) => present.has(item.year))} onYear={jumpToYear} /> : null}
          {data && data.totals.entries > 0 && !(fromSites && filtered) ? <HistoryResultLine data={data} context={context} apply={apply} setText={setText} pending={pending} afterChange={focusSearch} /> : null}

          <div className="hist__layout">
            {mode === "desktop" ? (
              <aside className="hist__rail">
                <HistoryYearRail years={railYears} present={present} inView={inView} onYear={jumpToYear} onTop={toTop} />
              </aside>
            ) : null}
            <div className="hist__main">
              {history.status === "loading" && !data ? <p className="hist__state" role="status">Se citește istoricul…</p> : null}
              {history.status === "error" ? (
                <ErrorState title="Istoricul nu a putut fi citit">
                  {data ? "Actualizarea a eșuat. Lista afișată este de la ultima citire reușită." : "Reîncearcă peste câteva momente."}
                  <Button variant="secondary" onClick={() => invalidateResources(key)}>
                    Reîncearcă
                  </Button>
                </ErrorState>
              ) : null}
              {data && data.entries.length === 0 ? (
                <div className="hist__state hist__none" role="status">
                  <p className="hist__none-title">Niciun rezultat</p>
                  <p>{context.q ? "Nicio intrare nu conține textul căutat cu filtrele alese." : "Nicio intrare nu se potrivește filtrelor alese."}</p>
                  {context.year && reachedYears.length > 0 ? (
                    <button type="button" className="hcard__button" onClick={() => { apply({ year: "" }); focusSearch(); }}>
                      Caută în toți anii
                    </button>
                  ) : null}
                </div>
              ) : null}
              {groups.length ? (
                <div className="hist__axis" aria-busy={history.status === "loading"}>
                  {groups.map((group) => (
                    <section key={group.year} className="hyear" aria-labelledby={yearAnchorId(group.year)}>
                      <h3 id={yearAnchorId(group.year)} className="hyear__title" tabIndex={-1}>
                        {group.year}
                        <span className="hyear__count">{countLabel(group.entries.length, "intrare", "intrări")}</span>
                        {thisYear - group.year > 0 ? <span className="hyear__age">{`· acum ${countLabel(thisYear - group.year, "an", "ani")}`}</span> : null}
                      </h3>
                      <ol className="hyear__entries">
                        {group.entries.map((entry) => (
                          <li key={entry.entryId} className="hyear__entry">
                            {expanded === entry.entryId ? (
                              <ExpandedCard
                                customerId={customerId}
                                entry={entry}
                                dossier={dossier.data ?? null}
                                quotes={workspace.quotes}
                                requests={workspace.requests}
                                mode={mode}
                                onCollapse={() => toggle(entry.entryId)}
                                onOpen={onOpened}
                                onSite={(siteId) => apply({ site: siteId })}
                                onPreviewQuote={preview.open}
                                focusOnMount={expandedHere === entry.entryId}
                                provenanceLabels={provenanceLabels}
                              />
                            ) : (
                              <CollapsedCard entry={entry} quotes={workspace.quotes} mode={mode} onExpand={() => toggle(entry.entryId)} onOpen={onOpened} focusOnMount={collapsed === entry.entryId} provenanceLabels={provenanceLabels} />
                            )}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : null}
              {data && data.pageCount > 1 ? (
                <nav className="cdos-pages" aria-label="Pagini istoric">
                  <Button variant="secondary" disabled={data.page <= 1} onClick={() => apply({ page: data.page - 1 })}>
                    ← Mai noi
                  </Button>
                  <span>{`Pagina ${data.page} din ${data.pageCount}`}</span>
                  <Button variant="secondary" disabled={data.page >= data.pageCount} onClick={() => apply({ page: data.page + 1 })}>
                    Mai vechi →
                  </Button>
                </nav>
              ) : null}
            </div>
          </div>
        </>
      )}

      {filtersOpen && data ? (
        <FilterSheet total={data.total} onClose={() => setFiltersOpen(false)} onClear={() => apply({ year: "", site: "", state: "", provenance: "" })}>
          <HistoryFilterGroups data={data} context={context} apply={apply} />
        </FilterSheet>
      ) : null}
      {opened?.kind === "photo" ? <PhotoViewer photos={opened.photos} startId={opened.startId} context={opened.context} note="Colecția: fotografiile acestei intrări · închiderea revine la intrarea din Istoric" onClose={() => setOpened(null)} /> : null}
      {documentPreview.openId ? <DocumentViewer customerId={customerId} dossier={dossier.data ?? null} documentId={documentPreview.openId} onClose={documentPreview.close} /> : null}
      {previewId ? (
        <RequestOfferPreview
          offerId={previewId}
          sheet={previewSheet}
          position={{ index: previewOffers.indexOf(previewId), count: previewOffers.length }}
          onSheet={(sheet) => navigate(previewHref(previewId, sheet), "replace")}
          onMove={(delta) => {
            const next = previewOffers[previewOffers.indexOf(previewId) + delta];
            if (next) preview.open(next);
          }}
          onClose={preview.close}
        />
      ) : null}
    </section>
  );
}
