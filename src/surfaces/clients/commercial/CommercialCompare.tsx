import type { RefObject } from "react";
import { Button } from "../../../components/Button";
import type { TermsConflictRow } from "./termsModel";

/**
 * „Compară cu revizia N” (754:26844; telefon 755:297): only the fields that differ, as the version
 * the reader started from, their draft and the current version. A field both people changed is
 * marked; the note says what resuming keeps and what it takes. Nothing is saved from here.
 */
export function CommercialCompare({
  phone,
  baseRevision,
  current,
  rows,
  label,
  shortLabel,
  show,
  headingRef,
  onResume,
  onTakeCurrent,
  onBack,
}: {
  phone: boolean;
  baseRevision: number;
  current: { revision: number; when: string | null };
  rows: TermsConflictRow[];
  label: (key: string) => string;
  /** The label without its unit, for the sentences ("„Termen de plată” a fost modificat…"). */
  shortLabel: (key: string) => string;
  show: (key: string, value: string) => string;
  headingRef: RefObject<HTMLDivElement | null>;
  onResume: () => void;
  onTakeCurrent: () => void;
  onBack?: () => void;
}) {
  const both = rows.filter((row) => row.mineChanged && row.currentChanged);
  const taken = rows.filter((row) => !row.mineChanged && row.currentChanged);
  const note = [
    ...both.map((row) => `„${shortLabel(row.field)}” a fost modificat și de tine, și de altcineva. La reluare păstrăm valoarea ta (${show(row.field, row.mine)}); verifică-o înainte de salvare.`),
    taken.length ? `${taken.map((row) => `„${shortLabel(row.field)}”`).join(", ")} se ${taken.length === 1 ? "preia" : "preiau"} din revizia ${current.revision}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const value = (key: string, text: string) => show(key, text);

  return (
    <div className="dcom-compare" ref={headingRef} tabIndex={-1} aria-label={`Compară cu revizia ${current.revision}`}>
      {phone ? (
        <>
          <p className="dcom-compare__lead">Doar câmpurile care diferă.</p>
          <ul className="dcom-compare__cards">
            {rows.map((row) => (
              <li key={row.field} data-both={(row.mineChanged && row.currentChanged) || undefined}>
                <p className="dcom-compare__field">{label(row.field)}</p>
                <dl>
                  <div>
                    <dt>{`Revizia ${baseRevision}`}</dt>
                    <dd>{value(row.field, row.before)}</dd>
                  </div>
                  <div>
                    <dt>Ciorna ta</dt>
                    <dd>{row.mineChanged ? value(row.field, row.mine) : "neschimbat de tine"}</dd>
                  </div>
                  <div>
                    <dt>{`Revizia ${current.revision}`}</dt>
                    <dd>{value(row.field, row.current)}</dd>
                  </div>
                </dl>
                {row.mineChanged && row.currentChanged ? <p className="dcom-compare__hint">Modificat și de tine, și de altcineva. La reluare păstrăm valoarea ta; verific-o.</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="dcom-compare__head">
            <h3 className="dcom-title">{`Compară modificările tale cu revizia ${current.revision}`}</h3>
            <p className="dcom-compare__lead">
              {`Ai pornit de la revizia ${baseRevision}. Între timp, altcineva a salvat revizia ${current.revision}${current.when ? ` (${current.when})` : ""}. Sunt afișate doar câmpurile care diferă.`}
            </p>
          </div>
          <table className="dcom-compare__table">
            <thead>
              <tr>
                <th scope="col">Câmp</th>
                <th scope="col">{`Revizia ${baseRevision} (de la care ai pornit)`}</th>
                <th scope="col">Ciorna ta</th>
                <th scope="col">{`Revizia ${current.revision} (salvată de altcineva)`}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} data-both={(row.mineChanged && row.currentChanged) || undefined}>
                  <th scope="row">{label(row.field)}</th>
                  <td>{value(row.field, row.before)}</td>
                  <td>{row.mineChanged ? value(row.field, row.mine) : `${value(row.field, row.mine)} (neschimbat de tine)`}</td>
                  <td>{value(row.field, row.current)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {note ? <p className="dcom-compare__note">{note}</p> : null}
        </>
      )}
      <div className={phone ? "cdos-bar" : "dcom-compare__actions"}>
        <div className="cdos-actions">
          <Button onClick={onResume}>{phone ? `Reia pe revizia ${current.revision} cu modificările mele` : `Reia editarea pe revizia ${current.revision} cu modificările mele`}</Button>
          <Button variant="secondary" onClick={onTakeCurrent}>{phone ? `Folosește revizia ${current.revision}` : `Folosește revizia ${current.revision} și renunță la ale mele`}</Button>
          {onBack ? <Button variant="ghost" onClick={onBack}>Înapoi la formular</Button> : null}
        </div>
      </div>
    </div>
  );
}
