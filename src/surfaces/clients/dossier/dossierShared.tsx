import { useState, type ReactNode } from "react";
import type { DossierDocument } from "../../../adapters/customerDossierAdapter";
import { Button } from "../../../components/Button";
import { CreationDialog } from "../../../components/CreationDialog";
import { InlineAlert } from "../../../components/InlineAlert";
import { useUnsavedChangesGuard } from "../../../routing/useUnsavedChangesGuard";
import { formatDay } from "./dossierModel";

/**
 * A form dialog that does not lose typed values: closing it, Escape, or leaving the page while it
 * holds unsaved values asks first. `subject` names what would be lost.
 */
export function DossierFormDialog({
  title,
  subtitle,
  framed = false,
  subject,
  dirty,
  busy,
  onClose,
  children,
}: {
  title: string;
  /** What the dialog is about, under the title (framed dialogs keep it in view). */
  subtitle?: ReactNode;
  /** Header and `.cdos-bar` stay in view while only the body scrolls (CreationDialog `framed`). */
  framed?: boolean;
  subject: string;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [held, setHeld] = useState(false);
  // While a request is on its way (an upload, a save), leaving would make its result unknown to the
  // reader: navigation waits for the answer instead of offering to leave.
  const guard = useUnsavedChangesGuard({ dirty: dirty || busy, subject, onHold: busy ? () => setHeld(true) : undefined });
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirming(true);
    else onClose();
  }
  const waiting = held && busy ? (
    <InlineAlert tone="pending" title="Se așteaptă răspunsul serverului">
      Pagina rămâne deschisă până la răspuns, ca să știi sigur dacă s-a salvat.
    </InlineAlert>
  ) : null;
  return (
    <CreationDialog title={title} subtitle={subtitle} framed={framed} notice={framed ? waiting : undefined} busy={busy} onDismiss={requestClose}>
      {framed ? null : waiting}
      {confirming ? (
        <div className="cdos-confirm">
          <InlineAlert tone="pending" title="Ai valori nesalvate">
            {subject} nu sunt salvate. Dacă închizi formularul, se pierd.
          </InlineAlert>
          <div className="cdos-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Continuă completarea</Button>
            <Button variant="ghost" onClick={onClose}>Închide fără salvare</Button>
          </div>
        </div>
      ) : null}
      <div hidden={confirming}>{children}</div>
      {guard}
    </CreationDialog>
  );
}

/** A compact row for one document or photo: open, download, and where it is attached. */
export function DocumentChip({ document, onOpen }: { document: DossierDocument; onOpen: (document: DossierDocument) => void }) {
  return (
    <span className="cdos-doc" data-kind={document.kind}>
      {document.preview === "IMAGE" ? <img className="cdos-doc__thumb" src={document.viewHref} alt="" loading="lazy" /> : <span className="cdos-doc__icon" aria-hidden="true">{document.preview === "PDF" ? "PDF" : "DOC"}</span>}
      <span className="cdos-doc__text">
        <button type="button" className="cdos-doc__open" onClick={() => onOpen(document)}>
          {document.title}
        </button>
        <span className="cdos-doc__meta">
          {[document.photoStageLabel ?? document.kindLabel, document.documentNumber, formatDay(document.documentDate)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <a className="cdos-doc__download" href={document.downloadHref} download aria-label={`Descarcă ${document.title}`}>
        ↓
      </a>
    </span>
  );
}
