import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { isTypingTarget } from "./deskKeys";
import type { DeskLayout } from "./useDeskLayout";

export type DeskVacancy = { title: string; body: string; hint?: string | null };

type Props = {
  id: string;
  label: string;
  /** Names the row kind in the step buttons: "Clientul anterior", "Cererea următoare". */
  steps: { previous: string; next: string };
  layout: DeskLayout;
  position: { index: number; count: number } | null;
  vacancy: DeskVacancy | null;
  onMove: (delta: number) => void;
  onClose?: () => void;
  children?: ReactNode;
};

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" data-up={up || undefined}>
      <path d="M5.5 8 10 12.5 14.5 8" />
    </svg>
  );
}

/**
 * The dossier frame shared by the registers: position in the register, previous/next, close
 * on tablet and phone, then either the page document or the vacant state.
 */
export function DeskDossier({ id, label, steps, layout, position, vacancy, onMove, onClose, children }: Props) {
  const movable = position !== null && position.index >= 0;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (isTypingTarget(event.target) || !movable) return;
    if (event.target instanceof Element && event.target.closest('[role="tablist"]')) return;
    event.preventDefault();
    onMove(event.key === "ArrowDown" ? 1 : -1);
  }

  return (
    <aside id={id} className="rdesk-dossier" data-layout={layout} aria-label={label} onKeyDown={onKeyDown}>
      <div className="rdesk-dossier__bar">
        {onClose ? (
          <button type="button" className="rdesk-dossier__close" onClick={onClose} data-dossier-close>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" /></svg>
            <span>{layout === "full" ? "Registru" : "Închide dosarul"}</span>
          </button>
        ) : null}
        <p className="rdesk-dossier__position">
          <span>Dosar</span>
          <strong>{movable && position ? `${position.index + 1} din ${position.count}` : "—"}</strong>
          {layout === "docked" && movable ? <span className="rdesk-dossier__hint" aria-hidden="true">↑ ↓ în registru</span> : null}
        </p>
        <div className="rdesk-dossier__nav">
          <button type="button" className="rdesk-dossier__step" aria-label={steps.previous} disabled={!movable || (position?.index ?? 0) <= 0} onClick={() => onMove(-1)}>
            <Arrow up />
          </button>
          <button
            type="button"
            className="rdesk-dossier__step"
            aria-label={steps.next}
            disabled={!movable || !position || position.index >= position.count - 1}
            onClick={() => onMove(1)}
          >
            <Arrow />
          </button>
        </div>
      </div>
      {vacancy ? (
        <div className="rdesk-dossier__table" data-empty>
          <div className="rdesk-dossier__vacant" role="status">
            <span className="rdesk-dossier__vacant-plate" aria-hidden="true">
              <svg viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
            </span>
            <p className="rdesk-dossier__vacant-title">{vacancy.title}</p>
            <p>{vacancy.body}</p>
            {vacancy.hint && layout === "docked" ? <p className="rdesk-dossier__hint">{vacancy.hint}</p> : null}
          </div>
        </div>
      ) : (
        children
      )}
    </aside>
  );
}

/** The document on the light table, followed by its actions. */
export function DeskSheet({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <div className="rdesk-dossier__table">
        <article className="rdesk-dossier__paper rdesk-sheet" aria-label={label}>
          {children}
        </article>
      </div>
      {actions}
    </>
  );
}

export function DeskActions({
  children,
  destinations,
}: {
  children: ReactNode;
  destinations: readonly { action: string; target: string }[];
}) {
  return (
    <div className="rdesk-dossier__actions">
      <div className="rdesk-dossier__buttons">{children}</div>
      {destinations.length ? (
        <ul className="rdesk-dossier__destinations">
          {destinations.map((item) => (
            <li key={item.action}>
              <strong>{item.action}</strong> → {item.target}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DeskLoading({ children }: { children: string }) {
  return (
    <p className="rdesk-dossier__loading" role="status">
      <span className="rdesk-dossier__spinner" aria-hidden="true" />
      {children}
    </p>
  );
}

export function DeskReadError({ title, children, onRetry }: { title: string; children: string; onRetry: () => void }) {
  return (
    <div className="rdesk-dossier__error" role="alert">
      <p className="rdesk-dossier__error-title">{title}</p>
      <p>{children}</p>
      <button type="button" className="rdesk-dossier__retry" onClick={onRetry}>Reîncearcă</button>
    </div>
  );
}

export function DeskStale({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <div className="rdesk-dossier__stale" role="alert">
      <p>{children}</p>
      <button type="button" className="rdesk-dossier__retry" onClick={onRetry}>Reîncearcă</button>
    </div>
  );
}

/** Tablet and phone: the dossier is a modal dialog over the register, which keeps its scroll. */
export function DeskDialog({
  layout,
  label,
  onClose,
  children,
}: {
  layout: DeskLayout;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-dossier-close]")?.focus();
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
    <div className="rdesk-dialog" data-layout={layout}>
      <div className="rdesk-dialog__scrim" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} className="rdesk-dialog__panel" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
