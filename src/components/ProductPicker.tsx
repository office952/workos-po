import { useMemo, useState } from "react";
import type { CatalogProductTransport } from "../api/types";
import { matchesSearch } from "../presentation/listFilter";
import "../styles/surfaces/product-system.css";

/** One collection presentation; definitions and enabled offerings keep separate API ownership. */
export function ProductPicker({ products, selectedCode, onChoose, actionLabel = "Alege produsul", disabled = false }: {
  products: readonly CatalogProductTransport[]; selectedCode?: string | null;
  onChoose: (product: CatalogProductTransport) => void; actionLabel?: string; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const families = [...new Set(products.map(p => p.familyLabel).filter((s): s is string => Boolean(s)))];
  const categories = [...new Set(products.filter(p => !family || p.familyLabel === family).map(p => p.categoryLabel).filter((s): s is string => Boolean(s)))];
  const visible = useMemo(() => products.filter(p => (!family || p.familyLabel === family) && (!category || p.categoryLabel === category) && matchesSearch(query, [p.label, p.description, p.familyLabel, p.categoryLabel])), [products, query, family, category]);
  const pageCount = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, pageCount);
  if (page !== currentPage) setPage(currentPage);
  function reset() { setQuery(""); setFamily(""); setCategory(""); setPage(1); }
  return <section className="product-picker" aria-label="Produse">
    <div className="product-picker__filters">
      <label>Caută produs<input type="search" value={query} disabled={disabled} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      <label>Familie<select value={family} disabled={disabled} onChange={e => { setFamily(e.target.value); setCategory(""); setPage(1); }}><option value="">Toate familiile</option>{families.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Categorie<select value={category} disabled={disabled} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Toate categoriile</option>{categories.map(s => <option key={s}>{s}</option>)}</select></label>
      {(query || family || category) && <button type="button" className="quiet-action" onClick={reset}>Resetează filtrele</button>}
    </div>
    <p className="ui-note" role="status">{visible.length} din {products.length} produse</p>
    <ul className="product-picker__list">{visible.slice((currentPage - 1) * 20, currentPage * 20).map(p => <li key={p.code}>
      <button type="button" disabled={disabled} aria-pressed={selectedCode === p.code} onClick={() => onChoose(p)}>
        <span><strong>{p.label}</strong><span>{[p.familyLabel, p.categoryLabel].filter(Boolean).join(" · ")}</span>{p.description && <span>{p.description}</span>}</span><span className="product-picker__action">{selectedCode === p.code ? "Selectat" : actionLabel}</span>
      </button>
    </li>)}</ul>
    {visible.length === 0 && <p>Niciun produs nu corespunde filtrului.</p>}
    {pageCount > 1 && <nav className="product-picker__pagination" aria-label="Paginare produse">
      <button type="button" disabled={disabled || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
      <span>Pagina {currentPage} din {pageCount}</span>
      <button type="button" disabled={disabled || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Următor</button>
    </nav>}
  </section>;
}
