import { useEffect, useId } from "react";
import { navigate } from "../../../../routing/navigate";
import { useDisclosure } from "../bandModel";
import { DossierIcon } from "../dossierIcons";

export type ClientAction = { key: string; label: string } & ({ href: string } | { onSelect: () => void });

/**
 * "+ Cerere nouă" (the primary action) and "Alte acțiuni ▾" (Figma 574:2203, menu 579:5140). The
 * menu holds only what the server allows (dossier permissions); without any, it is not shown.
 * Opening it moves the focus to the first item; Escape and a click elsewhere close it and the
 * focus goes back to the button.
 */
export function ClientActions({
  canCreate,
  onCreate,
  actions,
  layout,
  shortCreate = false,
  createTone = "primary",
}: {
  canCreate: boolean;
  onCreate: () => void;
  actions: readonly ClientAction[];
  layout: "stack" | "row";
  /** Phone with a long name: "Cerere nouă" folds to "+" and keeps its accessible name. */
  shortCreate?: boolean;
  /**
   * R1: one dominant action per screen. Where the section shows its own primary action, "Cerere
   * nouă" takes the teal outline (Accent); otherwise it stays filled.
   */
  createTone?: "primary" | "accent";
}) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const menuId = useId();
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(".cdh-menu__item")?.focus({ preventScroll: true });
  }, [open, rootRef]);
  const select = (action: ClientAction) => {
    setOpen(false);
    if ("href" in action) navigate(action.href);
    else action.onSelect();
  };
  return (
    <div className="cdh-actions" data-layout={layout}>
      {canCreate ? (
        <button type="button" className="cdh-create" aria-label="Cerere nouă" onClick={onCreate} data-short={shortCreate || undefined} data-tone={createTone}>
          <DossierIcon name="plus" size={15} />
          <span className="cdh-create__label">Cerere nouă</span>
        </button>
      ) : null}
      {actions.length ? (
        <div className="cdh-more" ref={rootRef} onKeyDown={onKeyDown}>
          <button type="button" ref={buttonRef} className="cdh-more__button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
            <span>Alte acțiuni</span>
            <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={12} />
          </button>
          {open ? (
            <ul id={menuId} className="cdh-menu" aria-label="Alte acțiuni">
              {actions.map((action) => (
                <li key={action.key}>
                  <button type="button" className="cdh-menu__item" onClick={() => select(action)}>
                    {action.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
