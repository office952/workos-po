import { useId, useState } from "react";
import type { CustomerWorksModel, WorkItem } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import "../../../styles/surfaces/client-work-memory.css";
import { navigate } from "../../../routing/navigate";
import { useBandMode } from "../dossier/bandModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { RailGroup } from "../dossier/dossierRail";
import { FilterMenu, type FilterMenuOption } from "../dossier/FilterMenu";
import { FilterSheet } from "../dossier/FilterSheet";
import { countLabel, groupByYear } from "../dossier/historyModel";
import { clientListHref, EXPANDED_PARAM, useClientListContext, type ListContext } from "../dossier/listContext";
import { PhotoViewer } from "../dossier/PhotoViewer";
import { railOption } from "../dossier/railOption";
import { ResultBar } from "../dossier/ResultBar";
import { filterChip, type ResultChip } from "../dossier/resultBarModel";
import { fromSitesOrigin } from "../sites/originFromSites";
import { SitesOriginBand } from "../sites/SitesOrigin";
import { DocumentViewer } from "../documents/DocumentViewer";
import { DOCUMENT_PARAM, useDocumentPreview } from "../documents/useDocumentPreview";
import { useCustomerDossier } from "../dossier/dossierModel";
import { HistoricalWorkDetail } from "./HistoricalWorkDetail";
import { WorkMemoryDetail } from "./WorkMemoryDetail";
import { useWorks } from "./useWorks";
import { WorkCard, type OpenPhotos } from "./WorkCard";
import { PROVENANCE_OPTIONS, provenanceCount, totalsLine } from "./worksModel";
import "../../../styles/surfaces/client-works.css";

const PAGE_SIZE = 20;

type Choices = { years: FilterMenuOption[]; sites: FilterMenuOption[]; states: FilterMenuOption[] };

/**
 * The server's choices for An, Sediu and Stare, each counted under the other active filters. An
 * active choice the server no longer offers stays, at 0, so it can be seen and removed.
 */
function choicesOf(data: CustomerWorksModel, context: ListContext): Choices {
  const keep = (options: FilterMenuOption[], value: string, label: string) => (value && !options.some((option) => option.value === value) ? [...options, { value, label, count: 0 }] : options);
  return {
    years: keep(
      data.facets.years.map((year) => ({ value: String(year), label: String(year), count: data.facets.yearCounts.find((item) => item.year === year)?.count ?? null })),
      context.year,
      context.year,
    ),
    sites: keep(
      data.facets.sites.map((site) => ({ value: site.siteId, label: site.active ? site.name : `${site.name} (inactiv)`, count: site.count })),
      context.site,
      "Sediu indisponibil",
    ),
    states: keep(
      data.facets.states.map((state) => ({ value: state.state, label: state.label, count: state.count })),
      context.state,
      "Stare indisponibilă",
    ),
  };
}

/**
 * Lucrări (N-020 etapa 4 · Figma 644:12426, documente 644:12878, Istorice + 2021 644:13352 /
 * 644:13543, 1280 647:13900, 768 647:14189, telefon 644:13766 / 644:14072, 360 644:14328, Noapte
 * 648:14211 / 648:14447, stări 616:12643): every work of the client, each once — the jobs of
 * WorkOS and the historical records — as the server lists, searches, filters and pages them.
 * Search, provenance, year, site, state, page and the open card live in the address and in this
 * client's list memory. A WorkOS work opens its memory here; a historical record opens its detail here.
 */
export function ClientWorksSection({ customerId, search }: { customerId: string; search: string }) {
  const mode = useBandMode();
  const workId = new URLSearchParams(search).get("lucrare");
  const jobMemoryId = workId?.startsWith("job:") ? workId.slice("job:".length) : null;
  const list = useClientListContext(customerId, "lucrari", search);
  return (
    <section className="dworks" data-mode={mode} data-dossier-section={jobMemoryId ? "memoria-lucrarii" : workId ? "lucrare-istorica" : "lucrari"} aria-labelledby="dworks-title">
      {jobMemoryId ? (
        <>
          <h2 id="dworks-title" className="u-visually-hidden">Lucrări</h2>
          <WorkMemoryDetail customerId={customerId} jobId={jobMemoryId} context={list.context} search={search} />
        </>
      ) : workId ? (
        <>
          <h2 id="dworks-title" className="u-visually-hidden">Lucrări</h2>
          <HistoricalWorkDetail customerId={customerId} workId={workId} context={list.context} mode={mode} search={search} />
        </>
      ) : (
        <WorksList customerId={customerId} search={search} list={list} mode={mode} />
      )}
    </section>
  );
}

function WorksList({ customerId, search, list, mode }: { customerId: string; search: string; list: ReturnType<typeof useClientListContext>; mode: ReturnType<typeof useBandMode> }) {
  const { context, text, setText, apply, filtered } = list;
  const expanded = new URLSearchParams(search).get(EXPANDED_PARAM);
  const searchId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const dossier = useCustomerDossier(customerId);
  // A document opens in the one viewer of the client page, next to the list and the open card.
  const preview = useDocumentPreview(search, (documentId) => clientListHref(customerId, "lucrari", context, { ...(expanded ? { [EXPANDED_PARAM]: expanded } : {}), ...(documentId ? { [DOCUMENT_PARAM]: documentId } : {}) }));
  const [photos, setPhotos] = useState<OpenPhotos | null>(null);
  const works = useWorks(customerId, {
    q: context.q || undefined,
    kind: context.kind || undefined,
    year: context.year || undefined,
    site: context.site || undefined,
    state: context.state || undefined,
    page: context.page,
    pageSize: PAGE_SIZE,
  });
  // While another search or filter loads, the last result stays (busy): the tools keep their place and the focus.
  const [lastShown, setLastShown] = useState(works.data);
  if (works.data && works.data !== lastShown) setLastShown(works.data);
  const data = works.data ?? (works.status === "loading" || works.status === "idle" ? lastShown : undefined);
  const choices = data ? choicesOf(data, context) : null;
  const dimensions = [context.year, context.site, context.state].filter(Boolean).length;
  const totals = data?.totals ?? null;

  // The open card is part of the address (replace: no new history entry), like the open entry of Istoric.
  const toggle = (item: WorkItem) => navigate(clientListHref(customerId, "lucrari", context, expanded === item.workId ? {} : { [EXPANDED_PARAM]: item.workId }), "replace");
  const openHref = (item: WorkItem) => (item.job ? clientListHref(customerId, "lucrari", context, { lucrare: `job:${item.job.jobId}` }) : item.historicalWorkId ? clientListHref(customerId, "lucrari", context, { lucrare: item.historicalWorkId }) : null);
  const clearSearch = () => {
    setText("");
    apply({ q: "" });
  };
  const clearAll = () => {
    setText("");
    apply({ q: "", kind: "", year: "", site: "", state: "" });
  };
  // A new answer is on its way while the last one stays on screen: it is not presented as current.
  const pending = !works.data && works.status === "loading" && Boolean(data);
  const sheetLabel = mode === "phone" ? (dimensions ? `Filtre · ${dimensions}` : "Filtre") : dimensions ? `An, sediu, stare · ${dimensions}` : "An, sediu, stare";

  const segment = totals ? (
    <div className="dworks__segment" role="group" aria-label="Proveniență">
      {PROVENANCE_OPTIONS.map((option) => (
        <button key={option.value || "all"} type="button" aria-pressed={context.kind === option.value} onClick={() => apply({ kind: option.value })}>
          {mode === "phone" ? `${option.short} ${provenanceCount(totals, option.value)}` : `${option.label} · ${provenanceCount(totals, option.value)}`}
        </button>
      ))}
    </div>
  ) : null;

  // Opened from Sedii (712:22814 / 719:75304 / 712:23047): the way back with the result line, above the title.
  const fromSites = fromSitesOrigin(customerId);
  // R1 · Bara de rezultat (845:31815): always there; filtered, every filter is a chip of its own.
  const chips: ResultChip[] = [
    filterChip("kind", "Proveniență", PROVENANCE_OPTIONS, context.kind, () => apply({ kind: "" })),
    filterChip("year", "An", choices?.years ?? [], context.year, () => apply({ year: "" }), context.year),
    filterChip("site", "Sediu", choices?.sites ?? [], context.site, () => apply({ site: "" }), "sediu indisponibil"),
    filterChip("state", "Stare", choices?.states ?? [], context.state, () => apply({ state: "" }), "stare indisponibilă"),
  ].filter((chip): chip is ResultChip => chip !== null);
  const focusSearch = () => document.getElementById(searchId)?.focus();
  const resultLine = data && data.totals.all > 0 ? (
    <ResultBar
      shown={data.total}
      total={data.totals.all}
      unit={["lucrare", "lucrări"]}
      query={context.q}
      onClearQuery={clearSearch}
      chips={chips}
      onShowAll={clearAll}
      sort={mode === "phone" ? null : "Cele mai noi întâi"}
      pending={pending}
      afterChange={focusSearch}
    />
  ) : null;

  return (
    <>
      {fromSites ? <SitesOriginBand back={fromSites} siteName={context.site ? (dossier.data?.sites.find((site) => site.siteId === context.site)?.name ?? null) : null}>{filtered && data ? resultLine : null}</SitesOriginBand> : null}
      <header className="dworks__head">
        <h2 id="dworks-title" className="dworks__title">Lucrări</h2>
        {totals ? <p className="dworks__totals">{totalsLine(totals, mode === "phone")}</p> : null}
      </header>

      <div className="dworks__tools">
        <div className="dworks__search" role="search">
          <label className="dworks__field" htmlFor={searchId} data-filled={text ? true : undefined}>
            <DossierIcon name="search" size={15} />
            <span className="u-visually-hidden">Caută lucrări</span>
            <input
              id={searchId}
              type="search"
              value={text}
              autoComplete="off"
              placeholder={mode === "desktop" ? "Caută lucrare: titlu, inscripție, referință, sediu, document…" : mode === "tablet" ? "Caută lucrare…" : "Caută…"}
              onChange={(event) => setText(event.target.value)}
            />
            {text ? (
              <button type="button" className="dworks__clear" onClick={() => { clearSearch(); document.getElementById(searchId)?.focus(); }}>
                <DossierIcon name="close" size={12} />
                Șterge
              </button>
            ) : null}
          </label>
          {mode !== "desktop" && choices ? (
            <button type="button" className="dworks__sheet-button" aria-haspopup="dialog" data-active={dimensions ? true : undefined} onClick={() => setSheetOpen(true)}>
              {sheetLabel}
            </button>
          ) : null}
        </div>
        {segment}
        {mode === "desktop" && choices ? (
          <span className="dworks__menus">
            {choices.years.length ? <FilterMenu title="An" allLabel="Toți anii" options={choices.years} value={context.year} onChange={(value) => apply({ year: value })} /> : null}
            {choices.sites.length ? <FilterMenu title="Sediu" allLabel="Toate sediile" options={choices.sites} value={context.site} onChange={(value) => apply({ site: value })} /> : null}
            {choices.states.length ? <FilterMenu title="Stare" allLabel="Toate stările" options={choices.states} value={context.state} onChange={(value) => apply({ state: value })} /> : null}
          </span>
        ) : null}
      </div>

      {!fromSites || !filtered ? resultLine : null}

      {works.status === "error" ? (
        <div className="dworks__state" role="alert">
          <p className="dworks__state-title">Lucrările nu au putut fi încărcate.</p>
          <p>{data ? "Lista de mai jos este de la ultima citire reușită. Filtrele rămân păstrate." : "Filtrele rămân păstrate."}</p>
          <button type="button" className="dworks__button" onClick={works.retry}>Încearcă din nou</button>
        </div>
      ) : null}
      {!data && works.status !== "error" ? (
        <div className="dworks__state" role="status" aria-busy="true">
          <p>Se încarcă lucrările…</p>
          <span className="dworks__skeleton" aria-hidden="true" />
          <span className="dworks__skeleton" aria-hidden="true" />
          <span className="dworks__skeleton" aria-hidden="true" />
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        filtered ? (
          <div className="dworks__state">
            <p className="dworks__state-title">Nicio lucrare pentru căutarea și filtrele alese</p>
            <p>Schimbă textul sau elimină un filtru din bara de mai sus; „Arată toate” readuce lista completă.</p>
          </div>
        ) : (
          <div className="dworks__state">
            <p className="dworks__state-title">Nicio lucrare</p>
            <p>Lucrările eliberate în WorkOS și lucrările istorice ale acestui client apar aici.</p>
          </div>
        )
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="dworks__years" aria-busy={works.status === "loading" || undefined}>
          {groupByYear(data.items).map((group) => (
            <section key={group.year} className="dworks__year" aria-labelledby={`dworks-an-${group.year}`}>
              <h3 id={`dworks-an-${group.year}`} className="dworks__year-title">
                {`${group.year} `}
                <span>{countLabel(group.entries.length, "lucrare", "lucrări")}</span>
              </h3>
              <ol className="dworks__list">
                {group.entries.map((item) => (
                  <WorkCard
                    key={item.workId}
                    item={item}
                    mode={mode}
                    openHref={openHref(item)}
                    expanded={expanded === item.workId}
                    onToggle={() => toggle(item)}
                    onPhotos={setPhotos}
                    onFile={(document) => (document.kind === "PHOTO" && document.preview === "IMAGE" ? setPhotos({ photos: [document], startId: document.documentId, context: item.title }) : preview.open(document.documentId))}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : null}

      {data && data.pageCount > 1 ? (
        <nav className="dworks__pages" aria-label="Pagini lucrări">
          <Button variant="secondary" disabled={data.page <= 1} onClick={() => apply({ page: data.page - 1 })}>← Mai noi</Button>
          <span>{`Pagina ${data.page} din ${data.pageCount}`}</span>
          <Button variant="secondary" disabled={data.page >= data.pageCount} onClick={() => apply({ page: data.page + 1 })}>Mai vechi →</Button>
        </nav>
      ) : null}

      {sheetOpen && data && choices ? (
        <FilterSheet title="An, sediu și stare" unit={["lucrare", "lucrări"]} total={data.total} onClose={() => setSheetOpen(false)} onClear={() => apply({ year: "", site: "", state: "" })}>
          <div className="dfilters" data-sheet>
            {choices.years.length ? (
              <RailGroup title="An">
                {railOption(!context.year, () => apply({ year: "" }), "Toți anii", null, "all-year", true)}
                {choices.years.map((year) => railOption(context.year === year.value, () => apply({ year: context.year === year.value ? "" : year.value }), year.label, year.count, year.value, true))}
              </RailGroup>
            ) : null}
            {choices.sites.length ? (
              <RailGroup title="Sediu">
                {railOption(!context.site, () => apply({ site: "" }), "Toate sediile", null, "all-site", true)}
                {choices.sites.map((site) => railOption(context.site === site.value, () => apply({ site: context.site === site.value ? "" : site.value }), site.label, site.count, site.value, true))}
              </RailGroup>
            ) : null}
            {choices.states.length ? (
              <RailGroup title="Stare">
                {railOption(!context.state, () => apply({ state: "" }), "Toate stările", null, "all-state", true)}
                {choices.states.map((state) => railOption(context.state === state.value, () => apply({ state: context.state === state.value ? "" : state.value }), state.label, state.count, state.value, true))}
              </RailGroup>
            ) : null}
          </div>
        </FilterSheet>
      ) : null}

      {preview.openId ? <DocumentViewer customerId={customerId} dossier={dossier.data ?? null} documentId={preview.openId} onClose={preview.close} /> : null}
      {photos ? <PhotoViewer photos={photos.photos} startId={photos.startId} context={photos.context} note="Colecția: fotografiile acestei lucrări · închiderea revine la cardul din Lucrări" onClose={() => setPhotos(null)} /> : null}
    </>
  );
}
