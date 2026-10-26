import type { DossierDocument } from "../../../adapters/customerDossierAdapter";
import { formatDay } from "./dossierModel";
import { DossierIcon, type DossierIconName } from "./dossierIcons";
import { isIllustrative, stateTone, type StateTone } from "./historyModel";

/**
 * N-020 · small presentation parts shared by the history, the gallery, the works and the sites
 * (Figma page 10: N020/Stare, the stage and "Ilustrativ" marks on images, the document chip).
 */

const TONE_ICON: Record<StateTone, DossierIconName> = {
  offer: "hourglass",
  order: "wrench",
  production: "wrench",
  execution: "progress",
  done: "check",
  neutral: "document",
};

/** A canonical state: symbol and text, the colour only reinforces them. */
export function StateTag({ state, label }: { state: string | null; label: string }) {
  const tone = stateTone(state);
  return (
    <span className="dstate" data-tone={tone}>
      <DossierIcon name={TONE_ICON[tone]} size={14} />
      <span>{label}</span>
    </span>
  );
}

/** Where an entry comes from, shown apart from its state ("Finalizată" + "Înregistrare istorică"). */
export function ProvenanceTag({ label }: { label: string }) {
  return (
    <span className="dprov">
      <DossierIcon name="history" size={13} />
      <span>{label}</span>
    </span>
  );
}

/** The stage of a photo (Înainte / Simulare / După montaj), written on the image. */
export function StageMark({ document, small = false }: { document: DossierDocument; small?: boolean }) {
  if (!document.photoStageLabel) return null;
  return (
    <span className="dmark dmark--stage" data-stage={document.photoStage ?? undefined} data-small={small || undefined}>
      {document.photoStageLabel}
    </span>
  );
}

/** "Ilustrativ": the image is generated or schematic, not a photo of a real mounting. */
export function IllustrativeMark({ document, small = false }: { document: DossierDocument; small?: boolean }) {
  if (!isIllustrative(document)) return null;
  return (
    <span className="dmark dmark--illustrative" data-small={small || undefined} title="Imagine ilustrativă, nu o fotografie a montajului">
      Ilustrativ
    </span>
  );
}

/**
 * One image with its stage and provenance marks. The image keeps its proportions inside a fixed
 * 3:2 frame (cover), so the layout does not jump while images load.
 */
export function PhotoFrame({
  document,
  size = "card",
  onOpen,
  label,
}: {
  document: DossierDocument;
  size?: "thumb" | "card" | "tile";
  onOpen?: () => void;
  label?: string;
}) {
  const small = size === "thumb";
  const body = (
    <>
      <img src={document.viewHref} alt={document.description ?? document.title} loading="lazy" />
      {/* R1: the stage and „Ilustrativ” stacked at the top left, two distinct marks. */}
      <span className="dmarks" data-small={small || undefined}>
        <StageMark document={document} small={small} />
        <IllustrativeMark document={document} small={small} />
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <span className="dphoto" data-size={size}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" className="dphoto" data-size={size} onClick={onOpen} aria-label={label ?? `Deschide ${document.title}`}>
      {body}
    </button>
  );
}

/** A tile without an image (a record without photos): honest, not a placeholder photo. */
export function NoPhoto({ size = "card", text = "Fără fotografie" }: { size?: "thumb" | "card"; text?: string }) {
  return (
    <span className="dphoto dphoto--none" data-size={size}>
      <DossierIcon name="photo" size={size === "thumb" ? 16 : 18} />
      <span>{text}</span>
    </span>
  );
}

/** A compact document line: what it is, its number and date; opens the preview. */
export function FileChip({ document, onOpen }: { document: DossierDocument; onOpen: (document: DossierDocument) => void }) {
  const meta = [document.photoStageLabel ?? document.kindLabel, document.documentNumber, formatDay(document.documentDate)].filter(Boolean).join(" · ");
  return (
    <span className="dfile" data-kind={document.kind}>
      <span className="dfile__icon" aria-hidden="true">
        <DossierIcon name={document.kind === "PHOTO" ? "photo" : document.kind === "INVOICE" ? "file" : "document"} size={16} />
      </span>
      <span className="dfile__text">
        <button type="button" className="dfile__open" onClick={() => onOpen(document)}>
          {document.title}
        </button>
        <span className="dfile__meta">{meta}</span>
      </span>
      <a className="dfile__download" href={document.downloadHref} download aria-label={`Descarcă ${document.title}`}>
        <DossierIcon name="download" size={15} />
      </a>
    </span>
  );
}

/** A small count pill on a collapsed card (offers, attached files, photos). */
export function CountPill({ icon, label, short, quiet = false, variant }: { icon: DossierIconName; label: string; short?: string; quiet?: boolean; variant?: "offers" }) {
  return (
    <span className="dpill" data-quiet={quiet || undefined} data-variant={variant}>
      <DossierIcon name={icon} size={13} />
      <span className={short ? "dpill__long" : undefined}>{label}</span>
      {/* Phone (422:4135) writes "2 foto"; the full text stays for screen readers. */}
      {short ? <span className="dpill__short" aria-hidden="true">{short}</span> : null}
    </span>
  );
}
