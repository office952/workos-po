import type { QuoteListItemTransport } from "../../api/types";
import { formatDecimal } from "../../presentation/format";
import { presentJobSheetSecondary, presentJobSheetStage, presentJobSheetTitle, jobSheetFinished } from "../../presentation/jobSheetIdentity";
import { presentQuoteWorklistAction } from "../../presentation/worklistAction";
import { jobHref, registryQuoteHref, requestHref } from "../../routing/appRoute";
import type { QuoteLine } from "../quoteDetail";
import { ACCEPTANCE_ACTIONS, createdLabel, destinationOf, kindDetail, listValue, listValueLabel } from "./quoteRegistryModel";
import type { DossierJob, DossierOffer } from "./useQuoteDossier";

function Skeleton({ widths }: { widths: readonly number[] }) {
  return (
    <span className="offers-dossier__skeleton" aria-hidden="true">
      {widths.map((width, index) => (
        <span key={index} style={{ width: `${width}%` }} />
      ))}
    </span>
  );
}

function Loading({ children }: { children: string }) {
  return (
    <p className="offers-dossier__loading" role="status">
      <span className="offers-dossier__spinner" aria-hidden="true" />
      {children}
    </p>
  );
}

function PartError({ title, children, onRetry }: { title: string; children: string; onRetry: () => void }) {
  return (
    <div className="offers-dossier__error" role="alert">
      <p className="offers-dossier__error-title">{title}</p>
      <p>{children}</p>
      <button type="button" className="offers-dossier__retry" onClick={onRetry}>Reîncearcă</button>
    </div>
  );
}

/** A later read failed: the last good read stays on the sheet, with a retry for this part only. */
function RefreshFailed({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <div className="offers-dossier__stale" role="alert">
      <p>{children}</p>
      <button type="button" className="offers-dossier__retry" onClick={onRetry}>Reîncearcă</button>
    </div>
  );
}

/** Stages in which the server confirms the acceptance; an order exists only after acceptance. */
const ACCEPTED_STAGES = new Set(["QUOTE_ACCEPTED", "ORDER_CREATED"]);

/**
 * The stamp has one meaning: the system confirmed the acceptance. The list carries no
 * acceptance date, so the creation date is not shown in its place.
 */
function Stamp({ item }: { item: QuoteListItemTransport }) {
  if (!item.stage || !ACCEPTED_STAGES.has(item.stage)) return null;
  return (
    <span className="offers-stamp" data-testid="offer-acceptance-stamp" aria-hidden="true">
      <span className="offers-stamp__label">Acceptată</span>
    </span>
  );
}

function lineValue(line: QuoteLine): string {
  const value = line.grossPrice ?? line.netPrice;
  return value === null ? "—" : formatDecimal(value);
}

export function OfferSheet({ item, offer }: { item: QuoteListItemTransport; offer: DossierOffer }) {
  const value = listValue(item);
  const total = offer.status === "ready" ? offer.total : null;
  const gross = total?.grossPrice ?? null;
  const created = createdLabel(item);
  return (
    <div className="offers-sheet-v2" aria-busy={offer.status === "loading" || undefined}>
      <p className="offers-sheet-v2__head">
        <span>Ofertă · {kindDetail(item)}</span>
        {created ? <span>{created.replace(",", " ·")}</span> : null}
      </p>
      <div className="offers-sheet-v2__identity">
        <div>
          <p className="offers-sheet-v2__ref">{item.reference || "Ofertă"}</p>
          <p className="offers-sheet-v2__client">{item.customerDisplayName ?? "Fără client"}</p>
          {item.requestId && item.requestReference ? (
            <p className="offers-sheet-v2__request">
              Cerere <a href={requestHref(item.requestId)}>{item.requestReference}</a>
            </p>
          ) : null}
        </div>
        <Stamp item={item} />
      </div>
      <p className="offers-sheet-v2__product">
        {[item.productLabel, item.inscription].filter(Boolean).join(" · ") || "—"}
      </p>
      <hr className="offers-sheet-v2__perforation" />
      <div className="offers-sheet-v2__value">
        <p className="offers-sheet-v2__label">Total cu TVA</p>
        <p className="offers-sheet-v2__amount">
          {total && gross !== null ? (
            <>
              {formatDecimal(gross)} <span>{total.currency}</span>
            </>
          ) : value ? (
            <>
              {value.amount} {value.currency ? <span>{value.currency}</span> : null}
            </>
          ) : (
            "—"
          )}
        </p>
        {total && gross !== null ? (
          <p className="offers-sheet-v2__split">
            <span>Net {total.netPrice === null ? "—" : `${formatDecimal(total.netPrice)} ${total.currency}`}</span>
            <span>
              {total.vatPercent === null ? "TVA" : `TVA ${total.vatPercent}%`}{" "}
              {total.vatAmount === null ? "—" : `${formatDecimal(total.vatAmount)} ${total.currency}`}
            </span>
          </p>
        ) : offer.status === "loading" ? (
          <Skeleton widths={[46]} />
        ) : null}
      </div>
      {offer.status === "ready" && offer.refreshFailed ? (
        <RefreshFailed onRetry={offer.retry}>
          Actualizarea detaliului ofertei a eșuat. Se afișează ultima citire reușită.
        </RefreshFailed>
      ) : null}
      {offer.status === "ready" ? (
        <div className="offers-sheet-v2__lines">
          <p className="offers-sheet-v2__lines-head">
            <span>{offer.caption}{offer.lines.length > 1 ? ` · ${offer.lines.length}` : ""}</span>
            <span>{offer.lineTax ? "Cu TVA" : "Net"}</span>
          </p>
          <ul>
            {offer.lines.map((line) => (
              <li key={line.key}>
                <span className="offers-sheet-v2__line-title">{line.title}</span>
                <span className="offers-sheet-v2__line-value">{lineValue(line)}</span>
                {line.detail ? <span className="offers-sheet-v2__line-detail">{line.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : offer.status === "loading" ? (
        <>
          <Skeleton widths={[82, 54, 70, 40]} />
          <Loading>Se citește detaliul ofertei: net, TVA și conținut. Datele de mai sus vin din registru.</Loading>
        </>
      ) : (
        <PartError title="Detaliul ofertei nu a putut fi citit" onRetry={offer.retry}>
          Referința, clientul, totalul și starea sunt din registru. Netul, TVA-ul și conținutul apar după o citire reușită.
        </PartError>
      )}
      {item.needsAttention && item.attentionLabel ? (
        <div className="offers-sheet-v2__attention">
          <p className="offers-sheet-v2__attention-title">{item.attentionLabel}</p>
          {ACCEPTANCE_ACTIONS.has(item.nextAction) ? (
            <p>Confirmarea comenzii se face în pagina ofertei, lângă total.</p>
          ) : null}
        </div>
      ) : null}
      {offer.status === "ready" && offer.note ? <p className="offers-sheet-v2__note">{offer.note}</p> : null}
    </div>
  );
}

export function OfferActions({
  item,
  pdf,
}: {
  item: QuoteListItemTransport;
  pdf: { pending: boolean; error: string | null; download: () => Promise<void> };
}) {
  const action = presentQuoteWorklistAction(item);
  const offerHref = registryQuoteHref(item);
  const destinations = [
    { label: action.actionLabel, where: destinationOf(action.actionHref, item) },
    ...(action.actionHref === offerHref ? [] : [{ label: "Oferta completă", where: "pagina ofertei" }]),
    { label: "PDF", where: "descarcă oferta, documentul existent al acestei versiuni" },
  ];
  return (
    <div className="offers-dossier__actions">
      <div className="offers-dossier__buttons">
        <a className="offers-dossier__primary" href={action.actionHref}>
          <span>{action.actionLabel}</span>
          <span aria-hidden="true">→</span>
        </a>
        {action.actionHref === offerHref ? null : (
          <a className="offers-dossier__secondary" href={offerHref}>
            <span>Oferta completă</span>
            <span aria-hidden="true">↗</span>
          </a>
        )}
        <button
          type="button"
          className="offers-dossier__icon"
          aria-label="Descarcă oferta PDF"
          title="Descarcă oferta PDF"
          disabled={pdf.pending}
          aria-busy={pdf.pending || undefined}
          onClick={() => void pdf.download()}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
        </button>
      </div>
      {pdf.error ? (
        <p className="offers-dossier__action-error" role="alert">
          {pdf.error}{" "}
          <button type="button" className="offers-dossier__retry-link" onClick={() => void pdf.download()}>
            Reîncearcă descărcarea
          </button>
        </p>
      ) : null}
      <ul className="offers-dossier__destinations">
        {destinations.map((entry) => (
          <li key={entry.label}><strong>{entry.label}</strong> → {entry.where}</li>
        ))}
      </ul>
    </div>
  );
}

export function OrderSheet({ item, job }: { item: QuoteListItemTransport; job: DossierJob }) {
  const value = listValueLabel(item);
  return (
    <div className="offers-sheet-v2" aria-busy={job.status === "loading" || undefined}>
      <p className="offers-sheet-v2__head"><span>Comandă și lucrare</span></p>
      <div className="offers-sheet-v2__order">
        <span className="offers-lamp" data-filled aria-hidden="true" />
        <div>
          <p className="offers-sheet-v2__label">Comanda</p>
          <p className="offers-sheet-v2__order-state">Acceptată — comandă creată</p>
          <p className="offers-sheet-v2__order-source">
            Păstrează sumele ofertei {item.reference}{value ? ` · ${value} cu TVA` : ""}
          </p>
        </div>
      </div>
      <hr className="offers-sheet-v2__perforation" />
      <p className="offers-sheet-v2__label">Lucrarea · fișa de producție a comenzii</p>
      {job.status === "ready" ? (
        <>
          {job.refreshFailed ? (
            <RefreshFailed onRetry={job.retry}>
              Actualizarea fișei lucrării a eșuat. Se afișează ultima citire reușită.
            </RefreshFailed>
          ) : null}
          <p className="offers-sheet-v2__job-title">{presentJobSheetTitle(job.job)}</p>
          <p className="offers-sheet-v2__product">
            {[job.job.customerDisplayName, presentJobSheetSecondary(job.job)].filter(Boolean).join(" · ") || "—"}
          </p>
          <div className="offers-sheet-v2__progress">
            <p className="offers-sheet-v2__progress-head">
              <span className="offers-sheet-v2__label">Progresul lucrării</span>
              <span className="offers-sheet-v2__stage">
                <span className="offers-lamp" data-filled data-live aria-hidden="true" />
                {presentJobSheetStage(job.job)}
              </span>
            </p>
            <p className="offers-sheet-v2__progress-value">{job.job.progressLabel ?? "—"}</p>
          </div>
          <dl className="offers-sheet-v2__facts">
            <div><dt>Prioritate</dt><dd>{job.job.priorityLabel}</dd></div>
            <div><dt>Termen</dt><dd>{job.job.targetDateLabel}</dd></div>
          </dl>
          {jobSheetFinished(job.job) ? (
            <p className="offers-sheet-v2__note">Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p>
          ) : null}
        </>
      ) : job.status === "loading" ? (
        <>
          <Skeleton widths={[72, 48, 90, 36]} />
          <Loading>Se citește fișa lucrării. Comanda este deja confirmată în ofertă.</Loading>
        </>
      ) : job.status === "error" ? (
        <PartError title="Fișa lucrării nu a putut fi citită" onRetry={job.retry}>
          Comanda rămâne confirmată, iar oferta din foaia Ofertă este neschimbată. Poți reîncerca sau deschide direct fișa lucrării.
        </PartError>
      ) : null}
    </div>
  );
}

export function OrderActions({ item, onOffer }: { item: QuoteListItemTransport; onOffer: () => void }) {
  if (!item.orderSnapshotId) return null;
  return (
    <div className="offers-dossier__actions">
      <div className="offers-dossier__buttons">
        <a className="offers-dossier__primary" href={jobHref(item.orderSnapshotId)}>
          <span>Deschide fișa lucrării</span>
          <span aria-hidden="true">→</span>
        </a>
        <button type="button" className="offers-dossier__secondary" onClick={onOffer}>
          <span>Înapoi la ofertă</span>
        </button>
      </div>
      <ul className="offers-dossier__destinations">
        <li><strong>Deschide fișa lucrării</strong> → Lucrări, fișa acestei comenzi</li>
        <li><strong>Înapoi la ofertă</strong> → foaia Ofertă din acest dosar</li>
      </ul>
    </div>
  );
}
