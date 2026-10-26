import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DossierDocument } from "../../../adapters/customerDossierAdapter";
import { useDocumentFile } from "../documents/useDocumentFile";
import { useBandMode } from "./bandModel";
import { formatDay } from "./dossierModel";
import { DossierIcon } from "./dossierIcons";
import { IllustrativeMark, StageMark } from "./historyParts";
import "../../../styles/surfaces/client-photo-viewer.css";

/**
 * N-020 · the one photo viewer of the client page (etapa 6 · Figma 707:22997 desktop, 707:23510
 * telefon, 675:19198 se încarcă, 675:19286 indisponibilă, 677:19922 din Lucrări, 712:23330 din
 * sediu; Noapte 679:19945). One photo at a time from the set it was opened with — the photos of one
 * group under the filters of the gallery, of one work, of one entry —, never another client's or
 * another group's. Previous / next (buttons, ← →), the stage switch and thumbnails move inside that
 * set; "i din n" says where. The image keeps its proportions; loading, a missing or damaged file and
 * a failed read have their own words. "Închide" (and Escape) is always in view; the focus returns to
 * what opened the viewer. On a phone the controls are the buttons under the image; there is no swipe.
 */
export function PhotoViewer({
  photos,
  startId,
  context,
  origin = null,
  note = null,
  onShow,
  onClose,
}: {
  photos: readonly DossierDocument[];
  startId: string;
  /** What the photos belong to ("Casetă luminoasă depozit Alpha"). */
  context: string;
  /** The object the set belongs to, to open it ("Deschide cererea CER-4C3E1233"). */
  origin?: { href: string; label: string; short: string } | null;
  /** A line about the set and where closing returns (677:19922). */
  note?: string | null;
  /** Told the photo now shown, so the page can return to it on close. */
  onShow?: (documentId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const mode = useBandMode();
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((photo) => photo.documentId === startId)));
  const photo = photos[Math.min(index, photos.length - 1)] ?? photos[0];
  const { file, retry } = useDocumentFile(photo ? photo.viewHref : null);
  // The proportions of each image once read: the frame is sized to them, never letterboxed.
  const [ratios, setRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>(".dviewer__close")?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // Told once per photo shown (the page may pass a new function on every render).
  const showRef = useRef(onShow);
  useEffect(() => {
    showRef.current = onShow;
  });
  const shownId = photo?.documentId ?? null;
  useEffect(() => {
    if (shownId) showRef.current?.(shownId);
  }, [shownId]);

  if (!photo) return null;
  const position = photos.indexOf(photo);
  const many = photos.length > 1;
  const stages = photos
    .map((item, at) => ({ at, stage: item.photoStage, label: item.photoStageLabel }))
    .filter((item, at, all) => item.label && all.findIndex((other) => other.stage === item.stage) === at);
  const move = (delta: number) => setIndex((position + delta + photos.length) % photos.length);
  // The date written on the photo; an undated photo says the day it was uploaded, as such.
  const day = formatDay(photo.documentDate) ?? (photo.uploadedAt ? `încărcată ${formatDay(photo.uploadedAt) ?? ""}` : null);
  const title = [photo.photoStageLabel, day].filter(Boolean).join(" · ") || photo.title;
  const where = `${position + 1} din ${photos.length}`;
  function onKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (!many) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
  }
  const download = (
    <a className="dviewer__action" href={photo.downloadHref} download>
      {mode === "phone" ? null : <DossierIcon name="download" size={15} />}
      <span>Descarcă</span>
    </a>
  );
  const open = origin ? (
    <a className="dviewer__action dviewer__origin" href={origin.href}>
      <span>{mode === "phone" ? origin.short : origin.label}</span>
      <span aria-hidden="true">→</span>
    </a>
  ) : null;

  return (
    <dialog ref={dialogRef} className="dviewer" data-mode={mode} aria-labelledby={titleId} aria-modal="true" onKeyDown={onKey} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dviewer__bar">
        <div className="dviewer__title">
          <h2 id={titleId}>{title}</h2>
          <p>{mode === "phone" ? `${where} · ${context}` : [photo.title === context ? null : photo.title, context, where].filter(Boolean).join(" · ")}</p>
        </div>
        {mode !== "phone" && stages.length > 1 ? (
          <div className="dviewer__stages" role="group" aria-label="Etapa fotografiei">
            {stages.map((item) => (
              <button key={item.stage ?? item.at} type="button" aria-pressed={photo.photoStage === item.stage} onClick={() => setIndex(item.at)}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {mode !== "phone" ? open : null}
        {mode !== "phone" ? download : null}
        <button type="button" className="dviewer__action dviewer__close" onClick={onClose}>
          {mode === "phone" ? "Închide" : "Închide · Esc"}
        </button>
      </div>
      <div className="dviewer__stage">
        {many && mode !== "phone" ? (
          <button type="button" className="dviewer__step" onClick={() => move(-1)} aria-label="Fotografia anterioară">
            <span aria-hidden="true">←</span>
          </button>
        ) : null}
        <figure className="dviewer__figure" aria-live="polite">
          {file.status === "ready" ? (
            // The marks sit on the image's own corners, whatever its proportions.
            <span className="dviewer__frame" style={ratios[photo.documentId] ? ({ "--ratio": ratios[photo.documentId] } as CSSProperties) : undefined}>
              <img
                key={photo.documentId}
                src={file.url}
                alt={photo.description ?? photo.title}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth && naturalHeight) setRatios((current) => ({ ...current, [photo.documentId]: naturalWidth / naturalHeight }));
                }}
              />
              <span className="dmarks">
                <StageMark document={photo} />
                <IllustrativeMark document={photo} />
              </span>
            </span>
          ) : (
            <span className="dviewer__state" role="status">
              {file.status === "loading" ? (
                "Se încarcă imaginea…"
              ) : file.status === "missing" ? (
                <>
                  <strong>Imaginea nu mai poate fi afișată</strong>
                  <span>{`Fișierul lipsește sau nu corespunde amprentei. Datele fotografiei rămân${many ? "; poți trece la următoarea" : ""}.`}</span>
                </>
              ) : (
                <>
                  <strong>Imaginea nu a putut fi citită</strong>
                  <span>Verifică legătura și încearcă din nou. Datele fotografiei rămân.</span>
                  <button type="button" className="dviewer__action" onClick={retry}>Încearcă din nou</button>
                </>
              )}
            </span>
          )}
        </figure>
        {many && mode !== "phone" ? (
          <button type="button" className="dviewer__step" onClick={() => move(1)} aria-label="Fotografia următoare">
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>
      {mode === "phone" ? (
        <div className="dviewer__phone">
          <p className="dviewer__caption">{photo.title}</p>
          {many ? (
            <p className="dviewer__steps">
              <button type="button" className="dviewer__action" onClick={() => move(-1)}>← Anterioara</button>
              <button type="button" className="dviewer__action" onClick={() => move(1)}>Următoarea →</button>
            </p>
          ) : null}
          <p className="dviewer__links">
            {open}
            {download}
          </p>
        </div>
      ) : (
        <>
          {many ? (
            <ol className="dviewer__thumbs" aria-label="Fotografiile setului">
              {photos.map((item, at) => (
                <li key={item.documentId}>
                  <button type="button" aria-current={at === position || undefined} onClick={() => setIndex(at)} aria-label={`${at + 1} din ${photos.length}: ${[item.photoStageLabel, item.title].filter(Boolean).join(" · ")}`}>
                    <img src={item.viewHref} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {note ? <p className="dviewer__note">{note}</p> : null}
        </>
      )}
    </dialog>
  );
}
