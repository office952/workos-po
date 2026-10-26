import { useEffect, useId, useRef, useState } from "react";
import type { CustomerDossierModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { useBandMode, useDisclosure } from "../dossier/bandModel";
import { formatBytes, formatDay } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { follow } from "../dossier/history/follow";
import { EditDocumentDialog } from "./DocumentEditDialog";
import { LinkDocumentDialog } from "./DocumentLinksDialog";
import { documentSites, fileFormat, linkHref, proofNote } from "./documentsModel";
import { useDocumentFile } from "./useDocumentFile";
import "../../../styles/surfaces/client-document-viewer.css";

/**
 * The one document viewer of the client page (707:22391 · 707:22609 · 739:888; telefon B02 / 786:367;
 * Noapte 674:18277), the same from Documente, Lucrări and Istoric: the title and what the document
 * is, "Descarcă" and "Închide" at the top; the file in the page (the browser's own PDF viewer, an
 * image) or a plain word when it cannot be shown; at the side its metadata, what it is attached to
 * (each a way to that object; Back returns to this document) and what uploading does not prove.
 * "Asociază" and "Modifică datele" follow the permission. Escape and "Închide" close it.
 */
export function DocumentViewer({ customerId, dossier, documentId, onClose }: { customerId: string; dossier: CustomerDossierModel | null; documentId: string; onClose: () => void }) {
  const document = dossier?.documents.find((item) => item.documentId === documentId) ?? null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const mode = useBandMode();
  const [linking, setLinking] = useState(false);
  const [editing, setEditing] = useState(false);
  const canEdit = dossier?.permissions.editDocuments === true;
  // Opened from the phone menu, the dialog's opener (a menu item) is gone when it closes: the focus
  // goes back to „⋯” instead of the page. Runs after the dialog has given the focus back itself.
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (linking || editing || !returnTo.current) return;
    if (returnTo.current.isConnected) returnTo.current.focus();
    returnTo.current = null;
  }, [linking, editing]);
  function openFromMenu(toggle: HTMLElement | null, open: () => void) {
    returnTo.current = toggle;
    open();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>(".ddocview__close")?.focus({ preventScroll: true });
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  const meta = document ? [document.kindLabel, document.documentNumber, formatDay(document.documentDate)].filter(Boolean).join(" · ") : null;
  return (
    <dialog
      ref={dialogRef}
      className="ddocview"
      data-mode={mode}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!linking && !editing) onClose();
      }}
    >
      <header className="ddocview__head">
        <div className="ddocview__heading">
          <h2 id={titleId} className="ddocview__title">{document?.title ?? (dossier ? "Documentul nu mai există" : "Se citește documentul…")}</h2>
          {meta ? <p className="ddocview__meta">{meta}</p> : null}
        </div>
        <div className="ddocview__head-actions">
          {document && mode !== "phone" ? (
            <a className="ddocview__button" href={document.downloadHref} download>
              Descarcă
            </a>
          ) : null}
          <button type="button" className="ddocview__button ddocview__close" onClick={onClose}>
            Închide
          </button>
        </div>
      </header>
      {document && dossier ? (
        <div className="ddocview__body">
          <DocumentFrame document={document} />
          <DocumentFacts customerId={customerId} dossier={dossier} document={document} />
        </div>
      ) : dossier ? (
        <p className="ddocview__state" role="status">Documentul nu aparține acestui client sau nu mai este disponibil.</p>
      ) : (
        <p className="ddocview__state" role="status">Se citește documentul…</p>
      )}
      {document ? (
        <footer className="ddocview__foot">
          {mode === "phone" ? (
            <>
              <a className="ddocview__button ddocview__button--primary" href={document.downloadHref} download>
                Descarcă
              </a>
              {canEdit ? <PhoneMenu title={document.title} onLink={(toggle) => openFromMenu(toggle, () => setLinking(true))} onEdit={(toggle) => openFromMenu(toggle, () => setEditing(true))} /> : null}
            </>
          ) : canEdit ? (
            <>
              <button type="button" className="ddocview__button" onClick={() => setLinking(true)}>Asociază</button>
              <button type="button" className="ddocview__button" onClick={() => setEditing(true)}>Modifică datele</button>
            </>
          ) : null}
        </footer>
      ) : null}
      {linking && document && dossier ? <LinkDocumentDialog customerId={customerId} dossier={dossier} document={document} onClose={() => setLinking(false)} /> : null}
      {editing && document && dossier ? <EditDocumentDialog customerId={customerId} dossier={dossier} document={document} onClose={() => setEditing(false)} /> : null}
    </dialog>
  );
}

/** The file in the page: loading, the PDF or image, a damaged or missing file, a failed read with retry, or no preview. */
function DocumentFrame({ document }: { document: DossierDocument }) {
  const { file, retry } = useDocumentFile(document.preview === "NONE" ? null : document.viewHref);
  const format = fileFormat(document);
  return (
    <section className="ddocview__frame" aria-label={`Fișierul ${document.originalFileName}`}>
      <p className="ddocview__file">{[document.originalFileName, format].filter(Boolean).join(" · ")}</p>
      <div className="ddocview__page">
        {document.preview === "NONE" ? (
          <div className="ddocview__state">
            <p className="ddocview__state-title">Fără previzualizare</p>
            <p>Doar PDF-urile și imaginile se deschid în pagină. Descarcă fișierul pentru a-l deschide.</p>
            <a className="ddocview__button" href={document.downloadHref} download>Descarcă {document.originalFileName}</a>
          </div>
        ) : file.status === "loading" ? (
          <div className="ddocview__state" role="status" aria-busy="true">
            <p>Se încarcă documentul…</p>
            <span className="ddocview__skeleton" aria-hidden="true" />
          </div>
        ) : file.status === "missing" ? (
          <div className="ddocview__state" role="alert">
            <p className="ddocview__state-title">Fișierul nu mai poate fi deschis.</p>
            <p>Datele documentului rămân. Fișierul lipsește din stocare sau nu mai corespunde celui încărcat.</p>
          </div>
        ) : file.status === "error" ? (
          <div className="ddocview__state" role="alert">
            <p className="ddocview__state-title">Documentul nu a putut fi încărcat.</p>
            <p>Datele de alături rămân; poți încerca din nou sau îl poți descărca.</p>
            <button type="button" className="ddocview__button" onClick={retry}>Încearcă din nou</button>
          </div>
        ) : document.preview === "PDF" ? (
          <iframe className="ddocview__pdf" src={file.url} title={`Previzualizare ${document.title}`} />
        ) : (
          <img className="ddocview__image" src={file.url} alt={document.description ?? document.title} />
        )}
      </div>
    </section>
  );
}

/** Metadata, associations (each a way to its object), site, description and what the file does not prove. */
function DocumentFacts({ customerId, dossier, document }: { customerId: string; dossier: CustomerDossierModel; document: DossierDocument }) {
  const sites = documentSites(document, dossier);
  const format = fileFormat(document);
  return (
    <aside className="ddocview__facts" aria-label="Datele documentului">
      <dl>
        <div>
          <dt>Tip</dt>
          <dd>{document.photoStageLabel ? `${document.kindLabel} · ${document.photoStageLabel}` : document.kindLabel}</dd>
        </div>
        {document.documentNumber ? (
          <div>
            <dt>Număr</dt>
            <dd className="ddocview__mono">{document.documentNumber}</dd>
          </div>
        ) : null}
        <div>
          <dt>Data documentului</dt>
          <dd className="ddocview__mono">{formatDay(document.documentDate) ?? "Fără dată — documentul nu are o dată declarată"}</dd>
        </div>
        <div>
          <dt>Încărcat</dt>
          <dd className="ddocview__mono">{formatDay(document.uploadedAt)}</dd>
        </div>
        <div>
          <dt>Fișier</dt>
          <dd>{[document.originalFileName, format, formatBytes(document.sizeBytes)].filter(Boolean).join(" · ")}</dd>
        </div>
        <div>
          <dt>Asociat cu</dt>
          <dd>
            {document.links.length ? (
              <ul className="ddocview__links">
                {document.links.map((link) => {
                  const href = linkHref(customerId, link);
                  const text = `${link.kindLabel} · ${link.label}`;
                  return (
                    <li key={`${link.kind}:${link.subjectId}`}>
                      {href ? (
                        <a href={href} onClick={(event) => follow(event, href)}>{`${text} →`}</a>
                      ) : (
                        text
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              "Doar în dosarul clientului"
            )}
          </dd>
        </div>
        {sites.length ? (
          <div>
            <dt>Sediu</dt>
            <dd>
              {sites.map((site) => (
                <span key={site.siteId} className="ddocview__site">
                  <DossierIcon name="site" size={13} />
                  {site.name}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {document.description ? (
          <div>
            <dt>Descriere</dt>
            <dd>{document.description}</dd>
          </div>
        ) : null}
      </dl>
      <p className="ddocview__proof">{proofNote(document.kind)}</p>
    </aside>
  );
}

/** Phone (786:479): the less frequent actions in "⋯", next to "Descarcă". */
function PhoneMenu({ title, onLink, onEdit }: { title: string; onLink: (toggle: HTMLElement | null) => void; onEdit: (toggle: HTMLElement | null) => void }) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const id = useId();
  return (
    <div className="ddocview__menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="ddocview__button" aria-label={`Alte acțiuni pentru ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div id={id} className="ddocview__menu-panel" role="group" aria-label={`Alte acțiuni pentru ${title}`}>
          <button type="button" onClick={() => { setOpen(false); onLink(buttonRef.current); }}>Asociază</button>
          <button type="button" onClick={() => { setOpen(false); onEdit(buttonRef.current); }}>Modifică datele</button>
        </div>
      ) : null}
    </div>
  );
}
