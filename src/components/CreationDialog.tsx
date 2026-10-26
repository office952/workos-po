import { useEffect, useId, useRef, type ReactNode } from "react";
import "../styles/layout/creation-dialog.css";
import "../styles/layout/creation-dialog-frame.css";

type CreationDialogProps = {
  title: string;
  /** A line under the title that says what the dialog is about (a document's type, number, date). */
  subtitle?: ReactNode;
  /** Shown with the title, so it stays in view while the body scrolls (framed dialogs). */
  notice?: ReactNode;
  /**
   * A long dialog on a small screen: the header (title, subtitle, close) stays at the top, only the
   * body scrolls, and a `.cdos-bar` inside the body stays at the bottom with the actions. The whole
   * frame stays inside the viewport. Opt-in, so the other dialogs keep their composition.
   */
  framed?: boolean;
  busy?: boolean;
  onDismiss: () => void;
  children: ReactNode;
};

/** Native modal focus containment; the caller owns drafts and access. */
export function CreationDialog({ title, subtitle, notice, framed = false, busy = false, onDismiss, children }: CreationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // The fixed header and bar take room from the scrolling body: their heights become its scroll
  // padding, so a focused field or a scrolled-to element is never left underneath them.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!framed || !dialog || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const head = dialog.querySelector<HTMLElement>(":scope > .creation-dialog__header");
      const bar = [...dialog.querySelectorAll<HTMLElement>(".cdos-bar")].find((item) => item.offsetParent !== null);
      dialog.style.setProperty("--cd-head", `${head?.offsetHeight ?? 0}px`);
      dialog.style.setProperty("--cd-bar", `${bar?.offsetHeight ?? 0}px`);
    };
    const sizes = new ResizeObserver(measure);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(dialog);
      dialog.querySelectorAll(":scope > .creation-dialog__header, .cdos-bar").forEach((item) => sizes.observe(item));
      measure();
    };
    const changes = new MutationObserver(watch);
    changes.observe(dialog, { childList: true, subtree: true });
    watch();
    return () => {
      sizes.disconnect();
      changes.disconnect();
    };
  }, [framed]);

  return (
    <dialog
      ref={dialogRef}
      className="creation-dialog"
      data-frame={framed || undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <div className="creation-dialog__header">
        {subtitle || notice ? (
          <div className="creation-dialog__heading">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p className="creation-dialog__subtitle">{subtitle}</p> : null}
            {notice}
          </div>
        ) : (
          <h2 id={titleId}>{title}</h2>
        )}
        <button type="button" className="creation-dialog__close" disabled={busy} onClick={onDismiss} aria-label="Închide formularul">×</button>
      </div>
      {framed ? <div className="creation-dialog__body">{children}</div> : children}
    </dialog>
  );
}
