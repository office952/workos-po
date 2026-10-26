import { useState } from "react";
import { Button } from "../../../components/Button";
import { hrefPath, originBack } from "../../../routing/originBack";
import { clientHref } from "../../../routing/appRoute";
import type { BandMode } from "../dossier/bandModel";
import { formatDay, useCustomerDossier } from "../dossier/dossierModel";
import { DossierFormDialog } from "../dossier/dossierShared";
import { DocumentViewer } from "../documents/DocumentViewer";
import { DOCUMENT_PARAM, useDocumentPreview } from "../documents/useDocumentPreview";
import { DocumentUploadForm } from "../dossier/DocumentUploadForm";
import { DossierIcon } from "../dossier/dossierIcons";
import { FileList } from "../dossier/history/cardParts";
import { follow } from "../dossier/history/follow";
import { HistoricalWorkDialog } from "../dossier/HistoricalWorkDialog";
import { attachedFiles, orderedPhotos } from "../dossier/historyModel";
import { NoPhoto, PhotoFrame, StateTag } from "../dossier/historyParts";
import { clientListHref, EMPTY_LIST_CONTEXT, type ListContext } from "../dossier/listContext";
import { PhotoViewer } from "../dossier/PhotoViewer";
import { useWorks } from "./useWorks";
import { listTrail } from "./worksModel";

/** The client page entry the reader came from: the Istoric list, or the Lucrări list (not a record). */
function originKind(href: string, customerId: string): "istoric" | "lucrari" | null {
  if (hrefPath(href) !== hrefPath(clientHref(customerId))) return null;
  const params = new URL(href, window.location.origin).searchParams;
  const section = params.get("sectiune");
  if (!section || section === "istoric") return "istoric";
  return section === "lucrari" && !params.get("lucrare") ? "lucrari" : null;
}

/**
 * The record of a historical work (648:13642, telefon 649:14469): identity, period, site, state,
 * what it was, its photos (before → after) and documents. It has no order, operations or
 * timesheets and none are shown. Changing it and adding files follow the permissions and the
 * dossier's own forms. The way back names where the reader came from — Lucrări (with its
 * filters) or Istoric — and returns to that very entry; after a direct link it is the Lucrări list.
 */
export function HistoricalWorkDetail({ customerId, workId, context, mode, search }: { customerId: string; workId: string; context: ListContext; mode: BandMode; search: string }) {
  const works = useWorks(customerId, { id: `historical:${workId}`, pageSize: 1 });
  const dossier = useCustomerDossier(customerId);
  const preview = useDocumentPreview(search, (documentId) => clientListHref(customerId, "lucrari", context, { lucrare: workId, ...(documentId ? { [DOCUMENT_PARAM]: documentId } : {}) }));
  const [viewer, setViewer] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const item = works.data?.items[0];
  const record = dossier.data?.historicalWorks.find((work) => work.workId === workId);
  const permissions = dossier.data?.permissions;
  const photos = item ? orderedPhotos(item.documents) : [];
  const files = item ? attachedFiles(item.documents) : [];

  const trail = listTrail(context);
  const back = originBack({ href: clientListHref(customerId, "lucrari", context), label: trail }, (href) => originKind(href, customerId) !== null);
  const backText = back.onClick && originKind(back.href, customerId) === "istoric" ? "← Istoric" : `← ${trail}`;
  const historyHref = item ? clientListHref(customerId, "istoric", { ...EMPTY_LIST_CONTEXT, year: String(item.year) }, { deschis: `historical:${workId}` }) : null;

  return (
    <div className="dwdetail" data-mode={mode}>
      <a className="dwdetail__back" href={back.href} onClick={back.onClick ?? ((event) => follow(event, back.href))}>
        {backText}
      </a>
      {works.status === "error" && !item ? (
        <div className="dworks__state" role="alert">
          <p className="dworks__state-title">Înregistrarea nu a putut fi citită.</p>
          <button type="button" className="dworks__button" onClick={works.retry}>Încearcă din nou</button>
        </div>
      ) : null}
      {works.data && !item ? (
        <div className="dworks__state">
          <p className="dworks__state-title">Lucrarea nu există</p>
          <p>Înregistrarea nu aparține acestui client sau nu mai este disponibilă.</p>
        </div>
      ) : null}
      {!works.data && works.status !== "error" ? <p className="dworks__state" role="status">Se citește lucrarea…</p> : null}
      {item ? (
        <article className="dwdetail__card" aria-labelledby="dwdetail-title">
          <p className="dwdetail__eyebrow">
            <span className="dwdetail__badge">
              <DossierIcon name="history" size={12} />
              {item.provenanceLabel || "Înregistrare istorică"}
            </span>
            <span>{[item.reference, "anterioară WorkOS"].filter(Boolean).join(" · ")}</span>
          </p>
          <h3 id="dwdetail-title" className="dwdetail__title">{item.title}</h3>
          <dl className="dwdetail__facts">
            <div>
              <dt>Perioada</dt>
              <dd>{item.eventDateLabel}</dd>
            </div>
            <div>
              <dt>Sediul</dt>
              <dd>
                {item.site ? item.site.line : "Fără sediu"}
                {item.siteAtTimeLabel ? <small>{`La data lucrării: ${item.siteAtTimeLabel}`}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Stare</dt>
              <dd>
                <StateTag state={item.state} label={item.stateLabel} />
              </dd>
            </div>
          </dl>
          <p className="dwdetail__note">Lucrare dinainte de WorkOS: nu are comandă, operații sau pontaje.</p>
          <div className="dwdetail__actions">
            {permissions?.recordHistoricalWork && record ? <Button variant="secondary" onClick={() => setEditing(true)}>Modifică</Button> : null}
            {permissions?.uploadDocuments && dossier.data ? <Button variant="secondary" onClick={() => setUploading(true)}>Adaugă documente sau fotografii</Button> : null}
            {historyHref ? (
              <a className="dwdetail__link" href={historyHref} onClick={(event) => follow(event, historyHref)}>
                {`Vezi în Istoric, la ${item.year} →`}
              </a>
            ) : null}
          </div>
          <div className="dwdetail__columns">
            <section className="dwdetail__photos" aria-labelledby="dwdetail-photos">
              <p id="dwdetail-photos" className="dwcard__label">{`Fotografii · ${photos.length}`}</p>
              {photos.length ? (
                <ol className="dwdetail__photo-list">
                  {photos.map((photo) => (
                    <li key={photo.documentId}>
                      <PhotoFrame document={photo} size="card" label={`Deschide fotografia ${photo.title}`} onOpen={() => setViewer(photo.documentId)} />
                      <p className="dwdetail__caption">{[photo.photoStageLabel ?? photo.title, formatDay(photo.documentDate)].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <NoPhoto text="Fără fotografii pentru această lucrare" />
              )}
            </section>
            <section className="dwdetail__about" aria-labelledby="dwdetail-files">
              {item.description ? (
                <>
                  <p className="dwcard__label">Descriere</p>
                  <p className="dwdetail__description">{item.description}</p>
                </>
              ) : null}
              <p id="dwdetail-files" className="dwcard__label">{`Documente · ${files.length}`}</p>
              {files.length ? <FileList documents={files} onOpen={(document) => preview.open(document.documentId)} /> : <p className="dwdetail__none">Niciun document atașat acestei lucrări.</p>}
            </section>
          </div>
        </article>
      ) : null}
      {preview.openId ? <DocumentViewer customerId={customerId} dossier={dossier.data ?? null} documentId={preview.openId} onClose={preview.close} /> : null}
      {viewer && item ? <PhotoViewer photos={photos} startId={viewer} context={item.title} note="Colecția: fotografiile acestei lucrări · închiderea revine la fișa din Lucrări" onClose={() => setViewer(null)} /> : null}
      {editing && record && dossier.data ? <HistoricalWorkDialog customerId={customerId} dossier={dossier.data} work={record} onClose={() => setEditing(false)} /> : null}
      {uploading && dossier.data ? (
        <DossierFormDialog framed title="Documente pentru lucrare" subject="Fișierul și datele lui" dirty={uploadDirty} busy={uploadBusy} onClose={() => { setUploading(false); setUploadDirty(false); }}>
          <DocumentUploadForm
            customerId={customerId}
            dossier={dossier.data}
            presetLinks={[{ kind: "HISTORICAL_WORK", subjectId: workId }]}
            onDirtyChange={setUploadDirty}
            onBusyChange={setUploadBusy}
            onDone={() => { setUploading(false); setUploadDirty(false); }}
            onCancel={() => { setUploading(false); setUploadDirty(false); }}
          />
        </DossierFormDialog>
      ) : null}
    </div>
  );
}
