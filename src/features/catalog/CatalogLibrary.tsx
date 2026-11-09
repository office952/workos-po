import { useMemo, useState } from "react";
import { matchesSearch } from "../../presentation/listFilter";
import type { CatalogEnablementTone } from "../../adapters/catalogCapabilitiesAdapter";

export type CatalogLibraryItem = {
  code: string;
  label: string;
  description: string;
  familyLabel: string | null;
  categoryLabel: string | null;
  enablementLabel: string;
  enablementTone: CatalogEnablementTone;
};

type CatalogLibraryProps = {
  products: readonly CatalogLibraryItem[];
  selectedCode: string | null;
  disabled: boolean;
  onChoose: (code: string) => void;
};

export function CatalogLibrary({ products, selectedCode, disabled, onChoose }: CatalogLibraryProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => products.filter((product) => matchesSearch(query, [product.label, product.description, product.familyLabel, product.categoryLabel, product.enablementLabel])),
    [products, query],
  );
  const selectedHidden = selectedCode !== null && !visible.some((product) => product.code === selectedCode);
  const selectedKnown = products.some((product) => product.code === selectedCode);
  const selectedProduct = products.find((product) => product.code === selectedCode);

  return (
    <section className="catalog-workspace__region catalog-workspace__library" aria-labelledby="catalog-library-heading">
      <h2 id="catalog-library-heading">Biblioteca de produse</h2>
      <div className="catalog-workspace__library-controls">
        <label className="catalog-workspace__product-switch">
          Schimbă produsul
          <select
            title={selectedProduct?.label}
            value={selectedKnown ? selectedCode ?? "" : ""}
            disabled={disabled || products.length === 0}
            onChange={(event) => {
              if (event.target.value) onChoose(event.target.value);
            }}
          >
            <option value="">{products.length === 0 ? "Biblioteca nu conține produse." : "Alege un produs"}</option>
            {products.map((product) => (
              <option key={product.code} value={product.code}>
                {product.label}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-workspace__search">
          Caută în bibliotecă
          <input type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <p className="ui-note catalog-workspace__library-count" role="status">{visible.length} din {products.length} produse</p>
      {products.length === 0 ? <p>Biblioteca nu conține produse.</p> : null}
      {products.length > 0 && visible.length === 0 ? <p>Niciun produs nu corespunde căutării.</p> : null}
      {selectedHidden ? <p className="ui-note">Produsul selectat rămâne deschis și nu este în rezultatul căutării.</p> : null}
      <ul className="catalog-workspace__products">
        {visible.map((product) => (
          <li key={product.code}>
            <button type="button" aria-pressed={selectedCode === product.code} disabled={disabled} onClick={() => onChoose(product.code)}>
              <span className="catalog-workspace__product-copy">
                <strong>{product.label}</strong>
                <span>{[product.familyLabel, product.categoryLabel].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`catalog-workspace__state catalog-workspace__state--${product.enablementTone}`}>{product.enablementLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
