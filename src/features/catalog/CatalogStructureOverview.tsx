import type { CatalogComponentLink, CatalogWorkspaceProduct } from "../../adapters/catalogCapabilitiesAdapter";
import type { ProductSystemProduct } from "../../adapters/productSystemAdapter";
import { CatalogLink } from "./CatalogLink";
import type { CatalogSelection } from "./catalogSelection";
import { componentCountsText, componentIndexLabel, structureTotalsText, type CatalogStructureRow } from "./catalogStructure";

type CatalogStructureOverviewProps = {
  product: CatalogWorkspaceProduct;
  definition: ProductSystemProduct | null;
  rows: readonly CatalogStructureRow[];
  canEditEnablement: boolean;
  /** Set when the address named a component this product does not have. */
  unknownComponent: boolean;
  onNavigate: (selection: CatalogSelection) => void;
};

function linkSentence(link: CatalogComponentLink): string {
  const target = `${componentIndexLabel(link.componentIndex)} ${link.componentLabel}`;
  return link.direction === "gives" ? `Dă ${link.subject} către ${target}` : `Primește ${link.subject} de la ${target}`;
}

export function ComponentLinks({ links }: { links: readonly CatalogComponentLink[] }) {
  if (links.length === 0) return <span className="catv2-dash" aria-label="Nicio legătură declarată">—</span>;
  return (
    <ul className="catv2-links">
      {links.map((link) => (
        <li key={`${link.direction}:${link.componentId}`}>
          <span className="catv2-visually-hidden">{linkSentence(link)}</span>
          <span className="catv2-links__arrow" aria-hidden="true">{link.direction === "gives" ? "→" : "←"}</span>
          <span aria-hidden="true">
            {componentIndexLabel(link.componentIndex)} {link.componentLabel} · {link.subject}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Count({ value }: { value: number }) {
  return value > 0 ? <>{value}</> : <span className="catv2-dash" aria-label="niciuna">—</span>;
}

export function CatalogStructureOverview({ product, definition, rows, canEditEnablement, unknownComponent, onNavigate }: CatalogStructureOverviewProps) {
  const limits = product.components.flatMap((component) => component.properties.filter((item) => item.group === "unsupported"));
  const facts: { label: string; value: string; link?: boolean; note?: string }[] = [];
  if (definition?.familyLabel) facts.push({ label: "Familie", value: definition.familyLabel });
  if (definition?.categoryLabel) facts.push({ label: "Categorie", value: definition.categoryLabel });
  facts.push({
    label: "Disponibilitate",
    value: product.enablementLabel,
    link: true,
    ...(canEditEnablement ? {} : { note: "Doar proprietarul poate schimba disponibilitatea." }),
  });
  for (const fact of product.productFacts) {
    facts.push({ label: fact.label, value: fact.value ?? fact.notes.join(" ") });
  }
  if (product.workFacts.length > 0) {
    facts.push({ label: "Se cere la deschiderea cererii", value: product.workFacts.map((item) => item.label).join(" · ") });
  }
  if (product.preset && product.preset.fields.length === 0) {
    facts.push({ label: "Variante", value: "Acest produs nu are opțiuni reutilizabile." });
  }
  for (const limit of limits) {
    facts.push({ label: `Limită cunoscută · ${limit.label}`, value: limit.notes.join(" ") });
  }

  return (
    <section className="catv2-structure" aria-labelledby="catalog-structure-heading">
      <header className="catv2-section-head">
        <h2 id="catalog-structure-heading" className="catv2-h2">Structura produsului</h2>
        {definition?.description ? <p className="catv2-lead">{definition.description}</p> : null}
      </header>
      {unknownComponent ? (
        <p className="catv2-notice" role="status">Componenta indicată nu face parte din acest produs. Alege o componentă din listă.</p>
      ) : null}
      <div className="catv2-block">
        <div className="catv2-block__head">
          <h3 className="catv2-h3">Componente <span className="catv2-count">{rows.length}</span></h3>
          <p className="catv2-block__summary">{structureTotalsText(rows)}</p>
        </div>
        {rows.length === 0 ? <p className="catv2-empty">Acest produs nu are componente în definiție.</p> : (
          <table className="catv2-table catv2-matrix">
            <thead>
              <tr>
                <th scope="col" className="catv2-matrix__index"><span className="catv2-visually-hidden">Nr.</span></th>
                <th scope="col">Componentă</th>
                <th scope="col" className="catv2-num"><span className="catv2-matrix__wide">Proprietăți fixe</span><span className="catv2-matrix__narrow">Fixe</span></th>
                <th scope="col" className="catv2-num">La cerere</th>
                <th scope="col" className="catv2-num">Setări</th>
                <th scope="col" className="catv2-num">Formule</th>
                <th scope="col" className="catv2-num">Resurse</th>
                <th scope="col" className="catv2-matrix__links">Legături <span className="catv2-matrix__legend" aria-hidden="true">· → dă · ← primește</span></th>
                <th scope="col" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.component.id} className="catv2-rowlink">
                  <td className="catv2-matrix__index catv2-mono" aria-hidden="true">{componentIndexLabel(row.index)}</td>
                  <th scope="row" className="catv2-matrix__name">
                    <CatalogLink
                      className="catv2-rowlink__target"
                      selection={{ productCode: product.code, componentId: row.component.id, tab: "constructie" }}
                      onNavigate={onNavigate}
                    >
                      {row.component.label}
                    </CatalogLink>
                    {row.component.identity ? <span className="catv2-matrix__identity">{row.component.identity}</span> : null}
                    {!row.component.required ? <span className="catv2-matrix__identity">Opțională</span> : null}
                    <span className="catv2-matrix__phone">{componentCountsText(row.counts)}</span>
                    {row.component.links.length > 0 ? <span className="catv2-matrix__inline-links"><ComponentLinks links={row.component.links} /></span> : null}
                  </th>
                  <td className="catv2-num catv2-figure"><Count value={row.counts.fixed} /></td>
                  <td className="catv2-num catv2-figure"><Count value={row.counts.request} /></td>
                  <td className="catv2-num catv2-figure"><Count value={row.counts.settings} /></td>
                  <td className="catv2-num catv2-figure"><Count value={row.counts.formulas} /></td>
                  <td className="catv2-num catv2-figure"><Count value={row.counts.resources} /></td>
                  <td className="catv2-matrix__links"><ComponentLinks links={row.component.links} /></td>
                  <td className="catv2-chevron" aria-hidden="true">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="catv2-block">
        <div className="catv2-block__head">
          <h3 className="catv2-h3">La nivelul produsului</h3>
        </div>
        <dl className="catv2-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.value}
                {fact.link ? <a className="catv2-link" href="/admin/products">Disponibilitatea produselor <span aria-hidden="true">↗</span></a> : null}
                {fact.note ? <small>{fact.note}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
