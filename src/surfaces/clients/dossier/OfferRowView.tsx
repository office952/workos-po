import { follow } from "./history/follow";

export type OfferTag = { tone: "offer" | "done" | "neutral" | "past"; label: string };
export type OfferWork = { href: string; label: string } | { text: string };

/**
 * Rând ofertă (Figma 605:8715; desktop in 640:11188 / 813:31187, the phone density from 768 down):
 * amount and reference, what is offered and when, the offer's own tag, then — apart — the work made
 * from it, and the two ways in: "Previzualizează" in place, "Deschide oferta →" for the full page.
 * Warm only when the server marks the offer for attention; a superseded version is struck through,
 * on the alternate background, and never reads as the current offer. Every word and number is given
 * by the caller from the server's data.
 */
export function OfferRowView({
  amount,
  reference,
  title,
  created,
  tag,
  work,
  attention,
  superseded,
  state,
  preview,
  openHref,
}: {
  /**
   * The amount with its currency; null when the list has none. The list cannot tell an amount hidden
   * by permission from one not calculated, so it says neither: "Valoare indisponibilă", never 0. An
   * explicit 0 from the server is an amount like any other.
   */
  amount: string | null;
  /** The offer's reference; null for a work reached without an offer. */
  reference: string | null;
  title: string;
  created: string | null;
  tag: OfferTag | null;
  work: OfferWork;
  attention: boolean;
  superseded: boolean;
  state?: string;
  preview: { id: string; onPreview: (id: string) => void } | null;
  openHref: string | null;
}) {
  return (
    <li className="hoffer" data-attention={attention || undefined} data-superseded={superseded || undefined} data-state={state}>
      <div className="hoffer__amount">
        {reference ? (
          <>
            <p className="hoffer__value" data-none={!amount || undefined}>{amount ?? "Valoare indisponibilă"}</p>
            <p className="hoffer__ref">{reference}</p>
          </>
        ) : (
          <p className="hoffer__value" data-none>Fără ofertă</p>
        )}
      </div>
      {tag ? (
        <span className="dstate hoffer__tag" data-tone={tag.tone}>
          <span>{tag.label}</span>
        </span>
      ) : null}
      <div className="hoffer__object">
        {title ? <p className="hoffer__title">{title}</p> : null}
        {created ? <p className="hoffer__created">{created}</p> : null}
      </div>
      <div className="hoffer__work">
        {"href" in work ? (
          <a className="hoffer__job" href={work.href} onClick={(event) => follow(event, work.href)}>
            {`${work.label} →`}
          </a>
        ) : (
          <p className="hoffer__nojob">{work.text}</p>
        )}
      </div>
      {reference && (preview || openHref) ? (
        <div className="hoffer__actions">
          {preview ? (
            <button
              type="button"
              className="hoffer__preview"
              data-preview-opener={preview.id}
              aria-haspopup="dialog"
              aria-label={`Previzualizează oferta ${reference}`}
              onClick={() => preview.onPreview(preview.id)}
            >
              Previzualizează
            </button>
          ) : null}
          {openHref ? (
            <a className="hoffer__open" href={openHref} onClick={(event) => follow(event, openHref)} aria-label={`Deschide oferta ${reference}`}>
              Deschide oferta →
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
