import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
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

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function dialogFocusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/** Programmatic dialog focus is not always :focus-visible; this keeps a visible ring until blur. */
export function markDialogFocus(node: HTMLElement | null): void {
  if (!node) return;
  node.focus();
  node.setAttribute("data-dialog-focus", "true");
  const clear = () => {
    node.removeAttribute("data-dialog-focus");
    node.removeEventListener("blur", clear);
  };
  node.addEventListener("blur", clear);
}

function restoreFocus(opener: HTMLElement | null): void {
  if (
    opener?.isConnected
    && opener !== document.body
    && opener !== document.documentElement
  ) {
    opener.focus();
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) {
    return;
  }
  const fallback = document.querySelector<HTMLElement>("main, [data-app-main], #continut-principal, a[href='#continut-principal']");
  fallback?.focus();
}

/** Native modal focus containment; the caller owns drafts and access. */
export function CreationDialog({ title, subtitle, notice, framed = false, busy = false, onDismiss, children }: CreationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement
      && !dialog.contains(active)
      && active !== document.body
      && active !== document.documentElement
        ? active
        : null;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      restoreFocus(opener);
      queueMicrotask(() => restoreFocus(opener));
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    queueMicrotask(() => {
      if (!dialog.isConnected) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement
        && dialog.contains(active)
        && active !== dialog
        && !active.classList.contains("creation-dialog__close")
      ) {
        return;
      }
      markDialogFocus(dialog.querySelector<HTMLInputElement>("input:not(:disabled)"));
    });
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

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab") return;
    const nodes = dialogFocusables(event.currentTarget);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="creation-dialog"
      data-frame={framed || undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={busy}
      onKeyDown={onKeyDown}
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
