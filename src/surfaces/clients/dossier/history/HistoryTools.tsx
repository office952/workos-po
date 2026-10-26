import type { CustomerHistoryModel } from "../../../../adapters/customerDossierAdapter";
import type { BandMode } from "../bandModel";
import { DossierIcon } from "../dossierIcons";
import { countLabel } from "../historyModel";
import type { ListContext } from "../listContext";
import { FilterMenu } from "../FilterMenu";
import { ResultBar } from "../ResultBar";
import { filterChip, type ResultChip } from "../resultBarModel";
import { ALL_LABEL, FILTER_TITLE, historyFilterOptions } from "./filterOptions";

/**
 * Căutare și filtre (Figma 604:8141, căutare 588:8038): the search field with "Șterge", then
 * An · Sediu · Stare · Proveniență on the desktop, or "Filtre" (a sheet) on the tablet and phone.
 * Typing never moves the focus or the field; every change goes through the list context (URL and
 * this client's memory), so a deliberate reset stays a reset.
 */
export function HistoryTools({
  mode,
  data,
  context,
  text,
  setText,
  apply,
  filtered,
  onFilters,
  searchId,
  showCount = true,
}: {
  mode: BandMode;
  data: CustomerHistoryModel | undefined;
  context: ListContext;
  text: string;
  setText: (value: string) => void;
  apply: (patch: Partial<ListContext>) => void;
  filtered: boolean;
  onFilters: () => void;
  searchId: string;
  /** "N din M" next to the filters (588:8038); not when the result line is already above (712:22460). */
  showCount?: boolean;
}) {
  const options = data ? historyFilterOptions(data, context) : null;
  const activeFilters = [context.site, context.state, context.provenance, mode === "desktop" ? context.year : ""].filter(Boolean).length;
  return (
    <div className="htools" role="search">
      <div className="htools__field" data-filled={text ? true : undefined}>
        <label htmlFor={searchId} className="htools__label">
          <DossierIcon name="search" size={15} />
          <span className="u-visually-hidden">Caută în istoric</span>
        </label>
        <input
          id={searchId}
          type="search"
          value={text}
          autoComplete="off"
          placeholder={mode === "phone" ? "Caută în istoric…" : mode === "tablet" ? "Caută în istoric: lucrare, factură, PV…" : "Caută în istoric: lucrare, factură, PV, sediu, fișier…"}
          onChange={(event) => setText(event.target.value)}
        />
        {text ? (
          <button type="button" className="htools__clear" onClick={() => { setText(""); apply({ q: "" }); document.getElementById(searchId)?.focus(); }}>
            <DossierIcon name="close" size={12} />
            Șterge
          </button>
        ) : null}
      </div>
      {mode === "desktop" && options ? (
        <div className="htools__filters">
          <FilterMenu title={FILTER_TITLE.year} allLabel={ALL_LABEL.year} options={options.year} value={context.year} onChange={(value) => apply({ year: value })} />
          {options.site.length ? <FilterMenu title={FILTER_TITLE.site} allLabel={ALL_LABEL.site} options={options.site} value={context.site} onChange={(value) => apply({ site: value })} /> : null}
          <FilterMenu title={FILTER_TITLE.state} allLabel={ALL_LABEL.state} options={options.state} value={context.state} onChange={(value) => apply({ state: value })} />
          <FilterMenu title={FILTER_TITLE.provenance} allLabel={ALL_LABEL.provenance} options={options.provenance} value={context.provenance} onChange={(value) => apply({ provenance: value })} />
          {filtered && data && showCount ? <span className="htools__count" aria-hidden="true">{`${data.total} din ${data.totals.entries}`}</span> : null}
        </div>
      ) : null}
      {mode !== "desktop" ? (
        <button type="button" className="htools__sheet-button" aria-haspopup="dialog" onClick={onFilters} data-active={activeFilters ? true : undefined}>
          {activeFilters ? `Filtre · ${activeFilters}` : "Filtre"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * What the list shows now (R1 · 845:31815; 588:8038, 712:22460): "X din Y intrări" with every
 * active filter as a chip that removes only itself, the search as its own chip, and "Arată toate"
 * for one deliberate reset (a reset is never undone by the memory). Unfiltered it says the whole
 * history and its span. Where the text was found is said on each card, not here.
 */
export function HistoryResultLine({
  data,
  context,
  apply,
  setText,
  pending = false,
  afterChange,
}: {
  data: CustomerHistoryModel;
  context: ListContext;
  apply: (patch: Partial<ListContext>) => void;
  setText: (value: string) => void;
  pending?: boolean;
  afterChange?: () => void;
}) {
  const chips: ResultChip[] = [
    filterChip("year", "An", data.facets.yearCounts.map((item) => ({ value: String(item.year), label: String(item.year) })), context.year, () => apply({ year: "" }), context.year),
    filterChip("site", "Sediu", data.facets.sites.map((site) => ({ value: site.siteId, label: site.name })), context.site, () => apply({ site: "" }), "sediu indisponibil"),
    filterChip("state", "Stare", data.facets.states.map((item) => ({ value: item.state, label: item.label })), context.state, () => apply({ state: "" }), "stare indisponibilă"),
    filterChip("provenance", "Proveniență", data.facets.provenances.map((item) => ({ value: item.provenance, label: item.label })), context.provenance, () => apply({ provenance: "" }), "indisponibilă"),
  ].filter((chip): chip is ResultChip => chip !== null);
  const years = data.facets.yearCounts.filter((item) => item.count > 0).map((item) => item.year);
  const span = years.length > 1 ? `${Math.max(...years)} → ${Math.min(...years)}` : null;
  return (
    <ResultBar
      shown={data.total}
      total={data.totals.entries}
      unit={["intrare", "intrări"]}
      detail={context.q || chips.length ? null : span}
      query={context.q}
      onClearQuery={() => {
        setText("");
        apply({ q: "" });
      }}
      chips={chips}
      onShowAll={() => {
        setText("");
        apply({ q: "", year: "", site: "", state: "", provenance: "" });
      }}
      sort="Cele mai noi întâi"
      pending={pending}
      afterChange={afterChange}
    />
  );
}

/** Tablet and phone (588:7090 / 649:14364): "Salt la an" with each year and its count. */
export function HistoryJumpRow({ years, onYear }: { years: Array<{ year: number; count: number }>; onYear: (year: number) => void }) {
  if (!years.length) return null;
  return (
    <div className="hjump" role="group" aria-label="Salt la an">
      <span className="hjump__label" aria-hidden="true">Salt la an</span>
      {years.map((item) => (
        <button key={item.year} type="button" className="hjump__year" onClick={() => onYear(item.year)} aria-label={`Salt la ${item.year} · ${countLabel(item.count, "intrare", "intrări")}`}>
          {`${item.year} · ${item.count}`}
        </button>
      ))}
    </div>
  );
}
