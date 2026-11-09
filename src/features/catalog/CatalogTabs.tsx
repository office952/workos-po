import { useRef } from "react";
import { CATALOG_TABS, type CatalogTab } from "./catalogSelection";

const TAB_LABELS: Record<CatalogTab, string> = {
  constructie: "Componente",
  proces: "Proces tehnologic",
  variante: "Variante",
};

type CatalogTabsProps = {
  selected: CatalogTab;
  onSelect: (tab: CatalogTab) => void;
  disabled?: boolean;
};

export function CatalogTabs({ selected, onSelect, disabled = false }: CatalogTabsProps) {
  const controls = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div className="catalog-workspace__tabs" role="tablist" aria-label="Zonele catalogului">
      {CATALOG_TABS.map((tab, index) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`catalog-tab-${tab}`}
          aria-controls={`catalog-panel-${tab}`}
          aria-selected={selected === tab}
          tabIndex={selected === tab ? 0 : -1}
          disabled={disabled}
          ref={(node) => {
            controls.current[index] = node;
          }}
          onClick={() => onSelect(tab)}
          onKeyDown={(event) => {
            let next: number;
            switch (event.key) {
              case "ArrowRight":
                next = (index + 1) % CATALOG_TABS.length;
                break;
              case "ArrowLeft":
                next = (index + CATALOG_TABS.length - 1) % CATALOG_TABS.length;
                break;
              case "Home":
                next = 0;
                break;
              case "End":
                next = CATALOG_TABS.length - 1;
                break;
              default:
                return;
            }
            event.preventDefault();
            onSelect(CATALOG_TABS[next]);
            controls.current[next]?.focus();
          }}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
