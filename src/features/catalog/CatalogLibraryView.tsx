import { useEffect, useMemo, useRef } from "react";
import type { CatalogEnablementTone } from "../../adapters/catalogCapabilitiesAdapter";
import { CatalogLink } from "./CatalogLink";
import type { CatalogSelection } from "./catalogSelection";
import { countNoun, EMPTY_LIBRARY_FILTERS, matchesFolded, type CatalogLibraryFilters } from "./catalogStructure";

type AvailabilityFilter = CatalogLibraryFilters["availability"];

export type CatalogLibraryProduct = {
  code: string;
  label: string;
  description: string;
  familyLabel: string | null;
  categoryLabel: string | null;
  componentCount: number;
  versionLabel: string | null;
  enablementLabel: string;
  enablementTone: CatalogEnablementTone;
};


type CatalogLibraryViewProps = {
  products: readonly CatalogLibraryProduct[];
  /** Message shown when the address named a product that is not in the library. */
  notice: string | null;
  filters: CatalogLibraryFilters;
  onFiltersChange: (filters: CatalogLibraryFilters) => void;
  onOpen: (selection: CatalogSelection) => void;
};

/** Above this many products the rows drop the long description; it stays on the product page. */
const COMPACT_ABOVE = 12;

export function CatalogLibraryView({ products, notice, filters, onFiltersChange, onOpen }: CatalogLibraryViewProps) {
  const { query, availability, family } = filters;
  const setQuery = (value: string) => onFiltersChange({ ...filters, query: value });
  const setAvailability = (value: AvailabilityFilter) => onFiltersChange({ ...filters, availability: value });
  const setFamily = (value: string) => onFiltersChange({ ...filters, family: value });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  // The table header pins right under the tools, whatever height they wrap to.
  useEffect(() => {
    const section = sectionRef.current;
    const tools = toolsRef.current;
    if (!section || !tools || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      section.style.setProperty("--cat-library-tools-height", `${Math.round(tools.getBoundingClientRect().height)}px`);
    });
    observer.observe(tools);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const families = useMemo(
    () => [...new Set(products.map((product) => product.familyLabel).filter((label): label is string => Boolean(label)))].sort((a, b) => a.localeCompare(b, "ro")),
    [products],
  );
  const activeFamily = families.includes(family) ? family : "";
  const searched = useMemo(
    () => products.filter((product) =>
      matchesFolded(query, [product.label, product.description, product.familyLabel, product.categoryLabel])
      && (activeFamily === "" || product.familyLabel === activeFamily)),
    [products, query, activeFamily],
  );
  const offered = searched.filter((product) => product.enablementTone === "offered");
  const notOffered = searched.filter((product) => product.enablementTone === "not-offered");
  const visible = availability === "offered" ? offered : availability === "not-offered" ? notOffered : searched;
  const filtered = query.trim() !== "" || availability !== "all" || activeFamily !== "";
  const compact = products.length > COMPACT_ABOVE;

  function clear() {
    onFiltersChange(EMPTY_LIBRARY_FILTERS);
    searchRef.current?.focus();
  }

  return (
    <section ref={sectionRef} className="catv2-library" aria-labelledby="catalog-library-heading" data-density={compact ? "compact" : "comfortable"}>
      <header className="catv2-library__head">
        <div>
          <p className="catv2-eyebrow">06 · Catalog</p>
          <h1 id="catalog-library-heading">Bibliotecă de produse</h1>
          <p className="catv2-lead">Catalogul arată definițiile. Un produs neoferit rămâne vizibil pentru consultare. Oferirea pentru lucrări noi se alege la disponibilitate.</p>
        </div>
        <a className="catv2-link" href="/admin/products">Disponibilitatea produselor <span aria-hidden="true">↗</span></a>
      </header>
      {notice ? (
        <div className="catv2-notice" role="status">
          <p><strong>{notice}</strong></p>
          <p>Adresa poate fi veche sau produsul a fost retras. Alege un produs din listă.</p>
        </div>
      ) : null}
      <div ref={toolsRef} className="catv2-library__sticky">
        <div className="catv2-library__tools">
          <label className="catv2-search">
            <span className="catv2-visually-hidden">Caută în bibliotecă</span>
            <SearchGlyph />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Caută după denumire, familie sau categorie"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query !== "") {
                  event.preventDefault();
                  setQuery("");
                }
              }}
            />
            <kbd aria-hidden="true">{query === "" ? "/" : "Esc"}</kbd>
          </label>
          <div className="catv2-chips" role="group" aria-label="Disponibilitate">
            <FilterButton label={`Toate · ${searched.length}`} pressed={availability === "all"} onClick={() => setAvailability("all")} />
            <FilterButton label={`Oferite · ${offered.length}`} pressed={availability === "offered"} onClick={() => setAvailability("offered")} />
            <FilterButton label={`Neoferite · ${notOffered.length}`} pressed={availability === "not-offered"} onClick={() => setAvailability("not-offered")} />
          </div>
          {families.length > 1 ? (
            <label className="catv2-select">
              <span className="catv2-visually-hidden">Familie</span>
              <select value={activeFamily} onChange={(event) => setFamily(event.target.value)}>
                <option value="">Toate familiile</option>
                {families.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
          ) : null}
          <p className="catv2-library__count" role="status">
            {filtered ? `${visible.length} din ${products.length}` : countNoun(products.length, "produs", "produse")}
          </p>
          {filtered ? <button type="button" className="catv2-textbutton" onClick={clear}>Șterge căutarea și filtrele</button> : null}
        </div>
      </div>
      {products.length === 0 ? <p className="catv2-empty">Biblioteca nu conține produse.</p> : null}
      {products.length > 0 && visible.length === 0 ? (
        <div className="catv2-empty">
          <p><strong>{query.trim() !== "" ? `Niciun produs nu corespunde căutării „${query.trim()}”.` : "Niciun produs nu corespunde filtrelor."}</strong></p>
          <button type="button" className="catv2-textbutton" onClick={clear}>Șterge căutarea și filtrele</button>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <table className="catv2-table catv2-library__table">
          <thead>
            <tr>
              <th scope="col">Produs</th>
              <th scope="col">Familie · categorie</th>
              <th scope="col" className="catv2-num">Componente</th>
              <th scope="col">Versiune</th>
              <th scope="col">Disponibilitate</th>
              <th scope="col" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => (
              <tr key={product.code} className="catv2-rowlink">
                <th scope="row" className="catv2-library__product">
                  <CatalogLink className="catv2-rowlink__target" selection={{ productCode: product.code, componentId: null, tab: "constructie" }} onNavigate={onOpen}>
                    {product.label}
                  </CatalogLink>
                  {!compact && product.description ? <span className="catv2-library__description">{product.description}</span> : null}
                  <span className="catv2-library__phone-meta">
                    {[product.familyLabel, product.categoryLabel].filter(Boolean).join(" · ")}
                  </span>
                  <span className="catv2-library__phone-meta">
                    <span className={`catv2-tag catv2-tag--${product.enablementTone}`}>{product.enablementLabel}</span>
                    <span>{countNoun(product.componentCount, "componentă", "componente")}{product.versionLabel ? ` · v${product.versionLabel}` : ""}</span>
                  </span>
                </th>
                <td className="catv2-library__family">
                  <span>{product.familyLabel ?? "—"}</span>
                  {product.categoryLabel ? <span>{product.categoryLabel}</span> : null}
                </td>
                <td className="catv2-num catv2-figure">{product.componentCount}</td>
                <td className="catv2-mono">{product.versionLabel ? `v${product.versionLabel}` : "—"}</td>
                <td><span className={`catv2-tag catv2-tag--${product.enablementTone}`}>{product.enablementLabel}</span></td>
                <td className="catv2-chevron" aria-hidden="true">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {compact && visible.length > 0 ? (
        <p className="catv2-footnote">Descrierea lungă a fiecărui produs se află în pagina produsului.</p>
      ) : null}
    </section>
  );
}

function FilterButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className="catv2-chip" aria-pressed={pressed} onClick={onClick}>
      {label}
    </button>
  );
}

export function SearchGlyph() {
  return (
    <svg className="catv2-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.8 12.8 L17 17" />
    </svg>
  );
}
