import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DossierDocument } from "../../../adapters/customerDossierAdapter";
import { invalidateResources } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { useBandMode, useDisclosure, type BandMode } from "../dossier/bandModel";
import { formatBytes, formatDay, useCustomerDossier } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { RailGroup } from "../dossier/dossierRail";
import { DossierFormDialog } from "../dossier/dossierShared";
import { DocumentUploadForm } from "../dossier/DocumentUploadForm";
import { FilterMenu } from "../dossier/FilterMenu";
import { FilterSheet } from "../dossier/FilterSheet";
import { useEntryAction } from "../dossier/header/entryAction";
import { countLabel } from "../dossier/historyModel";
import { clientListHref, useClientListContext } from "../dossier/listContext";
import { useMenuReturn } from "../dossier/menuReturn";
import { railOption } from "../dossier/railOption";
import { ResultBar } from "../dossier/ResultBar";
import { filterChip, type ResultChip } from "../dossier/resultBarModel";
import { fromSitesOrigin } from "../sites/originFromSites";
import { SitesOriginBand } from "../sites/SitesOrigin";
import { EditDocumentDialog } from "./DocumentEditDialog";
import { LinkDocumentDialog } from "./DocumentLinksDialog";
import { useDocumentNotice } from "./documentNotice";
import { buildDocumentsView, documentDateLabel, fileFormat, kindWord, type DocumentItem, type DocumentsView } from "./documentsModel";
import { DocumentViewer } from "./DocumentViewer";
import { DOCUMENT_PARAM, useDocumentPreview } from "./useDocumentPreview";
import "../../../styles/surfaces/client-documents.css";

/**
 * Documente (N-020 etapa 5 · Figma 670:16320 listă, 707:22045 tabel la 1280, 670:16887 căutare,
 * 673:18393 tabletă, 673:17004 / 673:17508 telefon, 674:18069 / 674:18581 Noapte, 674:17282 stări,
 * 719:75304 filtrat pe sediu): every file of the client that is not a photo, each once whatever
 * it is attached to, grouped by year. Search and Tip / An / Sediu / Asociere work over the whole
 * collection; the total stays apart from the results. The file opens in the one document viewer
 * of the client page (`document=` in the address); upload, metadata and associations follow the
 * permissions. Search, filters and the open document live in the address and this client's memory.
 */
export function ClientDocumentsSection({ customerId, search = "" }: { customerId: string; search?: string }) {
  const dossier = useCustomerDossier(customerId);
  const mode = useBandMode();
  const list = useClientListContext(customerId, "documente", search);
  const { context, text, setText, apply } = list;
  const searchId = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linking, setLinking] = useState<DossierDocument | null>(null);
  const [editing, setEditing] = useState<DossierDocument | null>(null);
  const notice = useDocumentNotice();
  const rememberMenu = useMenuReturn(Boolean(linking || editing), ".ddocs2__menu", ".ddocs2__more");
  function linkFromMenu(document: DossierDocument) {
    rememberMenu();
    setLinking(document);
  }
  function editFromMenu(document: DossierDocument) {
    rememberMenu();
    setEditing(document);
  }
  const data = dossier.data;
  useEntryAction(search, "incarca", data?.permissions.uploadDocuments === true, () => setUploading(true));
  const previewHref = useCallback((documentId: string | null) => clientListHref(customerId, "documente", context, documentId ? { [DOCUMENT_PARAM]: documentId } : {}), [customerId, context]);
  const preview = useDocumentPreview(search, previewHref);

  const view = data ? buildDocumentsView(data, context) : null;
  const dimensions = [context.kind, context.year, context.site, context.linked].filter(Boolean).length;
  const canUpload = data?.permissions.uploadDocuments === true;
  const canEdit = data?.permissions.editDocuments === true;
  const clearSearch = () => {
    setText("");
    apply({ q: "" });
  };
  const clearFilters = () => apply({ kind: "", year: "", site: "", linked: "" });
  const clearAll = () => {
    setText("");
    apply({ q: "", kind: "", year: "", site: "", linked: "" });
  };
  // The button that cleared disappears with the result line: the search field takes the focus.
  const focusSearch = () => document.getElementById(searchId)?.focus();

  // Opened from Sedii (712:22814 / 719:75304 / 712:23047): the way back with the result line, above the title.
  const fromSites = fromSitesOrigin(customerId);
  // R1 · Bara de rezultat (845:31815): always there; filtered, every filter is a chip of its own.
  const chips: ResultChip[] = view
    ? [
        filterChip("kind", "Tip", view.kinds, context.kind, () => apply({ kind: "" })),
        filterChip("year", "An", view.years, context.year, () => apply({ year: "" })),
        filterChip("site", "Sediu", view.sites, context.site, () => apply({ site: "" })),
        filterChip("linked", "Asociere", view.links, context.linked, () => apply({ linked: "" })),
      ].filter((chip): chip is ResultChip => chip !== null)
    : [];
  const resultLine = view && view.total > 0 ? (
    <ResultBar
      shown={view.shown.length}
      total={view.total}
      unit={["document", "documente"]}
      query={context.q}
      onClearQuery={clearSearch}
      chips={chips}
      onShowAll={clearAll}
      sort={mode === "phone" ? null : "Cele mai noi întâi"}
      afterChange={focusSearch}
    />
  ) : null;

  return (
    <section className="ddocs2" data-mode={mode} data-dossier-section="documente" aria-labelledby="ddocs-title">
      {fromSites ? <SitesOriginBand back={fromSites} siteName={context.site ? (data?.sites.find((site) => site.siteId === context.site)?.name ?? null) : null}>{view && view.filtered ? resultLine : null}</SitesOriginBand> : null}
      <header className="ddocs2__head">
        <div className="ddocs2__heading">
          <h2 id="ddocs-title" className="ddocs2__title">Documente</h2>
          {view ? (
            <p className="ddocs2__totals">{mode === "phone" ? String(view.total) : `${countLabel(view.total, "document", "documente")}${view.photoCount && mode === "desktop" ? ` · fotografiile sunt în Fotografii (${view.photoCount})` : ""}`}</p>
          ) : null}
        </div>
        {canUpload ? (
          <button type="button" className="ddocs2__upload" onClick={() => setUploading(true)}>
            <DossierIcon name="plus" size={15} />
            {mode === "phone" ? "Încarcă" : "Încarcă document"}
          </button>
        ) : null}
      </header>

      <div className="ddocs2__tools">
        <div className="ddocs2__search" role="search">
          <label className="ddocs2__field" htmlFor={searchId} data-filled={text ? true : undefined}>
            <DossierIcon name="search" size={15} />
            <span className="u-visually-hidden">Caută documente</span>
            <input
              id={searchId}
              type="search"
              value={text}
              autoComplete="off"
              placeholder={mode === "desktop" ? "Caută: număr, denumire, referință, fișier…" : mode === "tablet" ? "Caută: număr, denumire, referință…" : "Număr, denumire…"}
              onChange={(event) => setText(event.target.value)}
            />
            {text ? (
              <button type="button" className="ddocs2__clear" onClick={() => { clearSearch(); document.getElementById(searchId)?.focus(); }}>
                <DossierIcon name="close" size={12} />
                Șterge
              </button>
            ) : null}
          </label>
        </div>
        {view && mode === "desktop" ? (
          <span className="ddocs2__menus">
            <FilterMenu title="Tip" allLabel="Toate tipurile" options={view.kinds} value={context.kind} onChange={(value) => apply({ kind: value })} />
            {view.years.length ? <FilterMenu title="An" allLabel="Toți anii" options={view.years} value={context.year} onChange={(value) => apply({ year: value })} /> : null}
            {view.sites.length ? <FilterMenu title="Sediu" allLabel="Toate sediile" options={view.sites} value={context.site} onChange={(value) => apply({ site: value })} /> : null}
            <FilterMenu title="Asociere" allLabel="Toate asocierile" options={view.links} value={context.linked} onChange={(value) => apply({ linked: value })} />
          </span>
        ) : view ? (
          <button type="button" className="ddocs2__sheet-button" aria-haspopup="dialog" data-active={dimensions ? true : undefined} onClick={() => setSheetOpen(true)}>
            {dimensions ? `Filtre · ${dimensions}` : "Filtre"}
          </button>
        ) : null}
      </div>

      {!fromSites || !view?.filtered ? resultLine : null}

      {notice ? (
        <p className="ddocs2__notice" role="status">
          <DossierIcon name="check" size={14} />
          {notice.text}
        </p>
      ) : null}

      {dossier.status === "error" && !data ? (
        <div className="ddocs2__state" role="alert">
          <p className="ddocs2__state-title">Documentele nu au putut fi citite</p>
          <p>Reîncearcă peste câteva momente. Căutarea și filtrele rămân.</p>
          <button type="button" className="ddocs2__button" onClick={() => invalidateResources(resourceKeys.customerDossier(customerId))}>Încearcă din nou</button>
        </div>
      ) : !data || !view ? (
        <div className="ddocs2__state" role="status" aria-busy="true">
          <p>Se citesc documentele clientului…</p>
          <span className="ddocs2__skeleton" aria-hidden="true" />
          <span className="ddocs2__skeleton" aria-hidden="true" />
          <span className="ddocs2__skeleton" aria-hidden="true" />
        </div>
      ) : view.total === 0 ? (
        <div className="ddocs2__state">
          <p className="ddocs2__state-title">Nu există documente</p>
          <p>Contractele, facturile, procesele-verbale și celelalte documente încărcate pentru acest client apar aici.</p>
          {canUpload ? <button type="button" className="ddocs2__upload" onClick={() => setUploading(true)}><DossierIcon name="plus" size={15} />Încarcă document</button> : null}
        </div>
      ) : view.shown.length === 0 ? (
        <div className="ddocs2__state">
          <p className="ddocs2__state-title">Niciun document pentru căutarea și filtrele alese</p>
          <p>Schimbă textul sau elimină un filtru din bara de mai sus; „Arată toate” readuce lista completă.</p>
        </div>
      ) : mode === "desktop" ? (
        <DocumentsTable view={view} canEdit={canEdit} savedId={notice?.documentId ?? null} onOpen={preview.open} onLink={linkFromMenu} onEdit={editFromMenu} />
      ) : (
        <DocumentCards view={view} mode={mode} canEdit={canEdit} savedId={notice?.documentId ?? null} onOpen={preview.open} onLink={linkFromMenu} onEdit={editFromMenu} />
      )}
      {data ? <p className="ddocs2__note">Un document încărcat nu este automat semnat, aprobat sau plătit; tipul și datele sunt cele declarate la încărcare.</p> : null}

      {sheetOpen && view ? (
        <FilterSheet title="Filtre documente" unit={["document", "documente"]} total={view.shown.length} onClose={() => setSheetOpen(false)} onClear={clearFilters}>
          <div className="dfilters" data-sheet>
            <RailGroup title="Tip">
              {railOption(!context.kind, () => apply({ kind: "" }), "Toate tipurile", null, "all-kind", true)}
              {view.kinds.map((choice) => railOption(context.kind === choice.value, () => apply({ kind: context.kind === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
            </RailGroup>
            {view.years.length ? (
              <RailGroup title="An">
                {railOption(!context.year, () => apply({ year: "" }), "Toți anii", null, "all-year", true)}
                {view.years.map((choice) => railOption(context.year === choice.value, () => apply({ year: context.year === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
              </RailGroup>
            ) : null}
            {view.sites.length ? (
              <RailGroup title="Sediu">
                {railOption(!context.site, () => apply({ site: "" }), "Toate sediile", null, "all-site", true)}
                {view.sites.map((choice) => railOption(context.site === choice.value, () => apply({ site: context.site === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
              </RailGroup>
            ) : null}
            <RailGroup title="Asociere">
              {railOption(!context.linked, () => apply({ linked: "" }), "Toate asocierile", null, "all-link", true)}
              {view.links.map((choice) => railOption(context.linked === choice.value, () => apply({ linked: context.linked === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
            </RailGroup>
          </div>
        </FilterSheet>
      ) : null}

      {uploading && data ? (
        <DossierFormDialog framed title="Încarcă document" subject="Fișierul ales și datele introduse" dirty={uploadDirty} busy={uploadBusy} onClose={() => { setUploading(false); setUploadDirty(false); }}>
          <DocumentUploadForm
            customerId={customerId}
            dossier={data}
            defaultKind=""
            onDirtyChange={setUploadDirty}
            onBusyChange={setUploadBusy}
            onDone={() => { setUploading(false); setUploadDirty(false); }}
            onCancel={() => { setUploading(false); setUploadDirty(false); }}
          />
        </DossierFormDialog>
      ) : null}
      {preview.openId ? <DocumentViewer customerId={customerId} dossier={data ?? null} documentId={preview.openId} onClose={preview.close} /> : null}
      {linking && data ? <LinkDocumentDialog customerId={customerId} dossier={data} document={data.documents.find((item) => item.documentId === linking.documentId) ?? linking} onClose={() => setLinking(null)} /> : null}
      {editing && data ? <EditDocumentDialog customerId={customerId} dossier={data} document={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

type RowProps = { canEdit: boolean; savedId: string | null; onOpen: (documentId: string) => void; onLink: (document: DossierDocument) => void; onEdit: (document: DossierDocument) => void };

/** Desktop (670:16320): one table, a year per group; at 1280 the narrow columns fold (707:22045). */
function DocumentsTable({ view, canEdit, savedId, onOpen, onLink, onEdit }: RowProps & { view: DocumentsView }) {
  return (
    <table className="ddocs2__table">
      <caption className="u-visually-hidden">Documentele clientului, pe ani</caption>
      <thead>
        <tr>
          <th scope="col" className="ddocs2__col-kind">Tip</th>
          <th scope="col">Document · număr</th>
          <th scope="col">Data doc.</th>
          <th scope="col" className="ddocs2__col-site">Sediu</th>
          <th scope="col">
            <span className="ddocs2__wide">Asociat cu</span>
            <span className="ddocs2__narrow">Context</span>
          </th>
          <th scope="col" className="ddocs2__col-actions">Acțiuni</th>
        </tr>
      </thead>
      {view.groups.map((group) => (
        <tbody key={group.year}>
          <tr className="ddocs2__year">
            <th scope="colgroup" colSpan={6}>
              {`${group.year} `}
              <span>{countLabel(group.documents.length, "document", "documente")}</span>
              {group.documents.some((item) => item.undated) ? <small>Documentele fără dată stau la anul în care au fost încărcate.</small> : null}
            </th>
          </tr>
          {group.documents.map((item) => (
            <DocumentRow key={item.document.documentId} item={item} canEdit={canEdit} savedId={savedId} onOpen={onOpen} onLink={onLink} onEdit={onEdit} />
          ))}
        </tbody>
      ))}
    </table>
  );
}

function linksText(item: DocumentItem): string[] {
  return item.document.links.map((link) => `${link.kindLabel} · ${link.label}`);
}

function DocumentRow({ item, canEdit, savedId, onOpen, onLink, onEdit }: RowProps & { item: DocumentItem }) {
  const { document } = item;
  const links = linksText(item);
  const format = fileFormat(document);
  return (
    <tr className="ddocs2__row" data-saved={savedId === document.documentId || undefined}>
      <td className="ddocs2__col-kind ddocs2__kind">{kindWord(document)}</td>
      <td>
        <p className="ddocs2__name">{document.title}</p>
        <p className="ddocs2__number">
          <span className="ddocs2__narrow">{[kindWord(document), document.documentNumber].filter(Boolean).join(" · ")}</span>
          {/* R1 (853:32673): the file's format and size under the number, so the actions fit beside. */}
          <span className="ddocs2__wide">{[document.documentNumber ?? "fără număr", format, formatBytes(document.sizeBytes)].filter(Boolean).join(" · ")}</span>
        </p>
      </td>
      <td className="ddocs2__date">
        {documentDateLabel(document)}
        {item.undated ? <small>{`încărcat ${formatDay(document.uploadedAt) ?? ""}`}</small> : null}
      </td>
      <td className="ddocs2__col-site ddocs2__site">
        {item.sites.length ? (
          item.sites.map((site) => (
            <span key={site.siteId}>
              <DossierIcon name="site" size={12} />
              {site.name}
            </span>
          ))
        ) : (
          <span className="ddocs2__muted">—</span>
        )}
      </td>
      <td className="ddocs2__links">
        <span className="ddocs2__wide">{links.length ? links.map((line) => <span key={line}>{line}</span>) : <span className="ddocs2__muted">Doar în dosarul clientului</span>}</span>
        <span className="ddocs2__narrow">
          {links[0] ?? "Doar în dosarul clientului"}
          {links.length > 1 ? <small>{`+${links.length - 1}`}</small> : null}
        </span>
      </td>
      <td className="ddocs2__actions">
        <DocumentActions document={document} canEdit={canEdit} onOpen={onOpen} onLink={onLink} onEdit={onEdit} />
      </td>
    </tr>
  );
}

/** Tablet and phone (673:18393 / 673:17004): one card per document, the same order of facts. */
function DocumentCards({ view, mode, canEdit, savedId, onOpen, onLink, onEdit }: RowProps & { view: DocumentsView; mode: BandMode }) {
  return (
    <div className="ddocs2__years">
      {view.groups.map((group) => (
        <section key={group.year} className="ddocs2__group" aria-labelledby={`ddocs-an-${group.year}`}>
          <h3 id={`ddocs-an-${group.year}`} className="ddocs2__group-title">
            {`${group.year} `}
            <span>{countLabel(group.documents.length, "document", "documente")}</span>
          </h3>
          {group.documents.some((item) => item.undated) ? <p className="ddocs2__group-note">Documentele fără dată stau la anul în care au fost încărcate.</p> : null}
          <ol className="ddocs2__cards">
            {group.documents.map((item) => {
              const { document } = item;
              const links = linksText(item);
              const context = [...item.sites.map((site) => site.name), links[0]].filter(Boolean).join(" · ");
              return (
                <li key={document.documentId} className="ddocs2__card" data-saved={savedId === document.documentId || undefined}>
                  <p className="ddocs2__card-top">
                    <span className="ddocs2__kind">{[kindWord(document), document.documentNumber ?? "fără număr"].join(" · ")}</span>
                    <span className="ddocs2__date">{documentDateLabel(document)}</span>
                  </p>
                  <p className="ddocs2__name">{document.title}</p>
                  <p className="ddocs2__card-context">
                    {item.sites.length ? <DossierIcon name="site" size={12} /> : null}
                    {`${context || "Doar în dosarul clientului"}${links.length > 1 ? ` · +${links.length - 1}` : ""}`}
                  </p>
                  {item.undated ? <p className="ddocs2__card-upload">{`Fără dată · încărcat ${formatDay(document.uploadedAt) ?? ""}`}</p> : null}
                  <div className="ddocs2__card-actions">
                    <DocumentActions document={document} canEdit={canEdit} onOpen={onOpen} onLink={onLink} onEdit={onEdit} file={mode === "tablet" ? [fileFormat(document), formatBytes(document.sizeBytes)].filter(Boolean).join(" · ") : null} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * R1 · Acțiuni document (880:35989): Previzualizează (or "Deschide" when the format has no
 * preview) as a button, Descarcă with its icon, and — only with the permission to edit — "⋯" with
 * Asociază and Modifică datele. Without the permission "⋯" is absent, never shown disabled.
 */
function DocumentActions({ document, canEdit, onOpen, onLink, onEdit, file = null }: { document: DossierDocument; canEdit: boolean; onOpen: (documentId: string) => void; onLink: (document: DossierDocument) => void; onEdit: (document: DossierDocument) => void; file?: string | null }) {
  return (
    <>
      <button type="button" className="ddocs2__action" data-kind="open" data-document-opener={document.documentId} onClick={() => onOpen(document.documentId)} aria-label={`${document.preview === "NONE" ? "Deschide" : "Previzualizează"} ${document.title}`}>
        {document.preview === "NONE" ? "Deschide" : "Previzualizează"}
      </button>
      <a className="ddocs2__action" data-kind="download" href={document.downloadHref} download aria-label={`Descarcă ${document.title}`}>
        <DossierIcon name="download" size={14} />
        Descarcă
      </a>
      {file ? <span className="ddocs2__file">{file}</span> : null}
      {canEdit ? <RowMenu document={document} onLink={onLink} onEdit={onEdit} /> : null}
    </>
  );
}

function RowMenu({ document, onLink, onEdit }: { document: DossierDocument; onLink: (document: DossierDocument) => void; onEdit: (document: DossierDocument) => void }) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // In the viewport: near the bottom edge the menu opens upward (881:36365), measured before paint.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!open || !panel || !button) return;
    const box = button.getBoundingClientRect();
    const room = panel.offsetHeight + 12;
    panel.toggleAttribute("data-up", window.innerHeight - box.bottom < room && box.top > room);
  }, [open, buttonRef]);
  // Opened, the focus is on the first item; arrows move between items, Escape returns to "⋯".
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [open]);
  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const at = items.indexOf(globalThis.document.activeElement as HTMLElement);
    const next = items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
    event.preventDefault();
    next?.focus();
  };
  return (
    <div className="ddocs2__menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="ddocs2__more" aria-label={`Alte acțiuni pentru ${document.title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div id={id} ref={panelRef} className="ddocs2__menu-panel" role="group" aria-label={`Alte acțiuni pentru ${document.title}`} onKeyDown={onPanelKey}>
          <button type="button" onClick={() => { setOpen(false); onLink(document); }}>
            Asociază
            <small aria-hidden="true">cu un sediu, o cerere sau o lucrare</small>
          </button>
          <button type="button" onClick={() => { setOpen(false); onEdit(document); }}>
            Modifică datele
            <small aria-hidden="true">tip, număr, dată, titlu, descriere</small>
          </button>
        </div>
      ) : null}
    </div>
  );
}

