import { useState } from "react";
import type { DossierDocument, HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import type { BandMode } from "../bandModel";
import { formatDay } from "../dossierModel";
import { orderedPhotos } from "../historyModel";
import { PhotoFrame } from "../historyParts";
import { openDocument, type Opened } from "./opened";

/** Short tile text per document kind (presentation only; the label stays the server's). */
const KIND_TILE: Record<string, string> = { CONTRACT: "CTR", ADDENDUM: "ACT", INVOICE: "FACT", RECEPTION: "PV", OTHER: "DOC" };

function tileText(document: DossierDocument): { kind: string; format: string | null } {
  const extension = document.originalFileName.includes(".") ? document.originalFileName.split(".").pop()?.toUpperCase() ?? null : null;
  return { kind: KIND_TILE[document.kind] ?? document.kindLabel.slice(0, 4).toUpperCase(), format: extension };
}

export function DocTile({ document, large = false }: { document: DossierDocument; large?: boolean }) {
  const tile = tileText(document);
  return (
    <span className="hdoc-tile" data-large={large || undefined} aria-hidden="true">
      <span className="hdoc-tile__kind">{tile.kind}</span>
      {tile.format ? <span className="hdoc-tile__format">{tile.format}</span> : null}
    </span>
  );
}

function FileRow({ document, onOpen }: { document: DossierDocument; onOpen: (document: DossierDocument) => void }) {
  const meta = [document.kindLabel, document.documentNumber, formatDay(document.documentDate)].filter(Boolean).join(" · ");
  return (
    <li className="hfile">
      <DocTile document={document} />
      <span className="hfile__text">
        <span className="hfile__title">{document.title}</span>
        <span className="hfile__meta">{meta}</span>
      </span>
      <span className="hfile__actions">
        {document.preview !== "NONE" ? (
          <button type="button" className="hfile__preview" data-document-opener={document.documentId} onClick={() => onOpen(document)} aria-label={`Previzualizează ${document.title}`}>
            Previzualizează
          </button>
        ) : null}
        <a className="hfile__download" href={document.downloadHref} download aria-label={`Descarcă ${document.title}`}>
          Descarcă
        </a>
      </span>
    </li>
  );
}

/** File rows (kind tile, title, kind · number · date, Previzualizează, Descarcă). */
export function FileList({ documents, onOpen }: { documents: readonly DossierDocument[]; onOpen: (document: DossierDocument) => void }) {
  return (
    <ul className="hfile-list">
      {documents.map((document) => (
        <FileRow key={document.documentId} document={document} onOpen={onOpen} />
      ))}
    </ul>
  );
}

/** The file rows under a label; with `empty`, a group with no file says so instead of disappearing. */
export function Files({ title, documents, onOpen, empty }: { title: string; documents: readonly DossierDocument[]; onOpen: (document: DossierDocument) => void; empty?: string }) {
  if (!documents.length && !empty) return null;
  return (
    <div className="hcard__files">
      <p className="hcard__label">{`${title} · ${documents.length}`}</p>
      {documents.length ? (
        <FileList documents={documents} onOpen={onOpen} />
      ) : (
        <p className="hcard__none">{empty}</p>
      )}
    </div>
  );
}

/**
 * Photos in the order of the work (Înainte → Simulare → După montaj), each with its stage and date.
 * `photos` narrows the set (the request's own, not its works'); the viewer then browses that set.
 * On the phone a project (813:31918) names the set above the photo and starts at the first stage;
 * a historical work (580:4114) starts at its last one, the mounted result.
 */
export function Photos({
  entry,
  mode,
  onOpen,
  title = "Fotografii",
  photos: chosen,
  phoneStart = "last",
  phoneLabel = false,
}: {
  entry: HistoryEntry;
  mode: BandMode;
  onOpen: (opened: Opened) => void;
  title?: string;
  photos?: readonly DossierDocument[];
  phoneStart?: "first" | "last";
  phoneLabel?: boolean;
}) {
  const ordered = orderedPhotos(chosen ?? entry.documents);
  const [index, setIndex] = useState(phoneStart === "first" ? 0 : ordered.length - 1);
  if (!ordered.length) return null;
  const open = (photo: DossierDocument) => openDocument(entry, photo, onOpen, ordered);
  const stages = [...new Set(ordered.map((photo) => photo.photoStageLabel).filter(Boolean))].join(" → ");
  const caption = (photo: DossierDocument) => [photo.photoStageLabel, formatDay(photo.documentDate)].filter(Boolean).join(" · ");
  // Phone (580:4114): one photo at a time with its place in the set; the others one tap away.
  if (mode === "phone") {
    const current = ordered[Math.min(Math.max(index, 0), ordered.length - 1)] ?? ordered[0]!;
    const position = ordered.indexOf(current);
    return (
      <div className="hcard__photos" data-carousel>
        {phoneLabel ? <p className="hcard__label">{[`${title} · ${ordered.length}`, stages || null].filter(Boolean).join(" · ")}</p> : null}
        <PhotoFrame document={current} size="card" onOpen={() => open(current)} label={`Deschide fotografia ${current.title}`} />
        <div className="hcard__carousel">
          <p className="hcard__caption">{`${position + 1} / ${ordered.length} · ${caption(current)}`}</p>
          {ordered.length > 1 ? (
            <button
              type="button"
              className="hcard__button"
              onClick={() => setIndex(position > 0 ? position - 1 : ordered.length - 1)}
              aria-label={`Fotografia anterioară: ${caption(ordered[position > 0 ? position - 1 : ordered.length - 1]!)}`}
            >
              {position > 0 ? `‹ ${ordered[position - 1]?.photoStageLabel ?? "Anterioara"}` : `${ordered[ordered.length - 1]?.photoStageLabel ?? "Ultima"} ›`}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="hcard__photos">
      <p className="hcard__label">{[`${title} · ${ordered.length}`, stages || null].filter(Boolean).join(" · ")}</p>
      <ol className="hcard__photo-list">
        {ordered.map((photo) => (
          <li key={photo.documentId}>
            <PhotoFrame document={photo} size="card" onOpen={() => open(photo)} label={`Deschide fotografia ${photo.title}`} />
            <p className="hcard__caption">{caption(photo)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
