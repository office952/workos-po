import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DossierDocument } from "../../../adapters/customerDossierAdapter";
import { useResource } from "../../../data/useResource";
import { usePreviewHistory } from "../../../routing/usePreviewHistory";
import { EditDocumentDialog } from "../documents/DocumentEditDialog";
import { LinkDocumentDialog } from "../documents/DocumentLinksDialog";
import { useDocumentNotice } from "../documents/documentNotice";
import { useBandMode, useDisclosure, type BandMode } from "../dossier/bandModel";
import { DocumentUploadForm } from "../dossier/DocumentUploadForm";
import { formatDay, refreshCustomerDossier, useCustomerDossier } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { RailGroup } from "../dossier/dossierRail";
import { DossierFormDialog } from "../dossier/dossierShared";
import { FilterMenu } from "../dossier/FilterMenu";
import { FilterSheet } from "../dossier/FilterSheet";
import { useEntryAction } from "../dossier/header/entryAction";
import { allEntriesKey, loadAllEntries } from "../dossier/historyEntries";
import { countLabel } from "../dossier/historyModel";
import { PhotoFrame, ProvenanceTag } from "../dossier/historyParts";
import { clientListHref, useClientListContext } from "../dossier/listContext";
import { useMenuReturn } from "../dossier/menuReturn";
import { PhotoViewer } from "../dossier/PhotoViewer";
import { railOption } from "../dossier/railOption";
import { ResultBar } from "../dossier/ResultBar";
import { filterChip, type ResultChip } from "../dossier/resultBarModel";
import { fromSitesOrigin } from "../sites/originFromSites";
import { SitesOriginBand } from "../sites/SitesOrigin";
import { RepresentativePhotoDialog } from "./RepresentativePhotoDialog";
import { representedWorks } from "./representativeModel";
import { buildPhotosView, PHOTO_GROUP_PARAM, PHOTO_KEY_SEPARATOR, PHOTO_PARAM, photoKey, readPhotoKey, type PhotoGroup, type PhotosView, type PhotoTile } from "./photosModel";
import "../../../styles/surfaces/client-photos.css";

/**
 * Fotografii (N-020 etapa 6 · Figma 675:17860 / 675:18371 galerie, 675:18640 filtrat, 707:21500 la
 * 1280, 707:21048 la 768, 677:18467 / 677:18746 telefon, 677:18943 la 360, 679:19396 / 679:19805
 * Noapte, 679:18951 stări, 679:18994 colecție mare, 712:23047 filtrat pe sediu). The client's
 * photos in the groups the server put them in, groups in the server's order (newest first, never
 * reordered to fill the grid), inside a group before → simulation → after. Search and An / Sediu /
 * Etapă / Asociere work over the whole gallery; every number counts distinct photos and the total
 * stays apart from the results. A photo opens in the one photo viewer of the page
 * (`fotografie=` and `grup=` in the address) over the photos of its group under the filters;
 * closing returns to the tile of the photo shown last. Upload, metadata and associations follow
 * the permissions.
 */
export function ClientPhotosSection({ customerId, search = "" }: { customerId: string; search?: string }) {
  const dossier = useCustomerDossier(customerId);
  const history = useResource(allEntriesKey(customerId, {}), () => loadAllEntries(customerId, {}));
  const mode = useBandMode();
  const list = useClientListContext(customerId, "fotografii", search);
  const { context, text, setText, apply } = list;
  const searchId = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linking, setLinking] = useState<DossierDocument | null>(null);
  const [editing, setEditing] = useState<DossierDocument | null>(null);
  const [representing, setRepresenting] = useState<DossierDocument | null>(null);
  const notice = useDocumentNotice();
  const rememberMenu = useMenuReturn(Boolean(linking || editing || representing), ".dpgal__menu", ".dpgal__more");
  function linkFromMenu(photo: DossierDocument) {
    rememberMenu();
    setLinking(photo);
  }
  function editFromMenu(photo: DossierDocument) {
    rememberMenu();
    setEditing(photo);
  }
  function representFromMenu(photo: DossierDocument) {
    rememberMenu();
    setRepresenting(photo);
  }
  const data = dossier.data;
  // N-021 · the works a photo represents now (a valid manual choice), for the discreet mark on its tile.
  const represented = (photo: DossierDocument) => (data ? representedWorks(photo, data).map((target) => target.label) : []);
  const entries = history.data?.entries ?? null;
  useEntryAction(search, "incarca", data?.permissions.uploadDocuments === true, () => setUploading(true));

  const opened = readPhotoKey(search);
  const href = useCallback(
    (key: string | null) => {
      if (!key) return clientListHref(customerId, "fotografii", context);
      const [group, photo] = key.split(PHOTO_KEY_SEPARATOR);
      return clientListHref(customerId, "fotografii", context, { [PHOTO_PARAM]: photo ?? "", [PHOTO_GROUP_PARAM]: group ?? "" });
    },
    [customerId, context],
  );
  const openedKey = opened ? photoKey(opened.group ?? "", opened.photo) : null;
  const preview = usePreviewHistory(href, openedKey);
  // Closing gives the focus back to the tile of the photo shown last (data-photo-tile).
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (openedKey) {
      lastShown.current = openedKey;
      return;
    }
    const previous = lastShown.current;
    lastShown.current = null;
    if (previous) document.querySelector<HTMLElement>(`[data-photo-tile="${CSS.escape(previous)}"] .dphoto`)?.focus({ preventScroll: true });
  }, [openedKey]);

  const view = data && entries ? buildPhotosView(customerId, data, entries, context) : null;
  const dimensions = [context.year, context.site, context.stage, context.linked].filter(Boolean).length;
  const canUpload = data?.permissions.uploadDocuments === true;
  const canEdit = data?.permissions.editDocuments === true;
  const clearSearch = () => {
    setText("");
    apply({ q: "" });
  };
  const clearFilters = () => apply({ year: "", site: "", stage: "", linked: "" });
  const clearAll = () => {
    setText("");
    apply({ q: "", year: "", site: "", stage: "", linked: "" });
  };
  // The button that cleared disappears with the result line: the search field takes the focus.
  const focusSearch = () => document.getElementById(searchId)?.focus();

  // The set of the open photo: its group, under the filters (else the whole group, after an edit).
  const openGroup = view && opened ? (view.groups.find((group) => group.key === opened.group && group.photos.some((tile) => tile.photo.documentId === opened.photo)) ?? view.groups.find((group) => group.photos.some((tile) => tile.photo.documentId === opened.photo)) ?? null) : null;
  const openSet = openGroup ? (openGroup.shown.some((tile) => tile.photo.documentId === opened?.photo) ? openGroup.shown : openGroup.photos) : [];
  // The address follows the photo shown, so a refresh, Back and the focus on close find it.
  const onShow = (documentId: string) => {
    if (!openGroup) return;
    const key = photoKey(openGroup.key, documentId);
    if (key !== openedKey) preview.open(key);
  };

  const loading = (!data && dossier.status !== "error") || (!entries && history.status !== "error");
  const failed = !view && (dossier.status === "error" || history.status === "error");
  const totals = view
    ? mode === "phone"
      ? `${view.total} · ${countLabel(view.groups.length, "grup", "grupuri")}`
      : `${countLabel(view.total, "fotografie", "fotografii")} · ${countLabel(view.groups.length, "grup", "grupuri")}${mode === "desktop" && view.documentCount ? ` · documentele sunt în Documente (${view.documentCount})` : ""}`
    : null;

  // Opened from Sedii (712:22814 / 719:75304 / 712:23047): the way back with the result line, above the title.
  const fromSites = fromSitesOrigin(customerId);
  // R1 · Bara de rezultat (845:31815): always there; filtered, every filter is a chip of its own.
  const chips: ResultChip[] = view
    ? [
        filterChip("year", "An", view.years, context.year, () => apply({ year: "" })),
        filterChip("site", "Sediu", view.sites, context.site, () => apply({ site: "" })),
        filterChip("stage", "Etapă", view.stages, context.stage, () => apply({ stage: "" })),
        filterChip("linked", "Asociere", view.links, context.linked, () => apply({ linked: "" })),
      ].filter((chip): chip is ResultChip => chip !== null)
    : [];
  const resultLine = view && view.total > 0 ? (
    <ResultBar
      shown={view.shownCount}
      total={view.total}
      unit={["fotografie", "fotografii"]}
      detail={countLabel(view.filtered ? view.shownGroups.length : view.groups.length, "grup", "grupuri")}
      query={context.q}
      onClearQuery={clearSearch}
      chips={chips}
      onShowAll={clearAll}
      sort={mode === "phone" ? null : "Cele mai noi întâi"}
      afterChange={focusSearch}
    />
  ) : null;

  return (
    <section className="dpgal" data-mode={mode} data-dossier-section="fotografii" aria-labelledby="dpgal-title">
      {fromSites ? <SitesOriginBand back={fromSites} siteName={context.site ? (data?.sites.find((site) => site.siteId === context.site)?.name ?? null) : null}>{view && view.filtered ? resultLine : null}</SitesOriginBand> : null}
      <header className="dpgal__head">
        <div className="dpgal__heading">
          <h2 id="dpgal-title" className="dpgal__title">Fotografii</h2>
          {totals ? <p className="dpgal__totals">{totals}</p> : null}
        </div>
        {canUpload ? (
          <button type="button" className="dpgal__upload" onClick={() => setUploading(true)}>
            <DossierIcon name="plus" size={15} />
            {mode === "phone" ? "Încarcă" : "Încarcă fotografie"}
          </button>
        ) : null}
      </header>

      <div className="dpgal__tools">
        <div className="dpgal__search" role="search">
          <label className="dpgal__field" htmlFor={searchId}>
            <DossierIcon name="search" size={15} />
            <span className="u-visually-hidden">Caută fotografii</span>
            <input id={searchId} type="search" value={text} autoComplete="off" placeholder={mode === "phone" ? "Lucrare, sediu…" : "Caută: lucrare, sediu, titlul fotografiei…"} onChange={(event) => setText(event.target.value)} />
            {text ? (
              <button type="button" className="dpgal__clear" onClick={() => { clearSearch(); document.getElementById(searchId)?.focus(); }}>
                <DossierIcon name="close" size={12} />
                Șterge
              </button>
            ) : null}
          </label>
        </div>
        {view && mode === "desktop" ? (
          <span className="dpgal__menus">
            {view.years.length ? <FilterMenu title="An" allLabel="Toți anii" options={view.years} value={context.year} onChange={(value) => apply({ year: value })} /> : null}
            {view.sites.length ? <FilterMenu title="Sediu" allLabel="Toate sediile" options={view.sites} value={context.site} onChange={(value) => apply({ site: value })} /> : null}
            <FilterMenu title="Etapă" allLabel="Toate etapele" options={view.stages} value={context.stage} onChange={(value) => apply({ stage: value })} />
            <FilterMenu title="Asociere" allLabel="Toate asocierile" options={view.links} value={context.linked} onChange={(value) => apply({ linked: value })} />
          </span>
        ) : view ? (
          <button type="button" className="dpgal__sheet-button" aria-haspopup="dialog" data-active={dimensions ? true : undefined} onClick={() => setSheetOpen(true)}>
            {dimensions ? `Filtre · ${dimensions}` : "Filtre"}
          </button>
        ) : null}
      </div>

      {!fromSites || !view?.filtered ? resultLine : null}

      {notice ? (
        <p className="dpgal__notice" role="status">
          <DossierIcon name="check" size={14} />
          {notice.text.replace("Datele documentului", "Datele fotografiei")}
        </p>
      ) : null}

      {failed ? (
        <div className="dpgal__state" role="alert">
          <p className="dpgal__state-title">Fotografiile nu au putut fi citite</p>
          <p>Filtrele rămân. Încearcă din nou.</p>
          <button type="button" className="dpgal__button" onClick={() => refreshCustomerDossier(customerId)}>Încearcă din nou</button>
        </div>
      ) : loading || !view ? (
        <div className="dpgal__state" role="status" aria-busy="true">
          <p>Se citesc fotografiile…</p>
          <span className="dpgal__skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      ) : view.total === 0 ? (
        <div className="dpgal__state">
          <p className="dpgal__state-title">Nu există fotografii</p>
          <p>Fotografiile încărcate pentru acest client apar aici, grupate pe lucrări și proiecte.</p>
          {canUpload ? <button type="button" className="dpgal__upload" onClick={() => setUploading(true)}><DossierIcon name="plus" size={15} />Încarcă fotografie</button> : null}
        </div>
      ) : view.shownGroups.length === 0 ? (
        <div className="dpgal__state">
          <p className="dpgal__state-title">Nicio fotografie pentru căutarea și filtrele alese</p>
          <p>Schimbă textul sau elimină un filtru din bara de mai sus; „Arată toate” readuce galeria completă.</p>
        </div>
      ) : (
        <PhotoYears groups={view.shownGroups} mode={mode} canEdit={canEdit} savedId={notice?.documentId ?? null} onOpen={(group, tile) => preview.open(photoKey(group.key, tile.photo.documentId))} onLink={linkFromMenu} onEdit={editFromMenu} onRepresent={representFromMenu} represented={represented} />
      )}
      {view && view.withoutPhotos.length ? (
        <p className="dpgal__note">{`Nu apare aici: ${view.withoutPhotos.join(", ")} — ${view.withoutPhotos.length === 1 ? "nu are fotografii încărcate, ceea ce nu înseamnă că nu a fost executată" : "nu au fotografii încărcate, ceea ce nu înseamnă că nu au fost executate"}.`}</p>
      ) : null}

      {sheetOpen && view ? (
        <FilterSheet title="Filtre fotografii" unit={["fotografie", "fotografii"]} total={view.shownCount} onClose={() => setSheetOpen(false)} onClear={clearFilters}>
          <PhotoFilterGroups view={view} context={context} apply={apply} />
        </FilterSheet>
      ) : null}

      {uploading && data ? (
        <DossierFormDialog framed title="Încarcă fotografie" subtitle="Fișierul și datele lui" subject="Fișierul ales și datele introduse" dirty={uploadDirty} busy={uploadBusy} onClose={() => { setUploading(false); setUploadDirty(false); }}>
          <DocumentUploadForm
            customerId={customerId}
            dossier={data}
            defaultKind="PHOTO"
            onDirtyChange={setUploadDirty}
            onBusyChange={setUploadBusy}
            onDone={() => { setUploading(false); setUploadDirty(false); }}
            onCancel={() => { setUploading(false); setUploadDirty(false); }}
          />
        </DossierFormDialog>
      ) : null}
      {openGroup && opened ? (
        <PhotoViewer key={openGroup.key} photos={openSet.map((tile) => tile.photo)} startId={opened.photo} context={openGroup.entry.title} origin={openGroup.open} onShow={onShow} onClose={preview.close} />
      ) : null}
      {linking && data ? <LinkDocumentDialog customerId={customerId} dossier={data} document={data.documents.find((item) => item.documentId === linking.documentId) ?? linking} onClose={() => setLinking(null)} /> : null}
      {editing && data ? <EditDocumentDialog customerId={customerId} dossier={data} document={editing} onClose={() => setEditing(null)} /> : null}
      {representing && data ? (
        <RepresentativePhotoDialog
          customerId={customerId}
          dossier={data}
          photo={data.documents.find((item) => item.documentId === representing.documentId) ?? representing}
          onClose={() => setRepresenting(null)}
          onLink={(photo) => { setRepresenting(null); setLinking(photo); }}
        />
      ) : null}
    </section>
  );
}

function PhotoFilterGroups({ view, context, apply }: { view: PhotosView; context: { year: string; site: string; stage: string; linked: string }; apply: (next: Partial<{ year: string; site: string; stage: string; linked: string }>) => void }) {
  return (
    <div className="dfilters" data-sheet>
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
      <RailGroup title="Etapă">
        {railOption(!context.stage, () => apply({ stage: "" }), "Toate etapele", null, "all-stage", true)}
        {view.stages.map((choice) => railOption(context.stage === choice.value, () => apply({ stage: context.stage === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
      </RailGroup>
      <RailGroup title="Asociere">
        {railOption(!context.linked, () => apply({ linked: "" }), "Toate asocierile", null, "all-link", true)}
        {view.links.map((choice) => railOption(context.linked === choice.value, () => apply({ linked: context.linked === choice.value ? "" : choice.value }), choice.label, choice.count, choice.value, true))}
      </RailGroup>
    </div>
  );
}

type TileActions = {
  canEdit: boolean;
  savedId: string | null;
  onLink: (document: DossierDocument) => void;
  onEdit: (document: DossierDocument) => void;
  onRepresent: (document: DossierDocument) => void;
  /** N-021 · the works this photo represents now (labels), empty when none. */
  represented: (document: DossierDocument) => string[];
};

/** The groups of one year, in the server's order, and the photos they show (each counted once). */
function yearBlocks(groups: readonly PhotoGroup[]): Array<{ year: number; groups: PhotoGroup[]; photos: number }> {
  const blocks: Array<{ year: number; groups: PhotoGroup[]; ids: Set<string> }> = [];
  for (const group of groups) {
    const year = group.entry.year;
    let block = blocks.find((item) => item.year === year);
    if (!block) {
      block = { year, groups: [], ids: new Set() };
      blocks.push(block);
    }
    block.groups.push(group);
    for (const tile of group.shown) block.ids.add(tile.photo.documentId);
  }
  return blocks.map((block) => ({ year: block.year, groups: block.groups, photos: block.ids.size }));
}

/**
 * R1 · Fotografii, grila adaptabilă (897:36578): "Ani în dosar" with every year shown and its
 * photos; each year a block with its heading; inside, the project cards in the server's order
 * (never reordered to fill a gap), each as wide as its photos, wrapping to the next row. Small
 * years sit side by side; on the phone everything stacks. A year link moves to that year and its
 * heading takes the focus.
 */
function PhotoYears({ groups, mode, onOpen, ...actions }: TileActions & { groups: readonly PhotoGroup[]; mode: BandMode; onOpen: (group: PhotoGroup, tile: PhotoTile) => void }) {
  const blocks = yearBlocks(groups);
  const anchor = (year: number) => `dpgal-an-${year}`;
  const jump = (year: number) => {
    const target = document.getElementById(anchor(year));
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.focus({ preventScroll: true });
  };
  return (
    <>
      {blocks.length > 1 ? (
        <nav className="dpgal__years" aria-label="Ani în dosar">
          <span className="dpgal__years-label" aria-hidden="true">Ani în dosar:</span>
          {blocks.map((block) => (
            <button key={block.year} type="button" className="dpgal__year-link" onClick={() => jump(block.year)} aria-label={`Salt la ${block.year} · ${countLabel(block.photos, "fotografie", "fotografii")}`}>
              <span className="dpgal__year-number">{block.year}</span>
              <span className="dpgal__year-count">{countLabel(block.photos, "fotografie", "fotografii")}</span>
            </button>
          ))}
        </nav>
      ) : null}
      <div className="dpgal__blocks">
        {blocks.map((block) => (
          <section key={block.year} className="dpgal__year" aria-labelledby={anchor(block.year)}>
            <h3 id={anchor(block.year)} className="dpgal__year-title" tabIndex={-1}>
              {`${block.year} `}
              <span>{`${countLabel(block.groups.length, "grup", "grupuri")} · ${countLabel(block.photos, "fotografie", "fotografii")}`}</span>
            </h3>
            <ol className="dpgal__groups">
              {block.groups.map((group) => (
                <PhotoGroupCard key={group.key} group={group} mode={mode} onOpen={(tile) => onOpen(group, tile)} {...actions} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}

/** One group (675:18371): what it is, where it leads, its photos in the order of the work. */
function PhotoGroupCard({ group, mode, onOpen, ...actions }: TileActions & { group: PhotoGroup; mode: BandMode; onOpen: (tile: PhotoTile) => void }) {
  const { entry } = group;
  const titleId = useId();
  const open = group.open ? (
    <a className="dpgal__open" href={group.open.href}>
      {mode === "phone" ? group.open.short : group.open.label}
      <span aria-hidden="true">→</span>
    </a>
  ) : null;
  return (
    <li className="dpgal__group" data-kind={entry.kind}>
      <section aria-labelledby={titleId}>
        <header className="dpgal__group-head">
          <div className="dpgal__group-heading">
            <h3 id={titleId} className="dpgal__group-title">{entry.title}</h3>
            <p className="dpgal__group-meta">
              {entry.site ? (
                <span className="dpgal__site">
                  <DossierIcon name="site" size={12} />
                  {entry.site.name}
                </span>
              ) : null}
              <span>{group.meta}</span>
              <span className="dpgal__count">{countLabel(group.photos.length, "fotografie", "fotografii")}</span>
              {entry.provenance === "HISTORICAL_RECORD" ? <ProvenanceTag label="Înregistrare istorică" /> : null}
            </p>
          </div>
          {mode !== "phone" ? open : null}
        </header>
        <ol className="dpgal__tiles">
          {group.shown.map((tile, index) => (
            <PhotoTileView key={tile.photo.documentId} group={group} tile={tile} index={index} mode={mode} onOpen={onOpen} {...actions} />
          ))}
        </ol>
        {mode === "phone" ? <p className="dpgal__group-foot">{open}</p> : null}
      </section>
    </li>
  );
}

function PhotoTileView({ group, tile, index, mode, canEdit, savedId, onOpen, onLink, onEdit, onRepresent, represented }: TileActions & { group: PhotoGroup; tile: PhotoTile; index: number; mode: BandMode; onOpen: (tile: PhotoTile) => void }) {
  const { photo } = tile;
  const stage = photo.photoStageLabel ?? "Fără etapă";
  const day = formatDay(photo.documentDate) ?? `încărcată ${formatDay(photo.uploadedAt) ?? ""}`;
  const works = represented(photo);
  const representedText = works.length ? `Reprezentativă pentru ${works.join(", ")}` : null;
  return (
    <li className="dpgal__tile" data-photo-tile={photoKey(group.key, photo.documentId)} data-saved={savedId === photo.documentId || undefined}>
      <PhotoFrame document={photo} size="tile" label={`Deschide fotografia ${index + 1} din ${group.shown.length}: ${stage} · ${photo.title}${representedText ? ` · ${representedText}` : ""}`} onOpen={() => onOpen(tile)} />
      <div className="dpgal__caption">
        <span className="dpgal__stage">{mode === "phone" ? `${index + 1} · ${stage} · ${day}` : `${index + 1} · ${stage}`}</span>
        {mode === "phone" ? null : <span className="dpgal__date">{day}</span>}
        <TileMenu photo={photo} canEdit={canEdit} representsWork={works.length > 0} onLink={onLink} onEdit={onEdit} onRepresent={onRepresent} />
      </div>
      {representedText ? (
        <p className="dpgal__rep" title={representedText}>
          <DossierIcon name="check" size={11} />
          {works.length === 1 ? "Reprezentativă pentru 1 lucrare" : `Reprezentativă pentru ${works.length} lucrări`}
        </p>
      ) : null}
      <p className="dpgal__sub">{mode === "phone" ? tile.originLabel : `${photo.title} · ${tile.originLabel}`}</p>
      {tile.alsoIn.length ? <p className="dpgal__also">{`Apare și la: ${tile.alsoIn.join(", ")}`}</p> : null}
    </li>
  );
}

/**
 * Descarcă, and by permission Asociază / Modifică datele / the representative photo of a work, in one
 * "⋯" per photo. The last one says what it will do: choose, or change the choice already made.
 */
function TileMenu({
  photo,
  canEdit,
  representsWork,
  onLink,
  onEdit,
  onRepresent,
}: {
  photo: DossierDocument;
  canEdit: boolean;
  representsWork: boolean;
  onLink: (document: DossierDocument) => void;
  onEdit: (document: DossierDocument) => void;
  onRepresent: (document: DossierDocument) => void;
}) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const id = useId();
  return (
    <div className="dpgal__menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="dpgal__more" aria-label={`Acțiuni pentru ${photo.title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div id={id} className="dpgal__menu-panel" role="group" aria-label={`Acțiuni pentru ${photo.title}`}>
          <a href={photo.downloadHref} download onClick={() => setOpen(false)}>Descarcă</a>
          {canEdit ? (
            <>
              <button type="button" onClick={() => { setOpen(false); onLink(photo); }}>Asociază</button>
              <button type="button" onClick={() => { setOpen(false); onEdit(photo); }}>Modifică datele</button>
              <button type="button" onClick={() => { setOpen(false); onRepresent(photo); }}>{representsWork ? "Fotografie reprezentativă…" : "Setează ca reprezentativă…"}</button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
