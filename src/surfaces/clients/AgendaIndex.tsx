import type { DeskLayout } from "../desk/useDeskLayout";
import { jumpToLetter } from "./agendaAnchors";
import { ALPHABET, OTHER_LETTER } from "./clientsAgendaModel";

/**
 * The agenda index. Desktop and tablet show the whole alphabet, letters without clients
 * stay visible but inactive. The phone shows only the letters in the list, wrapping, so
 * every one stays reachable without horizontal scrolling.
 */
export function AgendaIndex({ letters, layout }: { letters: readonly string[]; layout: DeskLayout }) {
  const present = new Set(letters);
  const shown = layout === "full" ? letters : [...ALPHABET, ...(present.has(OTHER_LETTER) ? [OTHER_LETTER] : [])];
  return (
    <nav className="cagenda" data-layout={layout} aria-label="Index alfabetic al clienților">
      <span className="cagenda__label" aria-hidden="true">Index</span>
      <ul className="cagenda__letters">
        {shown.map((letter) => {
          const active = present.has(letter);
          return (
            <li key={letter}>
              <button
                type="button"
                className="cagenda__letter"
                data-present={active || undefined}
                disabled={!active}
                aria-label={active ? `Clienți la litera ${letter}` : `Niciun client la litera ${letter}`}
                onClick={() => jumpToLetter(letter)}
              >
                {letter}
              </button>
            </li>
          );
        })}
      </ul>
      {layout === "docked" ? <span className="cagenda__hint" aria-hidden="true">Agendă alfabetică · literă = salt la grupă</span> : null}
    </nav>
  );
}
