import { useState } from "react";
import { presentJournal, type JournalItem, type QuoteVariantView } from "../../adapters/quoteVariantAdapter";
import { readTransportReasons } from "../../api/http";
import { appendRequestJournalEntry, fetchRequestJournal } from "../../api/quoteVariants";
import { Button } from "../../components/Button";
import { InlineAlert } from "../../components/InlineAlert";
import { invalidateResources } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { formatTimestamp } from "../../presentation/format";
import { requestJournalKey } from "./requestVariantsData";
import "../../styles/surfaces/quote-variant.css";

/**
 * Commercial Continuity V2 · the commercial journal of a request: what was discussed with the
 * customer. An entry never changes an official price. Official steps of the variants are added
 * by the application to the same thread and cannot be edited.
 */

const KINDS = [
  { value: "DISCUSSION", label: "Discuție" },
  { value: "CUSTOMER_BUDGET", label: "Buget client" },
  { value: "DISCUSSED_PRICE", label: "Preț discutat (fără angajament)" },
] as const;

const CHANNELS = [
  { value: "PHONE", label: "Telefon" },
  { value: "EMAIL", label: "E-mail" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MEETING", label: "Întâlnire" },
  { value: "OTHER", label: "Altul" },
] as const;

const VAT = [
  { value: "UNSPECIFIED", label: "Neprecizat" },
  { value: "NET", label: "Fără TVA" },
  { value: "GROSS", label: "Cu TVA" },
] as const;

function readAmount(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function RequestJournal({
  requestId,
  canWrite,
  variants,
}: {
  requestId: string;
  canWrite: boolean;
  variants: readonly QuoteVariantView[];
}) {
  const journal = useResource(requestJournalKey(requestId), async () => presentJournal(await fetchRequestJournal(requestId)));
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("DISCUSSION");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>("PHONE");
  const [interlocutor, setInterlocutor] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [vatBasis, setVatBasis] = useState<(typeof VAT)[number]["value"]>("UNSPECIFIED");
  const [notes, setNotes] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const withAmount = kind !== "DISCUSSION";
  const items: JournalItem[] = journal.data ?? [];
  const visible = showAll ? items : items.slice(0, 5);

  async function submit(): Promise<void> {
    setPending(true);
    setErrors([]);
    const result = await appendRequestJournalEntry(requestId, {
      kind,
      channel,
      interlocutor: interlocutor.trim() || null,
      notes: notes.trim() || null,
      variantId: variantId || null,
      ...(withAmount
        ? { amountMin: readAmount(amountMin), amountMax: readAmount(amountMax), currency: "EUR", vatBasis }
        : {}),
    });
    setPending(false);
    if (!result.ok) {
      const reasons = readTransportReasons(result.body);
      setErrors(reasons.length > 0 ? reasons : ["Intrarea nu a putut fi salvată."]);
      return;
    }
    setOpen(false);
    setInterlocutor("");
    setAmountMin("");
    setAmountMax("");
    setNotes("");
    setVariantId("");
    invalidateResources(requestJournalKey(requestId));
  }

  return (
    <section className="request-journal" aria-labelledby="request-journal-title" data-testid="request-journal">
      <h2 id="request-journal-title" className="branch-detail__kicker">
        Jurnal comercial · {items.length}
      </h2>
      {journal.status === "error" ? (
        <InlineAlert tone="error" title="Jurnalul nu a putut fi citit">
          <Button variant="secondary" onClick={() => invalidateResources(requestJournalKey(requestId))}>
            Reîncearcă
          </Button>
        </InlineAlert>
      ) : null}
      {journal.status === "success" && items.length === 0 ? (
        <p className="ui-note">
          Nimic consemnat încă. Notează aici bugetul clientului și ce s-a discutat; prețul oficial se stabilește în variantă.
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="request-journal__list">
          {visible.map((item) => (
            <li
              key={item.key}
              className={`request-journal__item${item.source === "APPLICATION" ? " request-journal__item--application" : ""}${item.rectified ? " request-journal__item--rectified" : ""}`}
            >
              <p className="request-journal__when">{formatTimestamp(item.occurredAt)}</p>
              <div>
                <p>
                  <span className="request-journal__kind">{item.kindLabel}</span>
                  {item.amountLabel ? <span className="request-journal__amount"> · {item.amountLabel}</span> : null}
                  {item.variantIndexLabel ? ` · varianta ${item.variantIndexLabel}` : ""}
                </p>
                <p className="request-journal__detail">
                  {[item.detail, item.authorLabel].filter(Boolean).join(" · ")}
                  {item.rectified ? " · rectificată" : ""}
                  {item.rectifies && item.rectificationReason ? ` · rectificare: ${item.rectificationReason}` : ""}
                </p>
                {item.notes ? <p className="request-journal__notes">„{item.notes}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length > 5 ? (
        <button type="button" className="text-link" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Arată mai puține" : `Vezi tot jurnalul (${items.length})`}
        </button>
      ) : null}
      {canWrite && !open ? (
        <p>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Adaugă în jurnal
          </Button>
        </p>
      ) : null}
      {canWrite && open ? (
        <form
          className="journal-form"
          aria-label="Intrare nouă în jurnalul comercial"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Ce consemnezi
            <select value={kind} disabled={pending} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal
            <select value={channel} disabled={pending} onChange={(event) => setChannel(event.target.value as typeof channel)}>
              {CHANNELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interlocutor (opțional)
            <input value={interlocutor} maxLength={160} disabled={pending} onChange={(event) => setInterlocutor(event.target.value)} />
          </label>
          {withAmount ? (
            <>
              <label>
                De la (EUR, opțional)
                <input inputMode="decimal" value={amountMin} disabled={pending} onChange={(event) => setAmountMin(event.target.value)} />
              </label>
              <label>
                Până la (EUR)
                <input inputMode="decimal" value={amountMax} disabled={pending} onChange={(event) => setAmountMax(event.target.value)} />
              </label>
              <label>
                TVA
                <select value={vatBasis} disabled={pending} onChange={(event) => setVatBasis(event.target.value as typeof vatBasis)}>
                  {VAT.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {variants.length > 0 ? (
            <label>
              Se referă la (opțional)
              <select value={variantId} disabled={pending} onChange={(event) => setVariantId(event.target.value)}>
                <option value="">Toată cererea</option>
                {variants.map((variant) => (
                  <option key={variant.variantId} value={variant.variantId}>
                    Varianta {variant.indexLabel} · {variant.inscription ?? variant.productLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="journal-form__wide">
            Observații{kind === "DISCUSSION" ? "" : " (opțional)"}
            <textarea rows={2} maxLength={1000} value={notes} disabled={pending} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {withAmount ? (
            <p className="ui-note journal-form__wide">
              Suma rămâne în jurnal. Nu devine preț al variantei și nu este o ofertă.
            </p>
          ) : null}
          <div className="variant-conflict__actions journal-form__wide">
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Se salvează…" : "Salvează în jurnal"}
            </Button>
          </div>
          {errors.length > 0 ? (
            <div className="journal-form__wide">
              <InlineAlert tone="error" title="Intrarea nu a fost salvată">
                {errors.join(" ")}
              </InlineAlert>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
