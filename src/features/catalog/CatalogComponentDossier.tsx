import type { ReactNode } from "react";
import type {
  CatalogCapabilitiesPermissions,
  CatalogComponentView,
  CatalogPropertyGroup,
  CatalogPropertyView,
  CatalogWorkspaceProduct,
} from "../../adapters/catalogCapabilitiesAdapter";
import type { ProductSystemType } from "../../adapters/productSystemAdapter";
import { InlineAlert } from "../../components/InlineAlert";
import { catalogAdminHref, type CatalogSelection } from "./catalogSelection";

type CatalogComponentDossierProps = {
  product: CatalogWorkspaceProduct | null;
  component: CatalogComponentView | null;
  systemType: ProductSystemType | null;
  platformLimits: readonly CatalogPropertyView[];
  permissions: CatalogCapabilitiesPermissions | null;
  unknownProduct: boolean;
  catalogSelection: CatalogSelection;
};

const GROUP_ORDER: readonly CatalogPropertyGroup[] = ["platform", "request", "unsupported"];

function groupTitle(group: CatalogPropertyGroup): string {
  switch (group) {
    case "platform":
      return "Proprietăți fixe ale platformei";
    case "setting":
      return "Setări";
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

function Notes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="catalog-workspace__record-notes">
      {notes.map((note) => <small key={note} className="ui-note">{note}</small>)}
    </div>
  );
}

function Records({
  variant = "triple",
  rows,
}: {
  variant?: "single" | "pair" | "triple";
  rows: readonly { id: string; name: ReactNode; value?: ReactNode; note?: ReactNode }[];
}) {
  return (
    <ul className={`catalog-workspace__records catalog-workspace__records--${variant}`}>
      {rows.map((row) => (
        <li key={row.id}>
          <div className="catalog-workspace__record-name">{row.name}</div>
          {row.value !== undefined ? <div className="catalog-workspace__record-value">{row.value}</div> : null}
          {row.note !== undefined ? <div className="catalog-workspace__record-note">{row.note}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function PropertyRows({ items }: { items: readonly CatalogPropertyView[] }) {
  return (
    <Records
      rows={items.map((item) => ({
        id: item.id,
        name: item.label,
        value: (
          <>
            {item.value ? <span className="catalog-workspace__mono">{item.value}</span> : "—"}
            {item.options.length > 0 ? (
              <ul>
                {item.options.map((option) => (
                  <li key={option.label}>
                    {option.label}
                    {option.note ? <small className="ui-note"> · {option.note}</small> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ),
        note: item.notes.length > 0 ? <Notes notes={item.notes} /> : "—",
      }))}
    />
  );
}

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const headingId = `catalog-dossier-${id}`;
  return (
    <section className="catalog-workspace__dossier-section" aria-labelledby={headingId}>
      <div className="catalog-workspace__dossier-heading">
        <h3 id={headingId}>{title}</h3>
        {count !== undefined ? <span className="ui-note">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function CatalogComponentDossier({
  product,
  component,
  systemType,
  platformLimits,
  permissions,
  unknownProduct,
  catalogSelection,
}: CatalogComponentDossierProps) {
  const readOnly = permissions !== null
    && !permissions.canEditEnablement
    && !permissions.canEditTechnicalSettings
    && !permissions.canEditFormulas
    && !permissions.canEditDisplayLabels;
  const settings = component?.properties.filter((item) => item.group === "setting") ?? [];
  const formulas = component?.properties.filter((item) => item.group === "formula") ?? [];
  const otherGroups = GROUP_ORDER.map((group) => ({
    group,
    items: component?.properties.filter((item) => item.group === group) ?? [],
  })).filter((entry) => entry.items.length > 0);
  const shared = component?.properties.some((item) => item.notes.some((note) => note.startsWith("Valoare comună"))) ?? false;
  const measurement = systemType ? [...systemType.calculationInputs, ...systemType.calculationResults] : [];
  const attributes = systemType?.configurations.find((config) => config.productCode === product?.code)?.attributes ?? [];
  const resources = systemType?.resourceReferences ?? [];

  return (
    <section className="catalog-workspace__region catalog-workspace__dossier" aria-labelledby="catalog-dossier-heading">
      {!component ? <h2 id="catalog-dossier-heading">Fișa componentei</h2> : null}
      {unknownProduct ? <p>Proprietățile apar după alegerea unui produs din bibliotecă.</p> : null}
      {!product && !unknownProduct ? <p>Selectează un produs din bibliotecă.</p> : null}
      {product && !component ? <p>Acest produs nu are componente în manifest.</p> : null}
      {product && component ? (
        <>
          {readOnly ? <p className="ui-note">Consultare. Modificările se fac de proprietar, în paginile de administrare.</p> : null}
          <header className="catalog-workspace__dossier-identity">
            <h2 id="catalog-dossier-heading">{component.label}</h2>
            {systemType?.description ? <p>{systemType.description}</p> : null}
            <p className="catalog-workspace__tags">
              <span>{component.required ? "Obligatorie" : "Opțională"}</span>
              {systemType?.label ? <span>{systemType.label}</span> : null}
            </p>
            {shared ? <p className="ui-note">Unele valori sunt comune tipului de componentă și se folosesc și la alte produse.</p> : null}
          </header>
          {settings.length > 0 ? (
            <Section id="settings" title="Setări" count={settings.length}>
              <Records
                rows={settings.map((item) => ({
                  id: item.id,
                  name: item.label,
                  value: item.value ? <span className="catalog-workspace__mono">{item.value}</span> : "—",
                  ...(item.notes.length > 0 ? { note: <Notes notes={item.notes} /> } : {}),
                }))}
              />
              <p className="catalog-workspace__links">
                <a className="text-link" href={catalogAdminHref("/admin/technical", component.typeId, catalogSelection)}>Setările acestei componente</a>
              </p>
              {!permissions?.canEditTechnicalSettings ? <p className="ui-note">Doar proprietarul poate modifica setările tehnice.</p> : null}
            </Section>
          ) : null}
          {resources.length > 0 ? (
            <Section id="resources" title="Materiale și resurse" count={resources.length}>
              <p className="ui-note">Referințe din definiție, fără tarife.</p>
              <Records
                variant="single"
                rows={resources.map((item) => ({
                  id: item.id,
                  name: item.label,
                }))}
              />
              <p className="catalog-workspace__links">
                <a className="text-link" href="/admin/resources">Tarifele resurselor</a>
              </p>
            </Section>
          ) : null}
          {formulas.length > 0 ? (
            <Section id="formulas" title="Formule" count={formulas.length}>
              <Records
                variant="pair"
                rows={formulas.map((item) => ({
                  id: item.id,
                  name: item.label,
                  value: item.notes.length > 0 ? <Notes notes={item.notes} /> : "—",
                }))}
              />
              <p className="catalog-workspace__links">
                <a className="text-link" href={catalogAdminHref("/admin/formulas", component.typeId, catalogSelection)}>Formulele acestei componente</a>
              </p>
              {!permissions?.canEditFormulas ? <p className="ui-note">Doar proprietarul poate modifica formulele.</p> : null}
            </Section>
          ) : null}
          {attributes.length > 0 ? (
            <Section id="definition" title="Din definiția produsului" count={attributes.length}>
              <Records
                variant="pair"
                rows={attributes.map((attribute) => ({
                  id: `${attribute.label}:${attribute.valueDisplay}`,
                  name: attribute.label,
                  value: (
                    <>
                      <span className="catalog-workspace__mono">{attribute.valueDisplay}</span>
                      <small className="ui-note"> · {attribute.ownershipLabel}</small>
                    </>
                  ),
                }))}
              />
            </Section>
          ) : null}
          {component.relationships.length > 0 ? (
            <Section id="relations" title="Relații" count={component.relationships.length}>
              <ul>{component.relationships.map((line) => <li key={line}>{line}</li>)}</ul>
            </Section>
          ) : null}
          {measurement.length > 0 ? (
            <Section id="measurement" title="Măsurare" count={measurement.length}>
              <Records
                variant="pair"
                rows={measurement.map((line) => ({
                  id: `${line.label}:${line.value}`,
                  name: line.label,
                  value: line.value,
                }))}
              />
            </Section>
          ) : null}
          {otherGroups.map((entry) => (
            <Section key={entry.group} id={entry.group} title={groupTitle(entry.group)} count={entry.items.length}>
              <PropertyRows items={entry.items} />
            </Section>
          ))}
          {component.requestGap ? <p>{component.requestGap}</p> : null}
          {systemType?.gaps.length ? <InlineAlert tone="pending" title="De completat în definiție">{systemType.gaps.join(" ")}</InlineAlert> : null}
          {product.workFacts.length > 0 ? (
            <Section id="work-facts" title="Date ale lucrării" count={product.workFacts.length}>
              <PropertyRows items={product.workFacts} />
            </Section>
          ) : null}
          {product.productFacts.length > 0 ? (
            <Section id="product-facts" title="La nivelul produsului" count={product.productFacts.length}>
              <PropertyRows items={product.productFacts} />
            </Section>
          ) : null}
          {platformLimits.length > 0 ? (
            <Section id="platform-limits" title="Limite ale platformei" count={platformLimits.length}>
              <PropertyRows items={platformLimits} />
            </Section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
