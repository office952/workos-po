import type {
  FrozenRateAcknowledgementTransport,
  RateAcknowledgementTransport,
  UnconfirmedRateTransport,
} from "../api/types";
import { InlineAlert } from "../components/InlineAlert";
import { formatMoney, formatTimestamp } from "./format";

type RateAcknowledgementNoticeProps = {
  requirement: RateAcknowledgementTransport;
  acknowledged: boolean;
  disabled: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
};

const COLLAPSE_AFTER = 3;

function rateAmountLabel(rate: UnconfirmedRateTransport): string | null {
  if (rate.amount === null) {
    return null;
  }
  const money = formatMoney(rate.amount, rate.currency ?? "EUR");
  return rate.unitLabel ? `${money} / ${rate.unitLabel}` : money;
}

function RateItems({
  rates,
  sharedReason,
}: {
  rates: readonly UnconfirmedRateTransport[];
  sharedReason: string | null;
}) {
  return (
    <ul className="cost-issue-list rate-ack-list" data-testid="unconfirmed-rate-list">
      {rates.map((rate) => {
        const amount = rateAmountLabel(rate);
        return (
          <li key={`${rate.resourceId}:${rate.context ?? ""}`} className="cost-issue-list__item">
            <p>
              <span className="cost-issue-list__label">{rate.label}</span>
              {rate.context ? ` · ${rate.context}` : ""}
              {amount ? ` · ${amount}` : ""}
            </p>
            {sharedReason === null ? <p>{rate.reason}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function UnconfirmedRateList({ rates }: { rates: readonly UnconfirmedRateTransport[] }) {
  const reasons = new Set(rates.map((rate) => rate.reason));
  const sharedReason = reasons.size === 1 ? (rates[0]?.reason ?? null) : null;
  const items = <RateItems rates={rates} sharedReason={sharedReason} />;
  return (
    <div className="rate-ack-rates">
      {sharedReason ? <p>{sharedReason}.</p> : null}
      {rates.length > COLLAPSE_AFTER ? (
        <details>
          <summary>Vezi cele {rates.length} tarife neconfirmate</summary>
          {items}
        </details>
      ) : (
        items
      )}
    </div>
  );
}

export function FrozenRateAcknowledgementNotice({
  acknowledgement,
}: {
  acknowledgement: FrozenRateAcknowledgementTransport;
}) {
  return (
    <div data-testid="frozen-rate-acknowledgement">
      <InlineAlert tone="pending" title="Tarife neconfirmate acceptate">
        <p>
          Prețul acestei oferte folosește tarife neconfirmate, acceptate explicit la{" "}
          {formatTimestamp(acknowledgement.acknowledgedAt)}. Acceptarea nu a confirmat tariful
          firmei.
        </p>
        <UnconfirmedRateList rates={acknowledgement.rates} />
      </InlineAlert>
    </div>
  );
}

export function RateAcknowledgementNotice({
  requirement,
  acknowledged,
  disabled,
  onAcknowledgedChange,
}: RateAcknowledgementNoticeProps) {
  if (requirement.status === "DISCLOSURE_ONLY") {
    return (
      <InlineAlert tone="pending" title="Tarife neconfirmate în costul intern">
        <p>
          Prețul clientului este introdus manual. Tarifele de mai jos influențează doar costul
          intern, nu prețul clientului.
        </p>
        <UnconfirmedRateList rates={requirement.rates} />
      </InlineAlert>
    );
  }
  return (
    <div data-testid="rate-acknowledgement">
      <InlineAlert tone="blocked" title="Prețul clientului folosește tarife neconfirmate">
        <p>
          Prețul este calculat din costul intern, iar tarifele de mai jos nu sunt confirmate de
          firmă. Acceptarea se aplică doar acestei oferte și nu confirmă tariful firmei.
        </p>
        <UnconfirmedRateList rates={requirement.rates} />
        {requirement.canAcknowledge ? (
          <p>
            <a className="text-link" href="/admin/resources">
              Deschide Dovezi de cost
            </a>
          </p>
        ) : null}
        {requirement.canAcknowledge && requirement.bindingHash !== null ? (
          <label
            className={`choice-card${acknowledged ? " choice-card--selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={disabled}
              onChange={(event) => {
                onAcknowledgedChange(event.target.checked);
              }}
            />
            <span>
              <p className="choice-card__title">
                Am verificat tarifele neconfirmate și le accept pentru această ofertă
              </p>
              <p className="choice-card__copy">
                Cine a acceptat și când se păstrează în oferta înghețată.
              </p>
            </span>
          </label>
        ) : !requirement.canAcknowledge ? (
          <p>
            Tarifele neconfirmate pot fi acceptate doar de un utilizator cu acces financiar.
            Cere-i să verifice oferta înainte de înghețare.
          </p>
        ) : null}
      </InlineAlert>
    </div>
  );
}
