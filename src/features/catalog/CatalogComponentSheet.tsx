import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  CatalogCapabilitiesPermissions,
  CatalogComponentLink,
  CatalogPropertyView,
  CatalogWorkspaceProduct,
} from "../../adapters/catalogCapabilitiesAdapter";
import type { ProductSystemType } from "../../adapters/productSystemAdapter";
import { presentFormulasAdmin } from "../../adapters/formulasAdapter";
import { fetchFormulas } from "../../api/formulas";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { useResource } from "../../data/useResource";
import { CatalogLink } from "./CatalogLink";
import { catalogAdminHref, type CatalogSelection } from "./catalogSelection";
import { CatalogInspectorPanel } from "./CatalogInspectorPanel";
import { catalogInspectorCloseLabel, useCatalogInspectorLayout } from "./catalogInspectorLayout";
import {
  buildCatalogInspectorModel,
  inspectableProperties,
  requestAvailabilityLabel,
  type CatalogInspectorAction,
  type CatalogInspectorFormulaRead,
  type CatalogInspectorSession,
} from "./catalogPropertyInspector";
import { componentIndexLabel, matchesFolded, type CatalogStructureRow } from "./catalogStructure";

type CatalogComponentSheetProps = {
  product: CatalogWorkspaceProduct;
  rows: readonly CatalogStructureRow[];
  row: CatalogStructureRow;
  systemType: ProductSystemType | null;
  permissions: CatalogCapabilitiesPermissions;
  inspector: CatalogInspectorSession;
  onInspectorChange: (next: CatalogInspectorSession) => void;
  onNavigate: (selection: CatalogSelection) => void;
};

const UNCONFIRMED = "Nu este confirmată de organizație.";
const SETTINGS_SEARCH_ABOVE = 8;
const ALLOWED_REFERENCES_HEADING = "Referințe permise";

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

async function loadFormulasAdmin() {
  const model = presentFormulasAdmin(await fetchFormulas());
  if (!model) throw new Error("unpresentable_formulas");
  return model;
}

export function CatalogComponentSheet({
  product,
  rows,
  row,
  systemType,
  permissions,
  inspector,
  onInspectorChange,
  onNavigate,
}: CatalogComponentSheetProps) {
  const layout = useCatalogInspectorLayout();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreScroll = useRef(0);
  const component = row.component;
  const selection: CatalogSelection = { productCode: product.code, componentId: component.id, tab: "constructie" };
  const settings = component.properties.filter((item) => item.group === "setting");
  const formulas = component.properties.filter((item) => item.group === "formula");
  const fixed = component.properties.filter((item) => item.group === "platform" && item.origin !== "identity");
  const requests = component.properties.filter((item) => item.group === "request");
  const limits = component.properties.filter((item) => item.group === "unsupported");
  const resources = systemType?.resourceReferences ?? [];
  const attributes = systemType?.configurations.find((config) => config.productCode === product.code)?.attributes ?? [];
  const previous = rows.find((item) => item.index === row.index - 1) ?? null;
  const next = rows.find((item) => item.index === row.index + 1) ?? null;
  const [settingQuery, setSettingQuery] = useState("");
  const visibleSettings = settings.filter((item) => matchesFolded(settingQuery, [item.label]));
  const sharedNotes = [...new Set([...settings, ...formulas].flatMap((item) => item.notes.filter((note) => note.startsWith("Valoare comună"))))];
  const organizationValues = [...settings, ...formulas];
  const unconfirmedCount = organizationValues.filter((item) => item.notes.includes(UNCONFIRMED)).length;
  const unconfirmed = unconfirmedCount > 0 && unconfirmedCount === organizationValues.length;
  const mixed = unconfirmedCount > 0 && !unconfirmed;
  const calculation = systemType ? [...systemType.calculationInputs, ...systemType.calculationResults] : [];
  const empty = settings.length + formulas.length + fixed.length + requests.length + resources.length + limits.length === 0;
  const selected = inspectableProperties(component).find((item) => item.id === inspector.selectedId) ?? null;
  const inspectorOpen = inspector.open && selected !== null;
  const formulaKey = inspectorOpen && selected?.formula?.formulaId ? resourceKeys.formulasAdmin() : null;
  const formulasAdmin = useResource(formulaKey, loadFormulasAdmin);
  const formulaRead = inspectorOpen ? formulaReadFrom(formulasAdmin, selected) : { status: "idle" as const };
  const ownershipLabel = selected
    ? attributes.find((attribute) => attribute.id !== null && attribute.id === selected.ref)?.ownershipLabel ?? (selected.group === "platform" ? "Fixat de produs" : null)
    : null;
  const model = selected
    ? buildCatalogInspectorModel({
        item: selected,
        component,
        product,
        rows: rows.map((item) => ({ id: item.component.id, index: item.index })),
        selection,
        permissions,
        ownershipLabel,
        formula: formulaRead,
      })
    : null;

  useEffect(() => {
    if (!inspectorOpen || layout !== "docked") return;
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onInspectorChange({ ...inspector, open: false });
      const id = inspector.selectedId;
      requestAnimationFrame(() => {
        if (id) rowRefs.current.get(id)?.focus();
      });
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [inspector, inspectorOpen, layout, onInspectorChange]);

  function setRowRef(id: string, node: HTMLButtonElement | null) {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }

  function selectProperty(id: string) {
    onInspectorChange({ ...inspector, selectedId: id, open: true });
  }

  function closeInspector() {
    onInspectorChange({ ...inspector, open: false });
    const id = inspector.selectedId;
    requestAnimationFrame(() => {
      if (id) rowRefs.current.get(id)?.focus();
      if (layout === "full") window.scrollTo(0, restoreScroll.current);
    });
  }

  function openInspector(id: string) {
    if (layout === "full") restoreScroll.current = window.scrollY;
    selectProperty(id);
  }

  function onAction(action: CatalogInspectorAction) {
    switch (action.kind) {
      case "show-property":
        selectProperty(action.propertyId);
        return;
      case "open-component":
        onInspectorChange({
          selectedId: null,
          open: false,
          returnTo: selected
            ? { componentId: component.id, propertyId: selected.id, title: `${component.label} · ${selected.label}` }
            : inspector.returnTo,
        });
        onNavigate({ productCode: product.code, componentId: action.componentId, tab: "constructie" });
        return;
      case "admin":
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }

  function returnToProperty() {
    const target = inspector.returnTo;
    if (!target) return;
    onInspectorChange({ selectedId: target.propertyId, open: true, returnTo: null });
    onNavigate({ productCode: product.code, componentId: target.componentId, tab: "constructie" });
  }

  function onTableKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button.catv2-sheet__rowbtn")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
    buttons[nextIndex]?.focus();
  }

  const inProduct = (
    <InProduct
      product={product}
      row={row}
      systemType={systemType}
      highlightReturn={Boolean(inspector.returnTo)}
      returnTo={inspector.returnTo}
      onReturn={returnToProperty}
      onNavigate={onNavigate}
    />
  );
  const inspectorNode = model && inspectorOpen ? (
    <CatalogInspectorPanel
      model={model}
      layout={layout}
      closeLabel={catalogInspectorCloseLabel(layout, component.label)}
      onClose={closeInspector}
      onAction={onAction}
      onRetryFormula={formulaRead.status === "error" ? () => invalidateResources(resourceKeys.formulasAdmin()) : undefined}
    >
      {layout === "docked" ? (
        <>
          <hr className="catv2-inspector__rule" />
          <p className="catv2-inspector__component">Componenta {component.label}</p>
          {inProduct}
        </>
      ) : null}
    </CatalogInspectorPanel>
  ) : null;

  return (
    <article
      className="catv2-sheet"
      aria-labelledby="catalog-sheet-heading"
      data-inspector={layout === "full" && inspectorOpen ? "full" : undefined}
    >
      {layout === "full" && inspectorOpen ? inspectorNode : (
        <>
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
                    <PropertyTable
                      className="catv2-sheet__settings"
                      selectedId={inspector.selectedId}
                      onSelect={openInspector}
                      onTableKeyDown={onTableKeyDown}
                      setRowRef={setRowRef}
                      columns={["Setare", "Valoare", "Unitate", "Versiune"]}
                      rows={visibleSettings.map((item) => ({
                        item,
                        cells: [
                          { label: "Valoare", content: item.setting?.amount ?? <span className="catv2-dash">—</span>, className: "catv2-num catv2-figure" },
                          { label: "Unitate", content: item.setting?.unit ?? "—", className: "catv2-unit" },
                          {
                            label: "Versiune",
                            content: item.setting?.amount === null || !item.setting
                              ? <span className="catv2-tag catv2-tag--unknown">Valoare necitită</span>
                              : (
                                <span className="catv2-version">
                                  <span className="catv2-mono">{versionLabel(item.setting.version)}</span>
                                  {item.setting.sourceLabel ? <small>{item.setting.sourceLabel}</small> : null}
                                  {mixed && item.notes.includes(UNCONFIRMED) ? <small>Neconfirmată de organizație</small> : null}
                                </span>
                              ),
                          },
                        ],
                      }))}
                    />
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
                  <PropertyTable
                    className="catv2-sheet__formulas"
                    selectedId={inspector.selectedId}
                    onSelect={openInspector}
                    onTableKeyDown={onTableKeyDown}
                    setRowRef={setRowRef}
                    columns={["Formulă", ALLOWED_REFERENCES_HEADING, "Versiune"]}
                    rows={formulas.map((item) => ({
                      item,
                      cells: [
                        { label: ALLOWED_REFERENCES_HEADING, content: formulaUses(item) },
                        {
                          label: "Versiune",
                          content: item.formula?.available ? (
                            <span className="catv2-version">
                              <span className="catv2-mono">{versionLabel(item.formula.version)}</span>
                              {item.formula.sourceLabel ? <small>{item.formula.sourceLabel}</small> : null}
                              {mixed && item.notes.includes(UNCONFIRMED) ? <small>Neconfirmată de organizație</small> : null}
                            </span>
                          ) : <span className="catv2-tag catv2-tag--unknown">Formulă necitită</span>,
                        },
                      ],
                    }))}
                  />
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
                  <PropertyTable
                    className="catv2-sheet__triple"
                    selectedId={inspector.selectedId}
                    onSelect={openInspector}
                    onTableKeyDown={onTableKeyDown}
                    setRowRef={setRowRef}
                    columns={["Proprietate", "Valoare", "Stabilită de"]}
                    rows={fixed.map((item) => ({
                      item,
                      cells: [
                        { label: "Valoare", content: item.value ?? item.notes.join(" ") },
                        { label: "Stabilită de", content: attributes.find((attribute) => attribute.id !== null && attribute.id === item.ref)?.ownershipLabel ?? "—", className: "catv2-secondary" },
                      ],
                    }))}
                  />
                </Section>
              ) : null}
              {requests.length > 0 ? (
                <Section id="request" title="Se stabilește la cerere" count={requests.length}>
                  <PropertyTable
                    className="catv2-sheet__triple"
                    selectedId={inspector.selectedId}
                    onSelect={openInspector}
                    onTableKeyDown={onTableKeyDown}
                    setRowRef={setRowRef}
                    columns={["Câmp", "Valori posibile", "Când se cere"]}
                    rows={requests.map((item) => ({
                      item,
                      extra: item.request?.required === false ? <small className="catv2-optional">Opțional pe lucrare</small> : null,
                      cells: [
                        { label: "Valori posibile", content: requestValues(item), className: "catv2-secondary" },
                        { label: "Când se cere", content: requestAvailabilityLabel(item), className: "catv2-secondary" },
                      ],
                    }))}
                  />
                </Section>
              ) : null}
              {resources.length > 0 ? (
                <Section
                  id="resources"
                  title="Resurse"
                  count={resources.length}
                  action={<a className="catv2-link" href="/admin/resources">Vezi costurile de producție <span aria-hidden="true">↗</span></a>}
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
              {layout === "docked" && inspectorOpen ? inspectorNode : inProduct}
            </aside>
          </div>
          {layout === "overlay" && inspectorOpen ? inspectorNode : null}
        </>
      )}
    </article>
  );
}

function formulaReadFrom(
  snapshot: ReturnType<typeof useResource<Awaited<ReturnType<typeof loadFormulasAdmin>>>>,
  selected: CatalogPropertyView | null,
): CatalogInspectorFormulaRead {
  if (!selected?.formula?.formulaId) return { status: "idle" };
  switch (snapshot.status) {
    case "idle":
    case "loading":
      return { status: "loading" };
    case "error":
      return { status: "error" };
    case "success": {
      const formula = snapshot.data?.formulas.find((item) => item.formulaId === selected.formula?.formulaId);
      return { status: "ready", explanation: formula?.explanation ?? null };
    }
    default: {
      const exhaustive: never = snapshot.status;
      return exhaustive;
    }
  }
}

type PropertyCell = {
  label: string;
  content: ReactNode;
  className?: string;
};

function PropertyTable({
  className,
  columns,
  rows,
  selectedId,
  onSelect,
  onTableKeyDown,
  setRowRef,
}: {
  className: string;
  columns: string[];
  rows: { item: CatalogPropertyView; cells: PropertyCell[]; extra?: ReactNode }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTableKeyDown: (event: KeyboardEvent<HTMLTableElement>) => void;
  setRowRef: (id: string, node: HTMLButtonElement | null) => void;
}) {
  return (
    <table className={`catv2-table ${className}`} onKeyDown={onTableKeyDown}>
      <thead>
        <tr>
          {columns.map((column) => <th key={column} scope="col">{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, cells, extra }) => {
          const selected = selectedId === item.id;
          return (
            <tr key={item.id} data-selected={selected ? "true" : undefined} aria-selected={selected}>
              <th scope="row">
                <button
                  ref={(node) => setRowRef(item.id, node)}
                  type="button"
                  className="catv2-sheet__rowbtn"
                  aria-pressed={selected}
                  onClick={() => onSelect(item.id)}
                >
                  <span>
                    {item.label}
                    {extra}
                  </span>
                  <span className="catv2-sheet__chevron" aria-hidden="true">›</span>
                </button>
              </th>
              {cells.map((cell) => (
                <td key={cell.label} data-label={cell.label} className={cell.className}>
                  {cell.content}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InProduct({
  product,
  row,
  systemType,
  highlightReturn,
  returnTo,
  onReturn,
  onNavigate,
}: {
  product: CatalogWorkspaceProduct;
  row: CatalogStructureRow;
  systemType: ProductSystemType | null;
  highlightReturn: boolean;
  returnTo: CatalogInspectorSession["returnTo"];
  onReturn: () => void;
  onNavigate: (selection: CatalogSelection) => void;
}) {
  const component = row.component;
  const processes = systemType?.processReferences ?? [];
  return (
    <>
      {returnTo ? (
        <div className="catv2-aside-block">
          <button type="button" className="catv2-link catv2-inspector__action" onClick={onReturn}>
            ‹ Înapoi la {returnTo.title}
          </button>
        </div>
      ) : null}
      {component.links.length > 0 ? (
        <div className={`catv2-aside-block${highlightReturn ? " catv2-aside-block--marked" : ""}`}>
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
    </>
  );
}
