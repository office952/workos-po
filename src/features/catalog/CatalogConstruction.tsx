import type { ProductSystemType } from "../../adapters/productSystemAdapter";
import type { CatalogComponentView, CatalogWorkspaceProduct } from "../../adapters/catalogCapabilitiesAdapter";
import { InlineAlert } from "../../components/InlineAlert";

type CatalogConstructionProps = {
  product: CatalogWorkspaceProduct | null;
  component: CatalogComponentView | null;
  systemType: ProductSystemType | null;
  unknownProduct: boolean;
  onChooseComponent: (componentId: string) => void;
};

export function CatalogConstruction({ product, component, systemType, unknownProduct, onChooseComponent }: CatalogConstructionProps) {
  const measurement = systemType ? [...systemType.calculationInputs, ...systemType.calculationResults] : [];
  const attributes = systemType?.configurations.find((config) => config.productCode === product?.code)?.attributes ?? [];

  return (
    <section className="catalog-workspace__region" aria-labelledby="catalog-construction-heading">
      <h2 id="catalog-construction-heading">Construcția produsului</h2>
      {unknownProduct ? <p>Produsul indicat nu face parte din biblioteca curentă.</p> : null}
      {!product && !unknownProduct ? <p>Selectează un produs din bibliotecă.</p> : null}
      {product ? (
        <>
          <nav className="catalog-workspace__components" aria-label="Componentele produsului">
            {product.components.map((item) => (
              <button key={item.id} type="button" aria-pressed={component?.id === item.id} onClick={() => onChooseComponent(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          {component ? (
            <div className="catalog-workspace__component">
              <h3>{component.label}</h3>
              <p className="ui-note">{component.required ? "Componentă obligatorie." : "Componentă opțională."}</p>
              <h3>Relații</h3>
              {component.relationships.length > 0 ? (
                <ul>{component.relationships.map((line) => <li key={line}>{line}</li>)}</ul>
              ) : (
                <p>Nu există o relație de date către altă componentă.</p>
              )}
              {systemType ? (
                <>
                  {systemType.description ? <p>{systemType.description}</p> : null}
                  {(systemType.measurement || systemType.quantity) ? <p>{[systemType.measurement, systemType.quantity].filter(Boolean).join(" · ")}</p> : null}
                  {measurement.length > 0 ? (
                    <>
                      <h3>Măsurare</h3>
                      <p className="ui-note">Aceste rânduri vin din definiția produsului. Catalogul nu le calculează.</p>
                      <dl className="catalog-workspace__facts">
                        {measurement.map((line) => (
                          <div key={`${line.label}:${line.value}`}>
                            <dt>{line.label}</dt>
                            <dd>{line.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : null}
                  {attributes.length > 0 ? (
                    <>
                      <h3>Din definiția produsului</h3>
                      <dl className="catalog-workspace__facts">
                        {attributes.map((attribute) => (
                          <div key={`${attribute.label}:${attribute.valueDisplay}`}>
                            <dt>{attribute.label}</dt>
                            <dd>{attribute.valueDisplay}<small className="ui-note"> · {attribute.ownershipLabel}</small></dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : null}
                  {systemType.resourceReferences.length > 0 ? (
                    <>
                      <h3>Materiale și resurse</h3>
                      <ul>{systemType.resourceReferences.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
                      <a className="text-link" href="/admin/resources">Tarifele resurselor</a>
                    </>
                  ) : null}
                  {systemType.processReferences.length > 0 ? (
                    <>
                      <h3>Procese</h3>
                      <ul>{systemType.processReferences.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
                    </>
                  ) : null}
                  {systemType.gaps.length > 0 ? <InlineAlert tone="pending" title="De completat în definiție">{systemType.gaps.join(" ")}</InlineAlert> : null}
                </>
              ) : null}
            </div>
          ) : <p>Acest produs nu are componente în manifest.</p>}
        </>
      ) : null}
    </section>
  );
}
