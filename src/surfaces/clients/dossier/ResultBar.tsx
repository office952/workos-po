import { DossierIcon } from "./dossierIcons";
import { wholeList, type ResultChip } from "./resultBarModel";

/**
 * R1 · Bara de rezultat (Figma 845:31815): what the list shows now. Complete, it says the whole
 * list and its order. Filtered (or searched), it says "X din Y · filtrate", names every active
 * filter as a chip that removes only itself, and offers "Arată toate cele Y" — the same on the
 * desktop and the phone, at zero results and after coming back. While a new answer is on its way,
 * the previous numbers are marked "Se actualizează…" instead of being presented as the new result.
 * Readers hear one sentence (the count, then each filter); the styled line is for the eye.
 */
export function ResultBar({
  shown,
  total,
  unit,
  detail = null,
  query = "",
  onClearQuery,
  chips,
  onShowAll,
  sort = null,
  pending = false,
  afterChange,
}: {
  shown: number;
  total: number;
  /** The noun: [singular, plural]. */
  unit: readonly [string, string];
  /** What the count is made of, after the number ("5 grupuri"). */
  detail?: string | null;
  query?: string;
  onClearQuery?: () => void;
  chips: readonly ResultChip[];
  /** Clears the search and every filter. */
  onShowAll: () => void;
  sort?: string | null;
  pending?: boolean;
  /** Where the focus goes once a chip or the reset has removed the control that had it. */
  afterChange?: () => void;
}) {
  const filtered = Boolean(query) || chips.length > 0;
  const then = (action: () => void) => () => {
    action();
    afterChange?.();
  };
  const noun = total === 1 ? unit[0] : unit[1];
  const count = filtered ? `${shown} din ${total} ${noun}${query ? ` pentru „${query}”` : ""}${detail ? ` · ${detail}` : ""}` : `${wholeList(total, unit)}${detail ? ` · ${detail}` : ""}`;
  const announced = (
    <p className="u-visually-hidden" role="status" aria-live="polite">
      <span>{count}</span>
      {chips.map((chip) => (
        <span key={chip.key}>
          <span>{" · "}</span>
          <span>{`${chip.label}: ${chip.value}`}</span>
        </span>
      ))}
      {pending ? <span>{" · se actualizează"}</span> : null}
    </p>
  );
  if (!filtered) {
    return (
      <div className="rbar" data-state="complete" data-pending={pending || undefined}>
        {announced}
        <p className="rbar__summary" aria-hidden="true">
          {wholeList(total, unit)}
          {detail ? <span className="rbar__detail">{` · ${detail}`}</span> : null}
          {pending ? <span className="rbar__pending">Se actualizează…</span> : null}
        </p>
        {sort ? <p className="rbar__sort">{sort}</p> : null}
      </div>
    );
  }
  return (
    <div className="rbar" data-state={shown === 0 ? "zero" : "filtered"} data-pending={pending || undefined}>
      {announced}
      <span className="rbar__badge" aria-hidden="true">
        <DossierIcon name="filter" size={14} />
      </span>
      <p className="rbar__summary" aria-hidden="true">
        <strong className="rbar__shown">{shown}</strong>
        {` din ${total} ${noun}`}
        {detail ? <span className="rbar__detail">{` · ${detail}`}</span> : null}
        <span className="rbar__tag">{pending ? " · se actualizează…" : " · filtrate"}</span>
      </p>
      <ul className="rbar__chips" aria-label="Filtre active">
        {query && onClearQuery ? (
          <li>
            <span className="rbar__chip">
              <span className="rbar__chip-label" aria-hidden="true">Căutare:</span>
              <span className="rbar__chip-value" aria-hidden="true">{`„${query}”`}</span>
              <button type="button" className="rbar__chip-remove" aria-label={`Elimină căutarea „${query}”`} onClick={then(onClearQuery)}>
                <DossierIcon name="close" size={12} />
              </button>
            </span>
          </li>
        ) : null}
        {chips.map((chip) => (
          <li key={chip.key}>
            <span className="rbar__chip">
              <span className="rbar__chip-label" aria-hidden="true">{`${chip.label}:`}</span>
              <span className="rbar__chip-value" aria-hidden="true">{chip.value}</span>
              <button type="button" className="rbar__chip-remove" aria-label={`Elimină filtrul ${chip.label}: ${chip.value}`} onClick={then(chip.onRemove)}>
                <DossierIcon name="close" size={12} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="rbar__all" onClick={then(onShowAll)}>
        {total === 1 ? "Arată tot" : `Arată toate cele ${total}`}
        <DossierIcon name="right" size={13} />
      </button>
    </div>
  );
}
