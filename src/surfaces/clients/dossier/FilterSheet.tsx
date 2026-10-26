import { useEffect, useId, useRef, type ReactNode } from "react";
import { DossierIcon } from "./dossierIcons";
import { countLabel } from "./historyModel";

/** Tablet and phone: the filters of the rail in a sheet; each choice applies at once. */
export function FilterSheet({ total, onClose, onClear, children, title = "Filtre istoric", unit = ["intrare", "intrări"] }: { total: number; onClose: () => void; onClear: () => void; children: ReactNode; title?: string; unit?: [string, string] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dsheet"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dsheet__head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="dhist-link" onClick={onClear}>Golește</button>
        <button type="button" className="dsheet__close" onClick={onClose} aria-label="Închide filtrele">
          <DossierIcon name="close" size={16} />
        </button>
      </div>
      {children}
      <button type="button" className="dsheet__apply" onClick={onClose}>
        {`Arată ${countLabel(total, unit[0], unit[1])}`}
      </button>
    </dialog>
  );
}
