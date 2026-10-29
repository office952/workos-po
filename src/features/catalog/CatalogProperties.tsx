import type { CatalogCapabilitiesPermissions, CatalogComponentView, CatalogPropertyGroup, CatalogPropertyView, CatalogWorkspaceProduct } from "../../adapters/catalogCapabilitiesAdapter";

type CatalogPropertiesProps = {
  product: CatalogWorkspaceProduct | null;
  component: CatalogComponentView | null;
  platformLimits: readonly CatalogPropertyView[];
  permissions: CatalogCapabilitiesPermissions | null;
  unknownProduct: boolean;
};

const GROUP_ORDER: readonly CatalogPropertyGroup[] = ["platform", "setting", "formula", "request", "unsupported"];

function groupTitle(group: CatalogPropertyGroup): string {
  switch (group) {
    case "platform":
      return "Proprietăți fixe ale platformei";
    case "setting":
      return "Setări tehnice ale organizației";
    case "formula":
      return "Formule";
    case "request":
      return "Fapte pe lucrare";
    case "unsupported":
      return "Nu este disponibil";
    default: {
      const exhaustive: never = group;
      return exhaustive;
    }
  }
}

function PropertyList({ items }: { items: readonly CatalogPropertyView[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="catalog-workspace__facts">
      {items.map((item) => (
        <div key={item.id}>
          <dt>{item.label}</dt>
          <dd>
            {item.value ? <span>{item.value}</span> : null}
            {item.options.length > 0 ? (
              <ul>
                {item.options.map((option) => (
                  <li key={option.label}>{option.label}{option.note ? <small className="ui-note"> · {option.note}</small> : null}</li>
                ))}
              </ul>
            ) : null}
            {item.notes.map((note) => <small key={note} className="ui-note">{note}</small>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function GroupedProperties({ items }: { items: readonly CatalogPropertyView[] }) {
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const grouped = items.filter((item) => item.group === group);
        if (grouped.length === 0) return null;
        return (
          <div key={group}>
            <h3>{groupTitle(group)}</h3>
            <PropertyList items={grouped} />
          </div>
        );
      })}
    </>
  );
}

export function CatalogProperties({ product, component, platformLimits, permissions, unknownProduct }: CatalogPropertiesProps) {
  const readOnly = permissions !== null && !permissions.canEditEnablement && !permissions.canEditTechnicalSettings && !permissions.canEditFormulas && !permissions.canEditDisplayLabels;

  return (
    <section className="catalog-workspace__region" aria-labelledby="catalog-properties-heading">
      <h2 id="catalog-properties-heading">Proprietăți și configurare</h2>
      {unknownProduct ? <p>Proprietățile apar după alegerea unui produs din bibliotecă.</p> : null}
      {!product && !unknownProduct ? <p>Selectează un produs din bibliotecă.</p> : null}
      {product ? (
        <>
          {readOnly ? <p className="ui-note">Consultare. Modificările se fac de proprietar, în paginile de administrare.</p> : null}
          <h3>Disponibilitate în organizație</h3>
          <p className={`catalog-workspace__state catalog-workspace__state--${product.enablementTone}`}>{product.enablementLabel}</p>
          <p className="catalog-workspace__links">
            <a className="text-link" href="/admin/products">Disponibilitatea produselor</a>
          </p>
          {!permissions?.canEditEnablement ? <p className="ui-note">Doar proprietarul poate schimba disponibilitatea.</p> : null}
          {component ? (
            <>
              <h3>{component.label}</h3>
              <GroupedProperties items={component.properties} />
              {component.requestGap ? <p>{component.requestGap}</p> : null}
              <p className="catalog-workspace__links">
                <a className="text-link" href={`/admin/technical?component=${encodeURIComponent(component.typeId)}`}>Setările acestei componente</a>
                <a className="text-link" href={`/admin/formulas?component=${encodeURIComponent(component.typeId)}`}>Formulele acestei componente</a>
              </p>
              {!permissions?.canEditTechnicalSettings ? <p className="ui-note">Doar proprietarul poate modifica setările tehnice.</p> : null}
              {!permissions?.canEditFormulas ? <p className="ui-note">Doar proprietarul poate modifica formulele.</p> : null}
            </>
          ) : null}
          {product.workFacts.length > 0 ? (
            <div>
              <h3>Date ale lucrării</h3>
              <PropertyList items={product.workFacts} />
            </div>
          ) : null}
          {product.productFacts.length > 0 ? (
            <div>
              <h3>La nivelul produsului</h3>
              <GroupedProperties items={product.productFacts} />
            </div>
          ) : null}
          {platformLimits.length > 0 ? (
            <div>
              <h3>Limite ale platformei</h3>
              <PropertyList items={platformLimits} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
