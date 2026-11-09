import { useEffect, useRef } from "react";
import type { CatalogComponentView } from "../../adapters/catalogCapabilitiesAdapter";
import { catalogComponentSummaryText, type CatalogComponentSummary } from "./catalogComponentSummary";

export type { CatalogComponentSummary };

type CatalogComponentNavProps = {
  components: readonly CatalogComponentView[];
  summaries: ReadonlyMap<string, CatalogComponentSummary>;
  selectedId: string | null;
  disabled: boolean;
  hasProduct: boolean;
  unknownProduct: boolean;
  onChoose: (componentId: string) => void;
};

export function CatalogComponentNav({
  components,
  summaries,
  selectedId,
  disabled,
  hasProduct,
  unknownProduct,
  onChoose,
}: CatalogComponentNavProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const node = selectedRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [selectedId]);

  return (
    <section className="catalog-workspace__region" aria-labelledby="catalog-components-heading">
      <h2 id="catalog-components-heading">Componente{hasProduct ? ` · ${components.length}` : ""}</h2>
      {unknownProduct ? <p>Componentele apar după alegerea unui produs din bibliotecă.</p> : null}
      {!unknownProduct && !hasProduct ? <p>Selectează un produs pentru a vedea componentele.</p> : null}
      {hasProduct && components.length === 0 ? <p>Acest produs nu are componente în manifest.</p> : null}
      {components.length > 0 ? (
        <nav className="catalog-workspace__components catalog-workspace__components--stack" aria-label="Componentele produsului">
          {components.map((item, index) => {
            const summary = summaries.get(item.id);
            return (
              <button
                key={item.id}
                ref={selectedId === item.id ? selectedRef : undefined}
                type="button"
                aria-label={item.label}
                aria-pressed={selectedId === item.id}
                aria-current={selectedId === item.id ? "true" : undefined}
                disabled={disabled}
                onClick={() => onChoose(item.id)}
              >
                <span className="catalog-workspace__component-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="catalog-workspace__product-copy">
                  <strong>{item.label}</strong>
                  <span className="catalog-workspace__component-meta">{summary ? catalogComponentSummaryText(summary) : item.required ? "Obligatorie" : "Opțională"}</span>
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </section>
  );
}
