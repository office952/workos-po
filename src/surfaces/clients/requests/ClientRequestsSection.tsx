import { useEffect, useId, useRef, useState } from "react";
import type { CustomerWorkspaceTransport, QuoteListItemTransport, RequestListItemTransport } from "../../../api/types";
import { formatTimestamp } from "../../../presentation/format";
import { presentQuoteHistoryState } from "../../../presentation/quoteHistory";
import { presentQuoteWorklistAction } from "../../../presentation/worklistAction";
import { clientHref, jobHref, registryQuoteHref, requestHref } from "../../../routing/appRoute";
import { hrefPath, originBack } from "../../../routing/originBack";
import { usePreviewHistory } from "../../../routing/usePreviewHistory";
import { OfferPreviewDrawer } from "../../quotes/OfferPreviewDrawer";
import { useBandMode } from "../dossier/bandModel";
import { useCustomerDossier, formatDay } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { RailGroup } from "../dossier/dossierRail";
import { FilterMenu } from "../dossier/FilterMenu";
import { FilterSheet } from "../dossier/FilterSheet";
import { offerAmount } from "../dossier/history/branchChain";
import { follow } from "../dossier/history/follow";
import { countLabel } from "../dossier/historyModel";
import { clientListHref, EMPTY_LIST_CONTEXT, useClientListContext } from "../dossier/listContext";
import { OfferRowView, type OfferTag, type OfferWork } from "../dossier/OfferRowView";
import { railOption } from "../dossier/railOption";
import { ResultBar } from "../dossier/ResultBar";
import { filterChip, type ResultChip } from "../dossier/resultBarModel";
import { buildRequestsView, commercialProgress, type OfferItem, type RequestGroup, type RequestsMode, type SiteRef } from "./requestsModel";
import "../../../styles/surfaces/client-requests.css";


/**
 * The offer's own tag: a superseded version says so in the server's words (608:9487), the server's
 * attention reason is warm, otherwise the offer's stage.
 */
function tagOf(quote: QuoteListItemTransport): OfferTag {
  if (quote.superseded && !quote.orderSnapshotId) return { tone: "past", label: quote.attentionLabel ?? "Înlocuită de o versiune nouă" };
  if (quote.needsAttention && quote.attentionLabel) return { tone: "offer", label: quote.attentionLabel };
  return { tone: quote.orderSnapshotId ? "done" : "neutral", label: presentQuoteHistoryState(quote) };
}

/** The work of an offer: its job (by order); an order whose job the list lacks keeps the server's way in. */
function workOf(offer: OfferItem): OfferWork {
  const { quote, job } = offer;
  if (job) return { href: jobHref(job.jobId), label: ["Lucrare", job.stageLabel, job.progressLabel?.split(" · ")[0] ?? null].filter(Boolean).join(" · ") };
  if (quote.superseded && !quote.orderSnapshotId) return { text: "Nu e oferta curentă" };
  if (quote.orderSnapshotId) {
    const action = presentQuoteWorklistAction(quote);
    return action.actionHref !== registryQuoteHref(quote) ? { href: action.actionHref, label: action.actionLabel } : { text: "Comandă fără lucrare în listă" };
  }
  return { text: "Fără lucrare · oferta nu are comandă" };
}

function OfferRow({ offer, onPreview }: { offer: OfferItem; onPreview: (id: string) => void }) {
  const { quote } = offer;
  const tag = tagOf(quote);
  const work = workOf(offer);
  return (
    <OfferRowView
      amount={offerAmount(quote)}
      reference={quote.reference}
      title={[quote.productLabel, quote.inscription].filter(Boolean).join(" · ")}
      created={quote.createdAt ? `creată ${formatTimestamp(quote.createdAt)}` : null}
      tag={tag}
      work={work}
      attention={tag.tone === "offer"}
      superseded={quote.superseded && !quote.orderSnapshotId}
      preview={{ id: quote.quoteSnapshotId, onPreview }}
      openHref={registryQuoteHref(quote)}
    />
  );
}

function RequestCard({ customerId, group, onPreview, arrival }: { customerId: string; group: RequestGroup; onPreview: (id: string) => void; arrival: boolean }) {
  const { request, site, offers } = group;
  const historyHref = clientListHref(customerId, "istoric", EMPTY_LIST_CONTEXT, { deschis: `project:${request.requestId}` });
  const href = requestHref(request.requestId);
  const received = formatDay(request.createdAt);
  return (
    <li className="dreqcard" data-arrival-target={arrival || undefined}>
      <div className="dreqcard__head">
        <div className="dreqcard__identity">
          <p className="dreqcard__kicker">
            <span className="dreqcard__kind">Cerere</span>
            {["", request.reference, received ? `primită ${received}` : null].filter((part) => part !== null).join(" · ")}
          </p>
          <h3 className="dreqcard__title">{request.title}</h3>
          {site ? (
            <p className="dreqcard__site">
              <DossierIcon name="site" size={13} />
              {site.name}
            </p>
          ) : null}
        </div>
        <dl className="dreqcard__facts">
          <div>
            <dt>Starea cererii</dt>
            {/* The server's state of the request, as it comes; the commercial progress is apart. */}
            <dd>
              <span className="dstate" data-tone="neutral">
                <span>{request.statusLabel}</span>
              </span>
            </dd>
          </div>
          <div>
            <dt>Progres comercial</dt>
            <dd className="dreqcard__progress">{commercialProgress(group)}</dd>
          </div>
        </dl>
        <p className="dreqcard__actions">
          <a className="dreqcard__open" href={href} onClick={(event) => follow(event, href)} aria-label={`Deschide cererea ${request.reference ?? request.title}`}>
            Deschide cererea →
          </a>
          <a className="dreqcard__link" href={historyHref} onClick={(event) => follow(event, historyHref)} aria-label={`Vezi în Istoric: ${request.title}`}>
            Vezi în Istoric →
          </a>
        </p>
      </div>
      {offers.length ? (
        <>
          <p className="dreqcard__label">{countLabel(offers.length, "ofertă", "oferte")}</p>
          <ol className="hoffer-list">
            {offers.map((offer) => (
              <OfferRow key={offer.quote.quoteSnapshotId} offer={offer} onPreview={onPreview} />
            ))}
          </ol>
        </>
      ) : (
        <p className="dreqcard__empty">
          <span>Nicio ofertă încă pentru această cerere. Oferta se pregătește din pagina cererii.</span>
          <a className="dreqcard__link" href={href} onClick={(event) => follow(event, href)}>
            Deschide cererea →
          </a>
        </p>
      )}
    </li>
  );
}

/** Toate ofertele (640:12261): each offer once, under the line of the request it belongs to. */
function OfferLine({ offer, onPreview }: { offer: OfferItem; onPreview: (id: string) => void }) {
  return (
    <li className="dreqflat">
      <p className="dreqflat__context">
        <span className="dreqcard__kind">{offer.request ? "Cerere" : "Fără cerere"}</span>
        {offer.request ? ` ${[offer.request.reference, offer.request.title, offer.site ? `⌖ ${offer.site.name}` : null].filter(Boolean).join(" · ")}` : null}
      </p>
      <ol className="hoffer-list">
        <OfferRow offer={offer} onPreview={onPreview} />
      </ol>
    </li>
  );
}

/**
 * N-020 · Cereri și oferte (Corecții GO 17: 640:11188 Pe cereri, 640:11601 + În așteptare,
 * 640:12261 Toate ofertele, 640:11942 + În așteptare; 1280 647:13268; 768 647:13600; telefon
 * 643:12057 / 643:12385 / 643:12651; 360 643:12900; stări 608:9874; cazuri 608:9487). „Afișare”
 * chooses Pe cereri or Toate ofertele; „În așteptare” is a filter of its own, kept across both
 * modes. Mode, filter, search, site and year live in the URL and this client's list memory; the
 * offer preview (668:15454) is the offer's dossier over the list, a history entry Back closes.
 */
export function ClientRequestsSection({ customerId, workspace, search }: { customerId: string; workspace: CustomerWorkspaceTransport; search: string }) {
  const mode = useBandMode();
  const dossier = useCustomerDossier(customerId);
  const { context, text, setText, apply } = useClientListContext(customerId, "cereri", search);
  const view: RequestsMode = context.selection === "oferte" ? "oferte" : "cereri";
  const attention = context.attention === "1";
  const searchId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sites = new Map((dossier.data?.sites ?? []).map((site) => [site.siteId, site.name]));
  const siteByRequest = new Map(
    (dossier.data?.siteAssignments ?? []).filter((item) => item.subjectKind === "REQUEST").map((item) => [item.subjectId, item.siteId]),
  );
  const siteOf = (requestId: string): SiteRef | null => {
    const siteId = siteByRequest.get(requestId);
    return siteId ? { siteId, name: sites.get(siteId) ?? "Sediu" } : null;
  };
  const data = buildRequestsView(workspace, siteOf, { q: context.q, site: context.site, year: context.year, attention, mode: view });
  // The year is the request's in Pe cereri and the offer's in Toate ofertele; the chosen number stays across modes.
  const yearTitle = view === "oferte" ? "Anul ofertei" : "Anul cererii";

  // Opened from Istoric · De urmărit (640:11601): the way back to that very entry.
  const fromHistory = originBack({ href: clientHref(customerId), label: "Istoric" }, (href) => {
    if (hrefPath(href) !== hrefPath(clientHref(customerId))) return false;
    const section = new URL(href, window.location.origin).searchParams.get("sectiune");
    return !section || section === "istoric";
  });

  // The preview of an offer (668:15454): ?oferta= next to the list context; Back closes it.
  const params = new URLSearchParams(search);
  const previewId = params.get("oferta");
  // A former request-preview link (?cerere=…, Relație N-018) opens this view on that request.
  const legacyRequest = params.get("cerere");
  const previewHref = (id: string | null) => clientListHref(customerId, "cereri", context, id ? { oferta: id } : {});
  const preview = usePreviewHistory(previewHref, previewId);
  const lastPreview = useRef<string | null>(null);
  useEffect(() => {
    if (previewId) {
      lastPreview.current ??= previewId;
      return;
    }
    const previous = lastPreview.current;
    lastPreview.current = null;
    if (previous) document.querySelector<HTMLElement>(`[data-preview-opener="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
  }, [previewId]);
  const previewed = previewId ? workspace.quotes.find((quote) => quote.quoteSnapshotId === previewId) ?? null : null;
  const previewRequest: RequestListItemTransport | null = previewed?.requestId ? workspace.requests.find((request) => request.requestId === previewed.requestId) ?? null : null;

  const setMode = (next: RequestsMode) => apply({ selection: next === "oferte" ? "oferte" : "" });
  const siteName = context.site ? sites.get(context.site) ?? "sediu indisponibil" : null;
  const shownRequests = data.groups.length;
  const shownOffers = view === "oferte" ? data.offers.length : data.groups.reduce((sum, group) => sum + group.offers.length, 0) + data.loose.length;
  const nothing = workspace.requests.length + workspace.quotes.length === 0;
  const empty = view === "oferte" ? data.offers.length === 0 : data.groups.length + data.loose.length === 0;

  // R1 · Bara de rezultat (845:31815): the mode is not a filter; "În așteptare", the site and the
  // year are, each a chip of its own. The count follows the mode: requests or offers.
  const chips: ResultChip[] = [
    attention ? { key: "attention", label: "Filtru", value: "În așteptare", onRemove: () => apply({ attention: "" }) } : null,
    filterChip("site", "Sediu", data.sites, context.site, () => apply({ site: "" }), siteName ?? "sediu indisponibil"),
    filterChip("year", yearTitle, data.years, context.year, () => apply({ year: "" }), context.year),
  ].filter((chip): chip is ResultChip => chip !== null);
  const totalsLine = [
    countLabel(data.totals.requests, "cerere", "cereri"),
    countLabel(data.totals.offers, "ofertă", "oferte"),
    data.totals.waiting ? `${countLabel(data.totals.waiting, "ofertă", "oferte")} în așteptare` : null,
  ].filter(Boolean).join(" · ");
  // Pe cereri + an: offers without a request have no request year — said, never silently dropped.
  const looseNote = data.looseWithoutYear ? (
    <p className="dreqs__hidden">{`${countLabel(data.looseWithoutYear, "ofertă fără cerere nu are", "oferte fără cerere nu au")} an al cererii; ${data.looseWithoutYear === 1 ? "apare" : "apar"} în Toate ofertele.`}</p>
  ) : null;
  const clearAll = () => {
    setText("");
    apply({ q: "", attention: "", site: "", year: "" });
  };

  return (
    <section className="dreqs" aria-labelledby={`${searchId}-title`} data-dossier-section="cereri" data-mode={mode}>
      {fromHistory.onClick ? (
        <a className="dreqs__back" href={fromHistory.href} onClick={fromHistory.onClick}>
          ← Istoric
        </a>
      ) : null}
      {/* The phone's dark bar and the tablet's tab already name the section; the heading stays for readers. */}
      <header className="dreqs__head">
        <h2 id={`${searchId}-title`} className="dreqs__title">Cereri și oferte</h2>
        {/* R1: the counts left the navigation; the view says them. */}
        {nothing ? null : <p className="dreqs__totals">{totalsLine}</p>}
      </header>

      <div className="dreqs__tools">
        <div className="dreqs__display" role="group" aria-label="Afișare">
          {mode === "desktop" ? <span className="dreqs__tool-label" aria-hidden="true">Afișare</span> : null}
          <div className="dreqs__segment">
            <button type="button" aria-pressed={view === "cereri"} onClick={() => setMode("cereri")}>
              {mode === "phone" ? `Pe cereri · ${data.totals.requests}` : `Pe cereri · ${countLabel(data.totals.requests, "cerere", "cereri")}`}
            </button>
            <button type="button" aria-pressed={view === "oferte"} onClick={() => setMode("oferte")}>
              {mode === "phone" ? `Toate ofertele · ${data.totals.offers}` : `Toate ofertele · ${countLabel(data.totals.offers, "ofertă", "oferte")}`}
            </button>
          </div>
        </div>
        <div className="dreqs__filter" role="group" aria-label="Filtru">
          {mode !== "tablet" ? <span className="dreqs__tool-label" aria-hidden="true">Filtru</span> : null}
          <span className="dreqs__chip" data-active={attention || undefined}>
            <button type="button" className="dreqs__chip-toggle" aria-pressed={attention} onClick={() => apply({ attention: attention ? "" : "1" })}>
              <span className="dreqs__chip-dot" aria-hidden="true" />
              {`În așteptare · ${data.totals.waiting}`}
            </button>
            {attention ? (
              <button type="button" className="dreqs__chip-clear" aria-label="Elimină filtrul În așteptare" onClick={() => apply({ attention: "" })}>
                <DossierIcon name="close" size={13} />
              </button>
            ) : null}
          </span>
          {mode === "phone" ? (
            <button type="button" className="dreqs__sheet-button" aria-haspopup="dialog" data-active={context.site || context.year ? true : undefined} onClick={() => setFiltersOpen(true)}>
              {context.site || context.year ? `Sediu, an · ${[context.site, context.year].filter(Boolean).length}` : "Sediu, an"}
            </button>
          ) : null}
        </div>
        <div className="dreqs__search" role="search">
          <label className="dreqs__field" htmlFor={searchId} data-filled={text ? true : undefined}>
            <DossierIcon name="search" size={15} />
            <span className="u-visually-hidden">Caută cereri și oferte</span>
            <input id={searchId} type="search" value={text} autoComplete="off" placeholder={mode === "desktop" ? "Caută cerere sau ofertă: titlu, referință, produs…" : "Caută cerere sau ofertă…"} onChange={(event) => setText(event.target.value)} />
            {text ? (
              <button type="button" className="dreqs__clear" onClick={() => { setText(""); apply({ q: "" }); document.getElementById(searchId)?.focus(); }}>
                <DossierIcon name="close" size={12} />
                Șterge
              </button>
            ) : null}
          </label>
          {mode === "desktop" ? (
            <span className="dreqs__menus">
              {data.sites.length ? <FilterMenu title="Sediu" allLabel="Toate sediile" options={data.sites} value={context.site} onChange={(value) => apply({ site: value })} /> : null}
              {data.years.length ? <FilterMenu title={yearTitle} allLabel="Toți anii" options={data.years} value={context.year} onChange={(value) => apply({ year: value })} /> : null}
            </span>
          ) : mode === "tablet" ? (
            <button type="button" className="dreqs__sheet-button" aria-haspopup="dialog" data-active={context.site || context.year ? true : undefined} onClick={() => setFiltersOpen(true)}>
              {context.site || context.year ? `Sediu, an · ${[context.site, context.year].filter(Boolean).length}` : "Sediu, an"}
            </button>
          ) : null}
        </div>
      </div>

      {nothing ? null : (
        <ResultBar
          shown={view === "oferte" ? shownOffers : shownRequests}
          total={view === "oferte" ? data.totals.offers : data.totals.requests}
          unit={view === "oferte" ? ["ofertă", "oferte"] : ["cerere", "cereri"]}
          detail={view === "cereri" ? (context.q || chips.length ? (attention ? `${countLabel(data.waitingShown, "ofertă", "oferte")} în așteptare` : null) : countLabel(data.totals.offers, "ofertă", "oferte")) : null}
          query={context.q}
          onClearQuery={() => { setText(""); apply({ q: "" }); }}
          chips={chips}
          onShowAll={clearAll}
          sort={mode === "phone" ? null : "Cele mai noi întâi"}
          afterChange={() => document.getElementById(searchId)?.focus()}
        />
      )}

      {nothing ? (
        <p className="dreqs__none">Clientul nu are încă cereri sau oferte în WorkOS. O cerere nouă se deschide din antet.</p>
      ) : empty ? (
        <div className="dreqs__none" role="status">
          <p className="dreqs__none-title">{context.q ? `Nicio cerere sau ofertă pentru „${context.q}”` : "Nicio cerere sau ofertă pentru filtrele alese"}</p>
          <p>{`Căutarea se face în titluri, referințe și produse. Selecția „${view === "cereri" ? "Pe cereri" : "Toate ofertele"}” și filtrele rămân.`}</p>
          {looseNote}
        </div>
      ) : view === "cereri" ? (
        <>
          <ol className="dreqs__list">
            {data.groups.map((group) => (
              <RequestCard key={group.request.requestId} customerId={customerId} group={group} onPreview={preview.open} arrival={group.request.requestId === legacyRequest} />
            ))}
          </ol>
          {data.loose.length ? (
            <section className="dreqs__loose" aria-label="Oferte fără cerere">
              <p className="dreqcard__label">{`Fără cerere · ${countLabel(data.loose.length, "ofertă", "oferte")}`}</p>
              <ol className="hoffer-list">
                {data.loose.map((offer) => (
                  <OfferRow key={offer.quote.quoteSnapshotId} offer={offer} onPreview={preview.open} />
                ))}
              </ol>
            </section>
          ) : null}
          {looseNote}
          {data.withoutWaiting.length ? (
            <p className="dreqs__hidden">
              {`${countLabel(data.withoutWaiting.length, "cerere nu are", "cereri nu au")} oferte în așteptare: ${data.withoutWaiting.map((request) => request.reference ?? request.title).join(", ")}.`}
            </p>
          ) : null}
        </>
      ) : (
        <ol className="dreqs__list" data-flat>
          {data.offers.map((offer) => (
            <OfferLine key={offer.quote.quoteSnapshotId} offer={offer} onPreview={preview.open} />
          ))}
        </ol>
      )}

      {filtersOpen ? (
        <FilterSheet title="Sediu și an" total={view === "oferte" ? shownOffers : shownRequests} unit={view === "oferte" ? ["ofertă", "oferte"] : ["cerere", "cereri"]} onClose={() => setFiltersOpen(false)} onClear={() => apply({ site: "", year: "" })}>
          <div className="dfilters" data-sheet>
            {data.sites.length ? (
              <RailGroup title="Sediu">
                {railOption(!context.site, () => apply({ site: "" }), "Toate sediile", null, "all-site", true)}
                {data.sites.map((site) => railOption(context.site === site.value, () => apply({ site: context.site === site.value ? "" : site.value }), site.label, site.count, site.value, true))}
              </RailGroup>
            ) : null}
            {data.years.length ? (
              <RailGroup title={yearTitle}>
                {railOption(!context.year, () => apply({ year: "" }), "Toți anii", null, "all-year", true)}
                {data.years.map((year) => railOption(context.year === year.value, () => apply({ year: context.year === year.value ? "" : year.value }), year.label, year.count, year.value, true))}
              </RailGroup>
            ) : null}
          </div>
        </FilterSheet>
      ) : null}

      {previewId ? (
        <OfferPreviewDrawer
          item={previewed}
          offerId={previewId}
          request={previewRequest ? { requestId: previewRequest.requestId, reference: previewRequest.reference, title: previewRequest.title } : null}
          siteName={previewRequest ? siteOf(previewRequest.requestId)?.name ?? null : null}
          onClose={preview.close}
        />
      ) : null}
    </section>
  );
}
