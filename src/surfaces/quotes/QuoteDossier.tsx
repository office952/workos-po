import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { QuoteListItemTransport } from "../../api/types";
import { presentJobSheetStage } from "../../presentation/jobSheetIdentity";
import type { QuotesSheet } from "../../routing/appRoute";
import { isTypingTarget } from "./quoteRegistryModel";
import { OfferActions, OfferSheet, OrderActions, OrderSheet } from "./QuoteDossierSheets";
import { useQuoteDocumentDownload, useQuoteDossier } from "./useQuoteDossier";
import type { QuotesLayout } from "./useQuotesLayout";

export type DossierEmpty = "none" | "filtered" | "not-found" | "loading" | "unavailable";

type Props = {
  /** Replaces the register wording when the dossier opens outside Oferte (e.g. over a request). */
  emptyCopy?: { title: string; body: string; hint: string | null };
  layout: QuotesLayout;
  item: QuoteListItemTransport | null;
  empty: DossierEmpty;
  sheet: QuotesSheet;
  position: { index: number; count: number };
  onSheet: (sheet: QuotesSheet) => void;
  onMove: (delta: number) => void;
  onClose?: () => void;
};

const EMPTY_COPY: Record<DossierEmpty, { title: string; body: string; hint: string | null }> = {
  none: {
    title: "Nicio ofertă selectată",
    body: "Alege un rând din registru. Dosarul arată oferta și, dacă există, comanda și lucrarea ei.",
    hint: "↑ ↓ selectează · Enter deschide oferta",
  },
  filtered: {
    title: "Nicio ofertă în filtrul curent",
    body: "Căutarea sau filtrele nu au rezultate. Resetează filtrele pentru a reveni la registru.",
    hint: null,
  },
  "not-found": {
    title: "Oferta nu este în registru",
    body: "Oferta cerută nu există sau nu este accesibilă în această organizație. Alege altă ofertă din registru.",
    hint: null,
  },
  loading: { title: "Se citește registrul", body: "Dosarul se deschide după citirea listei de oferte.", hint: null },
  unavailable: { title: "Dosarul nu este disponibil", body: "Lista de oferte nu a putut fi citită.", hint: null },
};

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" data-up={up || undefined}>
      <path d="M5.5 8 10 12.5 14.5 8" />
    </svg>
  );
}

function Tabs({
  item,
  sheet,
  jobLabel,
  onSheet,
}: {
  item: QuoteListItemTransport;
  sheet: QuotesSheet;
  jobLabel: string;
  onSheet: (sheet: QuotesSheet) => void;
}) {
  const ordered = Boolean(item.orderSnapshotId);
  const tabs: { id: QuotesSheet; label: string; detail: string; disabled: boolean }[] = [
    { id: "oferta", label: "Ofertă", detail: item.reference, disabled: false },
    { id: "comanda", label: "Comandă · lucrare", detail: ordered ? jobLabel : "Fără comandă · fără lucrare", disabled: !ordered },
  ];
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    if (!ordered) return;
    const next: QuotesSheet = sheet === "oferta" ? "comanda" : "oferta";
    onSheet(next);
    requestAnimationFrame(() => document.getElementById(`oferte-dosar-tab-${next}`)?.focus());
  }
  return (
    <div className="offers-dossier__tabs" role="tablist" aria-label="Straturile dosarului" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`oferte-dosar-tab-${tab.id}`}
          type="button"
          role="tab"
          className="offers-dossier__tab"
          data-sheet={tab.id}
          aria-selected={sheet === tab.id}
          aria-controls="oferte-dosar-foaie"
          aria-disabled={tab.disabled || undefined}
          tabIndex={sheet === tab.id ? 0 : -1}
          onClick={() => {
            if (!tab.disabled) onSheet(tab.id);
          }}
        >
          <span className="offers-dossier__tab-label">{tab.label}</span>
          <span className="offers-dossier__tab-detail">{tab.detail}</span>
        </button>
      ))}
    </div>
  );
}

function Contents({ item, sheet, onSheet }: { item: QuoteListItemTransport; sheet: QuotesSheet; onSheet: (sheet: QuotesSheet) => void }) {
  const { offer, job } = useQuoteDossier(item);
  const pdf = useQuoteDocumentDownload(item);
  const front: QuotesSheet = sheet === "comanda" && item.orderSnapshotId ? "comanda" : "oferta";
  const jobLabel =
    job.status === "ready"
      ? presentJobSheetStage(job.job)
      : job.status === "error"
        ? "Eroare la citire"
        : "Se citește…";
  return (
    <>
      <Tabs item={item} sheet={front} jobLabel={jobLabel} onSheet={onSheet} />
      <div className="offers-dossier__table" data-ordered={Boolean(item.orderSnapshotId) || undefined}>
        <span className="offers-dossier__under" aria-hidden="true" />
        <div
          id="oferte-dosar-foaie"
          className="offers-dossier__paper"
          role="tabpanel"
          aria-labelledby={`oferte-dosar-tab-${front}`}
          data-error={job.status === "error" && front === "comanda" ? true : undefined}
        >
          {front === "oferta" && offer ? <OfferSheet item={item} offer={offer} /> : null}
          {front === "comanda" ? <OrderSheet item={item} job={job} /> : null}
        </div>
      </div>
      {front === "oferta" ? <OfferActions item={item} pdf={pdf} /> : <OrderActions item={item} onOffer={() => onSheet("oferta")} />}
    </>
  );
}

/** The dossier beside (or over) the register: offer and order sheets on a light table. */
export function QuoteDossier({ layout, item, empty, sheet, position, onSheet, onMove, onClose, emptyCopy }: Props) {
  const copy = emptyCopy ?? EMPTY_COPY[empty];
  const movable = item !== null && position.index >= 0;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (isTypingTarget(event.target)) return;
    if (event.target instanceof Element && event.target.closest('[role="tablist"]')) return;
    if (!movable) return;
    event.preventDefault();
    onMove(event.key === "ArrowDown" ? 1 : -1);
  }

  return (
    <aside id="oferte-dosar" className="offers-dossier" data-layout={layout} data-scroll-memory={layout === "docked" ? "dosar" : undefined} aria-label="Dosarul ofertei" onKeyDown={onKeyDown}>
      <div className="offers-dossier__bar">
        {onClose ? (
          <button type="button" className="offers-dossier__close" onClick={onClose} data-dossier-close>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" /></svg>
            <span>{layout === "full" ? "Registru" : "Închide dosarul"}</span>
          </button>
        ) : null}
        <p className="offers-dossier__position">
          <span>Dosar</span>
          <strong>{movable ? `${position.index + 1} din ${position.count}` : "—"}</strong>
          {layout === "docked" && movable ? <span className="offers-dossier__hint" aria-hidden="true">↑ ↓ în registru</span> : null}
        </p>
        <div className="offers-dossier__nav">
          <button
            type="button"
            className="offers-dossier__step"
            aria-label="Oferta anterioară"
            disabled={!movable || position.index <= 0}
            onClick={() => onMove(-1)}
          >
            <Arrow up />
          </button>
          <button
            type="button"
            className="offers-dossier__step"
            aria-label="Oferta următoare"
            disabled={!movable || position.index >= position.count - 1}
            onClick={() => onMove(1)}
          >
            <Arrow />
          </button>
        </div>
      </div>
      {item ? (
        <Contents key={item.quoteSnapshotId} item={item} sheet={sheet} onSheet={onSheet} />
      ) : (
        <div className="offers-dossier__table" data-empty>
          <div className="offers-dossier__vacant" role="status">
            <span className="offers-dossier__vacant-plate" aria-hidden="true">
              <svg viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
            </span>
            <p className="offers-dossier__vacant-title">{copy.title}</p>
            <p>{copy.body}</p>
            {copy.hint && layout === "docked" ? <p className="offers-dossier__hint">{copy.hint}</p> : null}
          </div>
        </div>
      )}
    </aside>
  );
}

/** Tablet and phone: the dossier is a modal dialog over the register, which keeps its scroll. */
export function DossierDialog({
  layout,
  onClose,
  children,
  variant,
  label = "Dosarul ofertei",
  initialFocus = "[data-dossier-close]",
}: {
  layout: QuotesLayout;
  onClose: () => void;
  children: ReactNode;
  /** The offer preview of Cereri și oferte: a 560 px drawer, a sheet on the phone (668:15454 / 668:16010). */
  variant?: "drawer";
  label?: string;
  /** Where the focus goes when the dialog opens. */
  initialFocus?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const initialFocusRef = useRef(initialFocus);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(initialFocusRef.current)?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="offers-dialog" data-layout={layout} data-variant={variant}>
      <div className="offers-dialog__scrim" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} className="offers-dialog__panel" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
