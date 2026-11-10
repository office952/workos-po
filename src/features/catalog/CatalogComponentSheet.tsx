import { useState, type ReactNode } from "react";
import type {
  CatalogCapabilitiesPermissions,
  CatalogComponentLink,
  CatalogPropertyView,
  CatalogWorkspaceProduct,
} from "../../adapters/catalogCapabilitiesAdapter";
import type { ProductSystemType } from "../../adapters/productSystemAdapter";
import { CatalogLink } from "./CatalogLink";
import { catalogAdminHref, type CatalogSelection } from "./catalogSelection";
import { componentIndexLabel, matchesFolded, type CatalogStructureRow } from "./catalogStructure";

type CatalogComponentSheetProps = {
  product: CatalogWorkspaceProduct;
  rows: readonly CatalogStructureRow[];
  row: CatalogStructureRow;
  systemType: ProductSystemType | null;
  permissions: CatalogCapabilitiesPermissions;
  onNavigate: (selection: CatalogSelection) => void;
};

const UNCONFIRMED = "Nu este confirmată de organizație.";

/** Above this many settings the list gets its own search; it stays one flat list. */
const SETTINGS_SEARCH_ABOVE = 8;

function Section({
  id,
  title,
  count,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `catalog-sheet-${id}`;
  return (
    <section className="catv2-block" aria-labelledby={headingId}>
      <div className="catv2-block__head">
        <h3 id={headingId} className="catv2-h3">{title} <span className="catv2-count">{count}</span></h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function requestValues(item: CatalogPropertyView): ReactNode {
  if (item.options.length > 0) {
    return (
      <>
        {item.options.map((option) => option.label).join(" · ")}
        {item.options.filter((option) => option.note).map((option) => (
          <small key={option.label}>{option.label}: {option.note}</small>
        ))}
      </>
    );
  }
  if (item.request?.kind === "text") return "Text liber";
  if (item.request?.kind === "number") return "Număr";
  return "—";
}

function formulaUses(item: CatalogPropertyView): string {
  const parts = [...(item.formula?.uses ?? [])];
  const inputs = item.formula?.workInputCount ?? 0;
  if (inputs > 0) parts.push(inputs === 1 ? "1 valoare de pe lucrare" : `${inputs} valori de pe lucrare`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function versionLabel(version: number | null | undefined): string {
  return version === null || version === undefined ? "—" : `v${version}`;
}

function linkLine(link: CatalogComponentLink): string {
  return link.direction === "gives" ? `Dă ${link.subject} către` : `Primește ${link.subject} de la`;
}

export function CatalogComponentSheet({ product, rows, row, systemType, permissions, onNavigate }: CatalogComponentSheetProps) {
  const [settingQuery, setSettingQuery] = useState("");
  const component = row.component;
  const selection: CatalogSelection = { productCode: product.code, componentId: component.id, tab: "constructie" };
  const settings = component.properties.filter((item) => item.group === "setting");
  const formulas = component.properties.filter((item) => item.group === "formula");
  const fixed = component.properties.filter((item) => item.group === "platform" && item.origin !== "identity");
  const requests = component.properties.filter((item) => item.group === "request");
  const limits = component.properties.filter((item) => item.group === "unsupported");
  const resources = systemType?.resourceReferences ?? [];
  const attributes = systemType?.configurations.find((config) => config.productCode === product.code)?.attributes ?? [];
  const processes = systemType?.processReferences ?? [];
  const previous = rows.find((item) => item.index === row.index - 1) ?? null;
  const next = rows.find((item) => item.index === row.index + 1) ?? null;
  const visibleSettings = settings.filter((item) => matchesFolded(settingQuery, [item.label]));
  const sharedNotes = [...new Set([...settings, ...formulas].flatMap((item) => item.notes.filter((note) => note.startsWith("Valoare comună"))))];
  const organizationValues = [...settings, ...formulas];
  const unconfirmedCount = organizationValues.filter((item) => item.notes.includes(UNCONFIRMED)).length;
  /** One note when nothing is confirmed; a mark on each row when only some values are not. */
  const unconfirmed = unconfirmedCount > 0 && unconfirmedCount === organizationValues.length;
  const mixed = unconfirmedCount > 0 && !unconfirmed;
  const calculation = systemType ? [...systemType.calculationInputs, ...systemType.calculationResults] : [];
  const empty = settings.length + formulas.length + fixed.length + requests.length + resources.length + limits.length === 0;

  return (
    <article className="catv2-sheet" aria-labelledby="catalog-sheet-heading">
      <CatalogLink className="catv2-link catv2-sheet__back" selection={{ productCode: product.code, componentId: null, tab: "constructie" }} onNavigate={onNavigate}>
        <span aria-hidden="true">‹&nbsp;</span>Structură
      </CatalogLink>
      <header className="catv2-sheet__head">
        <div>
          <p className="catv2-sheet__position">
            Componenta {row.index} din {rows.length} · {component.required ? "obligatorie" : "opțională"}
          </p>
          <h2 id="catalog-sheet-heading" className="catv2-sheet__title">{component.label}</h2>
          {component.identity ?? systemType?.label ? <p className="catv2-lead">{component.identity ?? systemType?.label}</p> : null}
        </div>
        <p className="catv2-sheet__pager">
          {previous ? (
            <CatalogLink className="catv2-link" selection={{ productCode: product.code, componentId: previous.component.id, tab: "constructie" }} onNavigate={onNavigate} label={`Componenta anterioară: ${previous.component.label}`}>
              ‹ {componentIndexLabel(previous.index)} {previous.component.label}
            </CatalogLink>
          ) : null}
          {next ? (
            <CatalogLink className="catv2-link" selection={{ productCode: product.code, componentId: next.component.id, tab: "constructie" }} onNavigate={onNavigate} label={`Componenta următoare: ${next.component.label}`}>
              {componentIndexLabel(next.index)} {next.component.label} ›
            </CatalogLink>
          ) : null}
        </p>
      </header>
      <div className="catv2-sheet__body">
        <div className="catv2-sheet__main">
          {empty ? <p className="catv2-empty">Această componentă nu are proprietăți fixe, setări, formule sau resurse proprii.</p> : null}
          {settings.length > 0 ? (
            <Section
              id="settings"
              title="Setări"
              count={settings.length}
              action={(
                <a className="catv2-link" href={catalogAdminHref("/admin/technical", component.typeId, selection)}>
                  {permissions.canEditTechnicalSettings ? "Modifică în Setări tehnice" : "Vezi în Setări tehnice"} <span aria-hidden="true">↗</span>
                </a>
              )}
            >
              {sharedNotes.length > 0 || unconfirmed ? (
                <p className="catv2-block__note">
                  {[unconfirmed ? "Valorile nu sunt încă confirmate de organizație." : null, ...sharedNotes].filter(Boolean).join(" ")}
                </p>
              ) : null}
              {settings.length > SETTINGS_SEARCH_ABOVE ? (
                <div className="catv2-sheet__filter">
                  <label className="catv2-search catv2-search--small">
                    <span className="catv2-visually-hidden">Caută o setare</span>
                    <input type="search" value={settingQuery} placeholder="Caută o setare" onChange={(event) => setSettingQuery(event.target.value)} />
                  </label>
                  <p role="status">{visibleSettings.length} din {settings.length}</p>
                </div>
              ) : null}
              {visibleSettings.length === 0 ? <p className="catv2-empty">Nicio setare nu corespunde căutării.</p> : (
                <table className="catv2-table catv2-sheet__settings">
                  <thead>
                    <tr>
                      <th scope="col">Setare</th>
                      <th scope="col" className="catv2-num">Valoare</th>
                      <th scope="col">Unitate</th>
                      <th scope="col">Versiune</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSettings.map((item) => (
                      <tr key={item.id}>
                        <th scope="row">{item.label}</th>
                        <td className="catv2-num catv2-figure" data-label="Valoare">{item.setting?.amount ?? <span className="catv2-dash">—</span>}</td>
                        <td className="catv2-unit" data-label="Unitate">{item.setting?.unit ?? "—"}</td>
                        <td data-label="Versiune">
                          {item.setting?.amount === null || !item.setting ? (
                            <span className="catv2-tag catv2-tag--unknown">Valoare necitită</span>
                          ) : (
                            <span className="catv2-version">
                              <span className="catv2-mono">{versionLabel(item.setting.version)}</span>
                              {item.setting.sourceLabel ? <small>{item.setting.sourceLabel}</small> : null}
                              {mixed && item.notes.includes(UNCONFIRMED) ? <small>Neconfirmată de organizație</small> : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          ) : null}
          {formulas.length > 0 ? (
            <Section
              id="formulas"
              title="Formule"
              count={formulas.length}
              action={(
                <a className="catv2-link" href={catalogAdminHref("/admin/formulas", component.typeId, selection)}>
                  {permissions.canEditFormulas ? "Deschide în Formule" : "Vezi în Formule"} <span aria-hidden="true">↗</span>
                </a>
              )}
            >
              {settings.length === 0 && (sharedNotes.length > 0 || unconfirmed) ? (
                <p className="catv2-block__note">
                  {[unconfirmed ? "Formulele nu sunt încă confirmate de organizație." : null, ...sharedNotes].filter(Boolean).join(" ")}
                </p>
              ) : null}
              <table className="catv2-table catv2-sheet__formulas">
                <thead>
                  <tr>
                    <th scope="col">Formulă</th>
                    <th scope="col">Folosește</th>
                    <th scope="col">Versiune</th>
                  </tr>
                </thead>
                <tbody>
                  {formulas.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.label}</th>
                      <td data-label="Folosește">{formulaUses(item)}</td>
                      <td data-label="Versiune">
                        {item.formula?.available ? (
                          <span className="catv2-version">
                            <span className="catv2-mono">{versionLabel(item.formula.version)}</span>
                            {item.formula.sourceLabel ? <small>{item.formula.sourceLabel}</small> : null}
                            {mixed && item.notes.includes(UNCONFIRMED) ? <small>Neconfirmată de organizație</small> : null}
                          </span>
                        ) : <span className="catv2-tag catv2-tag--unknown">Formulă necitită</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}
          {calculation.length > 0 ? (
            <details className="catv2-calc">
              <summary>Cum se calculează <span className="catv2-count">{calculation.length}</span></summary>
              <dl>
                {calculation.map((line) => (
                  <div key={`${line.label}:${line.value}`}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
          {fixed.length > 0 ? (
            <Section id="fixed" title="Proprietăți fixe" count={fixed.length}>
              <table className="catv2-table catv2-sheet__triple">
                <thead>
                  <tr>
                    <th scope="col">Proprietate</th>
                    <th scope="col">Valoare</th>
                    <th scope="col">Stabilită de</th>
                  </tr>
                </thead>
                <tbody>
                  {fixed.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.label}</th>
                      <td data-label="Valoare">{item.value ?? item.notes.join(" ")}</td>
                      <td data-label="Stabilită de" className="catv2-secondary">{attributes.find((attribute) => attribute.id !== null && attribute.id === item.ref)?.ownershipLabel ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}
          {requests.length > 0 ? (
            <Section id="request" title="Se stabilește la cerere" count={requests.length}>
              <table className="catv2-table catv2-sheet__triple">
                <thead>
                  <tr>
                    <th scope="col">Câmp</th>
                    <th scope="col">Valori posibile</th>
                    <th scope="col">Când se cere</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        {item.label}
                        {item.request?.required === false ? <small className="catv2-optional">Opțional pe lucrare</small> : null}
                      </th>
                      <td data-label="Valori posibile" className="catv2-secondary">{requestValues(item)}</td>
                      <td data-label="Când se cere" className="catv2-secondary">
                        {item.request && item.request.conditions.length > 0 ? item.request.conditions.join(" ") : "Întotdeauna"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}
          {resources.length > 0 ? (
            <Section
              id="resources"
              title="Resurse"
              count={resources.length}
              action={<a className="catv2-link" href="/admin/resources">Vezi în Resurse <span aria-hidden="true">↗</span></a>}
            >
              <p className="catv2-block__note">Referințe din definiție, fără tarife.</p>
              <ul className="catv2-list">
                {resources.map((item) => <li key={item.id}>{item.label}</li>)}
              </ul>
            </Section>
          ) : null}
          {limits.length > 0 ? (
            <Section id="limits" title="Limite cunoscute" count={limits.length}>
              <ul className="catv2-list">
                {limits.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>
                    <small>{item.notes.join(" ")}</small>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {!empty && settings.length === 0 && formulas.length === 0 ? (
            <p className="catv2-footnote">{component.label} nu are setări tehnice sau formule proprii.</p>
          ) : null}
          {component.requestGap && requests.length === 0 && !empty ? <p className="catv2-footnote">{component.requestGap}</p> : null}
          {systemType?.gaps.length ? (
            <p className="catv2-notice" role="status"><strong>De completat în definiție.</strong> {systemType.gaps.join(" ")}</p>
          ) : null}
        </div>
        <aside className="catv2-sheet__aside" aria-label="În produs">
          {component.links.length > 0 ? (
            <div className="catv2-aside-block">
              <h3>Legături</h3>
              {component.links.map((link) => (
                <p key={`${link.direction}:${link.componentId}`}>
                  {linkLine(link)}{" "}
                  <CatalogLink className="catv2-link" selection={{ productCode: product.code, componentId: link.componentId, tab: "constructie" }} onNavigate={onNavigate}>
                    {componentIndexLabel(link.componentIndex)} {link.componentLabel}
                  </CatalogLink>
                </p>
              ))}
            </div>
          ) : null}
          {systemType?.measurement ? (
            <div className="catv2-aside-block">
              <h3>Măsurare</h3>
              <p>{systemType.measurement}{systemType.quantity ? `. Cantitate: ${systemType.quantity}.` : ""}</p>
            </div>
          ) : null}
          {processes.length > 0 ? (
            <div className="catv2-aside-block">
              <h3>Operații în proces · {processes.length}</h3>
              <ul className="catv2-aside-list">
                {processes.map((item) => <li key={item.id}>{item.label}</li>)}
              </ul>
              <CatalogLink className="catv2-link" selection={{ productCode: product.code, componentId: null, tab: "proces" }} onNavigate={onNavigate}>
                Vezi procesul tehnologic
              </CatalogLink>
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
