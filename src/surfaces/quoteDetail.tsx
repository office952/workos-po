import { useId, type ReactNode } from "react";
import { formatMoney } from "../presentation/format";

export type QuoteTotal = {
  netPrice: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  grossPrice: number | null;
  currency: string;
};

export type QuoteFact = { label: string; value: ReactNode };

type QuoteSummaryProps = {
  total: QuoteTotal | null;
  unavailableNote: string;
  facts: QuoteFact[];
  actions?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
};

function money(value: number | null, currency: string): string {
  return value === null ? "—" : formatMoney(value, currency);
}

function vatLabel(total: QuoteTotal): string {
  return total.vatPercent === null ? "TVA" : `TVA ${total.vatPercent}%`;
}

/** Identity-adjacent commercial strip: the customer total is visible before any section detail. */
export function QuoteSummary({ total, unavailableNote, facts, actions, note, children }: QuoteSummaryProps) {
  return (
    <section className="offers-summary" aria-label="Rezumat comercial">
      <div className="offers-summary__total" data-testid="quote-total">
        <p className="offers-summary__label">Total cu TVA</p>
        {total && total.grossPrice !== null ? (
          <>
            <p className="offers-summary__value">{formatMoney(total.grossPrice, total.currency)}</p>
            <p className="offers-summary__split">
              <span>Net {money(total.netPrice, total.currency)}</span>
              <span>
                {vatLabel(total)} {money(total.vatAmount, total.currency)}
              </span>
            </p>
          </>
        ) : (
          <p className="offers-summary__unavailable">{unavailableNote}</p>
        )}
      </div>
      <dl className="offers-summary__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {actions || note ? (
        <div className="offers-summary__actions">
          {actions}
          {note ? <p className="offers-summary__note">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type QuoteLine = {
  key: string;
  title: string;
  detail: string | null;
  netPrice: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  grossPrice: number | null;
  currency: string;
};

type QuoteLinesProps = {
  caption: string;
  lines: QuoteLine[];
  total: QuoteTotal | null;
  /** Lines carry only net values when the frozen quote applies VAT on the total. */
  lineTax: boolean;
};

/** Sections stay separate rows: each product keeps its own net, VAT and total. */
export function QuoteLines({ caption, lines, total, lineTax }: QuoteLinesProps) {
  const headingId = useId();
  return (
    <section className="offers-lines" aria-labelledby={headingId}>
      <h2 className="offers-lines__title" id={headingId}>{caption}</h2>
      <table className="offers-lines__table" data-tax={lineTax ? "line" : "total"} aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Secțiune</th>
            <th scope="col" className="offers-lines__num">Net</th>
            {lineTax ? <th scope="col" className="offers-lines__num">TVA</th> : null}
            {lineTax ? <th scope="col" className="offers-lines__num">Total</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} aria-label={line.title}>
              <th scope="row">
                <span className="offers-lines__name">{line.title}</span>
                {line.detail ? <span className="offers-lines__detail">{line.detail}</span> : null}
              </th>
              <td className="offers-lines__num" data-label="Net">{money(line.netPrice, line.currency)}</td>
              {lineTax ? (
                <td className="offers-lines__num" data-label="TVA">
                  {line.vatPercent === null ? null : <span className="offers-lines__rate">{line.vatPercent}%</span>}
                  {money(line.vatAmount, line.currency)}
                </td>
              ) : null}
              {lineTax ? (
                <td className="offers-lines__num offers-lines__gross" data-label="Total">
                  {money(line.grossPrice, line.currency)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr>
              <th scope="row">Total ofertă</th>
              <td className="offers-lines__num" data-label="Net">{money(total.netPrice, total.currency)}</td>
              {lineTax ? (
                <td className="offers-lines__num" data-label="TVA">{money(total.vatAmount, total.currency)}</td>
              ) : null}
              {lineTax ? (
                <td className="offers-lines__num offers-lines__gross" data-label="Total">
                  {money(total.grossPrice, total.currency)}
                </td>
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </section>
  );
}

export type QuoteRelation = { key: string; label: string; detail: string | null; href: string; action: string };

/** Related records close the page: request, customer, assembly and order each open their own surface. */
export function QuoteRelations({ relations, note }: { relations: QuoteRelation[]; note: string }) {
  return (
    <nav className="offers-relations" aria-label="Legături ofertă">
      <h2 className="offers-lines__title">Legături</h2>
      <p className="offers-relations__note">{note}</p>
      {relations.length > 0 ? (
        <ul>
          {relations.map((relation) => (
            <li key={relation.key}>
              <span className="offers-relations__label">{relation.label}</span>
              {relation.detail ? <span className="offers-relations__detail">{relation.detail}</span> : null}
              <a className="offers-next offers-next--quiet" href={relation.href}>
                <span>{relation.action}</span>
                <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
