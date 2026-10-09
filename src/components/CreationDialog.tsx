import { useEffect, useId, useRef, type ReactNode } from "react";
import "../styles/layout/creation-dialog.css";

type CreationDialogProps = {
  title: string;
  busy?: boolean;
  onDismiss: () => void;
  children: ReactNode;
};

/** Native modal focus containment; the caller owns drafts and access. */
export function CreationDialog({ title, busy = false, onDismiss, children }: CreationDialogProps) {
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

  return (
    <dialog
      ref={dialogRef}
      className="creation-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <div className="creation-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="creation-dialog__close" disabled={busy} onClick={onDismiss} aria-label="Închide formularul">×</button>
      </div>
      {children}
    </dialog>
  );
}
