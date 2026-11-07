import type { CommercialJourneyItemTransport, CommercialJourneyTransport } from "../../api/types";
import { journeyItemHref } from "../../presentation/journeyHref";

/**
 * CJ1 · obligations of the request (WorkOS-N 1227:19619): what someone here must resolve, then
 * offers that only wait for the customer. Every item comes from the server journey and only
 * navigates; confirming, deciding or closing happens on the target page.
 */
export function ObligationsPanel({ journey, requestId }: { journey: CommercialJourneyTransport; requestId: string }) {
  const { actionable, waiting } = journey;
  if (actionable.length === 0 && waiting.length === 0) {
    return (
      <section className="obligations obligations--quiet" aria-label="De rezolvat" data-testid="request-obligations">
        <p className="obligations__head">
          <span className="obligations__title">Nimic de rezolvat acum</span>
          <span className="obligations__summary">{journey.offerSummary.summaryLabel}</span>
        </p>
      </section>
    );
  }
  return (
    <section
      className="obligations"
      aria-labelledby="request-obligations-title"
      data-testid="request-obligations"
      data-tone={actionable.length > 0 ? "attention" : "waiting"}
    >
      <p className="obligations__head">
        <span className="obligations__title" id="request-obligations-title">
          {actionable.length > 0 ? `De rezolvat · ${actionable.length}` : "Nimic de rezolvat acum"}
        </span>
        <span className="obligations__summary">{summary(actionable.length, waiting.length)}</span>
      </p>
      <ul className="obligations__list">
        {actionable.map((item) => (
          <Obligation key={item.key} item={item} kind="actionable" href={journeyItemHref(item, requestId)} />
        ))}
        {waiting.map((item) => (
          <Obligation key={item.key} item={item} kind="waiting" href={journeyItemHref(item, requestId)} />
        ))}
      </ul>
    </section>
  );
}

function Obligation({
  item,
  kind,
  href,
}: {
  item: CommercialJourneyItemTransport;
  kind: "actionable" | "waiting";
  href: string;
}) {
  return (
    <li className="obligations__item" data-kind={kind} data-testid={`obligation-${item.kind}`}>
      <span className="obligations__mark" aria-hidden="true" />
      <span className="obligations__text">
        <strong>{item.title}</strong>
        {item.detail ? <span className="obligations__detail">{item.detail}</span> : null}
        {item.hint ? <span className="obligations__hint">{item.hint}</span> : null}
      </span>
      {kind === "actionable" ? (
        <a className="hit obligations__action" href={href}>
          <span className="button button--secondary">
            {item.actionLabel} <span aria-hidden="true">→</span>
          </span>
        </a>
      ) : (
        <a className="text-link obligations__link" href={href}>
          {item.actionLabel} <span aria-hidden="true">→</span>
        </a>
      )}
    </li>
  );
}

function summary(actionable: number, waiting: number): string {
  const own = actionable === 0 ? null : actionable === 1 ? "o acțiune a ta" : `${actionable} acțiuni ale tale`;
  const customer = waiting === 0 ? null : waiting === 1 ? "una în așteptarea clientului" : `${waiting} în așteptarea clientului`;
  return [own, customer].filter(Boolean).join(" · ");
}
