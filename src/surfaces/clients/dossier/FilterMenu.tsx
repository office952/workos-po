import { useEffect, useId } from "react";
import { useDisclosure } from "./bandModel";
import { DossierIcon } from "./dossierIcons";

export type FilterMenuOption = { value: string; label: string; count: number | null };

/**
 * One filter button with its menu (Figma Filtru 557:3585), shared by Istoric and Cereri și oferte:
 * the first choice ("Toți anii", "Toate sediile") clears only this filter; choosing the active one
 * again clears it too. The menu closes with Escape or a click elsewhere and gives the focus back.
 */
export function FilterMenu({ title, allLabel, options, value, onChange }: { title: string; allLabel: string; options: FilterMenuOption[]; value: string; onChange: (value: string) => void }) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const id = useId();
  const active = options.find((option) => option.value === value) ?? null;
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(".hfilter__option[aria-pressed='true'], .hfilter__option")?.focus({ preventScroll: true });
  }, [open, rootRef]);
  const choose = (next: string) => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
    onChange(next);
  };
  return (
    <div className="hfilter" ref={rootRef} onKeyDown={onKeyDown}>
      <button type="button" ref={buttonRef} className="hfilter__button" aria-expanded={open} aria-controls={id} data-active={active ? true : undefined} onClick={() => setOpen((current) => !current)}>
        <span className="hfilter__label">{active ? `${title} · ${active.label}` : title}</span>
        <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={11} />
      </button>
      {open ? (
        <ul id={id} className="hfilter__menu" aria-label={title}>
          <li>
            <button type="button" className="hfilter__option" aria-pressed={!value} onClick={() => choose("")}>
              <span>{allLabel}</span>
            </button>
          </li>
          {options.map((option) => (
            <li key={option.value}>
              <button type="button" className="hfilter__option" aria-pressed={option.value === value} data-empty={option.count === 0 || undefined} onClick={() => choose(option.value === value ? "" : option.value)}>
                <span>{option.label}</span>
                {option.count === null ? null : <span className="hfilter__count">{option.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
