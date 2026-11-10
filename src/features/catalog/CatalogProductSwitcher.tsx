import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SearchGlyph, type CatalogLibraryProduct } from "./CatalogLibraryView";
import { matchesFolded } from "./catalogStructure";

type CatalogProductSwitcherProps = {
  products: readonly CatalogLibraryProduct[];
  currentCode: string;
  disabled: boolean;
  onChoose: (code: string) => void;
};

/** "Schimbă produsul": a panel anchored to the button on wide screens, a bottom sheet on a phone. */
export function CatalogProductSwitcher({ products, currentCode, disabled, onChoose }: CatalogProductSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const panelId = useId();
  const visible = useMemo(
    () => products.filter((product) => matchesFolded(query, [product.label, product.familyLabel, product.categoryLabel])),
    [products, query],
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function closeOnOutside(event: MouseEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  return (
    <div
      className="catv2-switcher"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="catv2-button catv2-button--secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Schimbă produsul
      </button>
      {open ? (
        <>
          <div className="catv2-switcher__backdrop" aria-hidden="true" onClick={close} />
          <div className="catv2-switcher__panel" id={panelId} role="dialog" aria-label="Schimbă produsul">
            <div className="catv2-switcher__head">
              <p className="catv2-switcher__title">Schimbă produsul</p>
              <button type="button" className="catv2-textbutton" onClick={close}>Închide</button>
            </div>
            <label className="catv2-search">
              <span className="catv2-visually-hidden">Caută un produs</span>
              <SearchGlyph />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Caută un produs"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="catv2-switcher__count" role="status">{visible.length} din {products.length}</p>
            {visible.length === 0 ? <p className="catv2-empty">Niciun produs nu corespunde căutării.</p> : null}
            <ul className="catv2-switcher__list">
              {visible.map((product) => {
                const current = product.code === currentCode;
                return (
                  <li key={product.code}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                        if (!current) onChoose(product.code);
                        buttonRef.current?.focus();
                      }}
                    >
                      <span className="catv2-switcher__copy">
                        <strong>{product.label}</strong>
                        <span>{[product.familyLabel, product.categoryLabel].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="catv2-switcher__state">
                        {current ? <span className="catv2-switcher__current">Produsul curent</span> : null}
                        <span className={`catv2-tag catv2-tag--${product.enablementTone}`}>{product.enablementLabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="catv2-footnote">Fila deschisă se păstrează. Componenta se alege din nou.</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
