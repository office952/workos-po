import { countLabel } from "../historyModel";

/**
 * "Salt la an" (Figma 604:8150, căutare 588:8038, derulat 579:6351): every year of the client with
 * its whole count; a year without results for the current search or filters stays in place, dimmed
 * and not selectable. The year in view is marked; "↑ Începutul" appears once the list has moved.
 */
export function HistoryYearRail({
  years,
  present,
  inView,
  onYear,
  onTop,
}: {
  years: Array<{ year: number; count: number }>;
  present: ReadonlySet<number>;
  inView: number | null;
  onYear: (year: number) => void;
  onTop: () => void;
}) {
  if (!years.length) return null;
  const first = years.find((item) => present.has(item.year))?.year ?? null;
  return (
    <nav className="hrail" aria-label="Salt la an">
      <p className="hrail__title" aria-hidden="true">Salt la an</p>
      <ul className="hrail__list">
        {years.map((item) => {
          const has = present.has(item.year);
          return (
            <li key={item.year}>
              <button
                type="button"
                className="hrail__year"
                aria-current={has && inView === item.year ? "true" : undefined}
                disabled={!has}
                data-dim={has ? undefined : true}
                aria-label={has ? `${item.year} · ${countLabel(item.count, "intrare", "intrări")}` : `${item.year} · niciun rezultat pentru căutarea și filtrele curente`}
                onClick={() => onYear(item.year)}
              >
                <span className="hrail__label">{item.year}</span>
                <span className="hrail__count">{item.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {inView !== null && first !== null && inView !== first ? (
        <button type="button" className="hrail__top" onClick={onTop}>
          <span aria-hidden="true">↑</span> Începutul
        </button>
      ) : null}
    </nav>
  );
}
