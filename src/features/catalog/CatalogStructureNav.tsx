import { CatalogLink } from "./CatalogLink";
import type { CatalogSelection } from "./catalogSelection";
import { componentCountsText, componentIndexLabel, type CatalogStructureRow } from "./catalogStructure";

type CatalogStructureNavProps = {
  productCode: string;
  rows: readonly CatalogStructureRow[];
  selectedId: string | null;
  onNavigate: (selection: CatalogSelection) => void;
};

/** Rail on wide screens, a strip on a tablet. On a phone the structure list itself is the navigator. */
export function CatalogStructureNav({ productCode, rows, selectedId, onNavigate }: CatalogStructureNavProps) {
  return (
    <nav className="catv2-rail" aria-label="Structura produsului">
      <CatalogLink
        className="catv2-rail__item catv2-rail__item--overview"
        selection={{ productCode, componentId: null, tab: "constructie" }}
        onNavigate={onNavigate}
        current={selectedId === null}
      >
        <span className="catv2-rail__mark" aria-hidden="true" />
        <span className="catv2-rail__copy">
          <strong>Structură</strong>
          <small>Vedere de ansamblu</small>
        </span>
      </CatalogLink>
      <p className="catv2-rail__label">Componente · {rows.length}</p>
      <ul className="catv2-rail__list">
        {rows.map((row) => (
          <li key={row.component.id}>
            <CatalogLink
              className="catv2-rail__item"
              selection={{ productCode, componentId: row.component.id, tab: "constructie" }}
              onNavigate={onNavigate}
              current={selectedId === row.component.id}
            >
              <span className="catv2-rail__index" aria-hidden="true">{componentIndexLabel(row.index)}</span>
              <span className="catv2-rail__copy">
                <strong>{row.component.label}</strong>
                <small>{componentCountsText(row.counts)}</small>
              </span>
            </CatalogLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
