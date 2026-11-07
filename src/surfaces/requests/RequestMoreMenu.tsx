import { useEffect, useId } from "react";
import { useDisclosure } from "../clients/dossier/bandModel";

export type RequestMenuAction = { key: string; label: string; onSelect: () => void };

/**
 * CJ1 · "Mai multe ▾" of the request header (WorkOS-N 1227:19615): rare commercial actions the
 * server allows, kept out of the way of the obligations. Without any, the menu is not shown.
 */
export function RequestMoreMenu({ actions }: { actions: readonly RequestMenuAction[] }) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const menuId = useId();
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(".request-more__item")?.focus({ preventScroll: true });
  }, [open, rootRef]);
  if (actions.length === 0) return null;
  return (
    <div className="request-more" ref={rootRef} onKeyDown={onKeyDown} data-testid="request-more">
      <button
        type="button"
        ref={buttonRef}
        className="text-link request-more__button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Mai multe <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul id={menuId} className="request-more__menu" aria-label="Mai multe acțiuni ale cererii">
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                className="request-more__item"
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
