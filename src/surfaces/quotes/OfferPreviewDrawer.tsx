import type { QuoteListItemTransport } from "../../api/types";
import { resourceKeys } from "../../data/resourceKeys";
import { loadQuotePreviewDetail } from "../../data/routeLoaders";
import { invalidateResources } from "../../data/resourceCache";
import { useResource } from "../../data/useResource";
import { formatDecimal, formatTimestamp } from "../../presentation/format";
import { presentJobSheetStage, presentJobSheetTitle } from "../../presentation/jobSheetIdentity";
import { jobHref, registryQuoteHref, requestHref } from "../../routing/appRoute";
import { DossierDialog } from "./QuoteDossier";
import { useQuoteDocumentDownload, useQuoteDossier } from "./useQuoteDossier";
import { useQuotesLayout } from "./useQuotesLayout";
import "../../styles/surfaces/offers-desk.css";
import "../../styles/surfaces/offer-drawer.css";

/** A measurement as the frozen offer states it ("2800 mm", 668:15766): no thousands grouping. */
const measure = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2, useGrouping: false });

/** Loading, error and retry belong to one part of the preview; the list behind it never changes. */
function PartState({ status, loading, error, onRetry }: { status: "loading" | "error"; loading: string; error: string; onRetry: () => void }) {
  if (status === "loading") {
    return (
      <p className="odrawer__state" role="status">
        <span className="odrawer__skeleton" aria-hidden="true" />
        {loading}
      </p>
    );
  }
  return (
    <div className="odrawer__state" data-error role="alert">
      <p>{error}</p>
      <button type="button" className="odrawer__retry" onClick={onRetry}>
        Reîncearcă
      </button>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="odrawer__row" data-strong={strong || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * N-020 · the offer previewed over Cereri și oferte (Figma 668:15454 / 668:15766; Noapte 648:14101;
 * telefon 668:16010 / 668:16192 with the short head kept on top). It is the dossier of the offer, not
 * a second viewer: the same dialog (`DossierDialog`), the same reads (`useQuoteDossier`, the PDF of
 * `useQuoteDocumentDownload`) and the history rule of the caller. It shows only what the server
 * gives — net, VAT, total, the labelled measurements, the work and the PDF; nothing is filled in.
 */
export function OfferPreviewDrawer({
  item,
  offerId,
  request,
  siteName,
  onClose,
}: {
  /** The offer row from the client's workspace; null when the id is not one of this client's offers. */
  item: QuoteListItemTransport | null;
  offerId: string;
  request: { requestId: string; reference: string | null; title: string } | null;
  siteName: string | null;
  onClose: () => void;
}) {
  const desk = useQuotesLayout();
  const layout = desk === "docked" ? "overlay" : desk;
  const { offer, job } = useQuoteDossier(item);
  const pdf = useQuoteDocumentDownload(item);
  const detailKey = item ? resourceKeys.quotePreviewDetail(item.quoteSnapshotId) : null;
  const detail = useResource(detailKey, () => loadQuotePreviewDetail(offerId));
  const reference = item?.reference ?? "Ofertă";
  const amount = item?.grossDisplay ? `${item.grossDisplay}${item.currency ? ` ${item.currency}` : ""}` : null;
  const product = item ? [item.productLabel, item.inscription].filter(Boolean).join(" · ") : "";
  const total = offer?.status === "ready" ? offer.total : null;
  const money = (value: number | null) => (value === null || !total ? "—" : `${formatDecimal(value)} ${total.currency}`);
  const created = formatTimestamp(item?.createdAt ?? null);
  const accepted = formatTimestamp(detail.data?.acceptedAt ?? null);
  const attention = item?.needsAttention && item.attentionLabel && !item.superseded ? item.attentionLabel : null;

  return (
    <DossierDialog layout={layout} variant="drawer" label={`Oferta ${reference}`} initialFocus="[data-drawer-title]" onClose={onClose}>
      <div className="odrawer">
        <div className="odrawer__bar">
          <p className="odrawer__kicker">{`Ofertă · ${reference}`}</p>
          {/* Phone (668:16192): the short head stays on top while the sheet scrolls. */}
          <p className="odrawer__short">{[reference, amount].filter(Boolean).join(" · ")}</p>
          <button type="button" className="odrawer__close" onClick={onClose} data-dossier-close>
            Închide
          </button>
        </div>
        {item ? (
          <div className="odrawer__body">
            <h2 className="odrawer__title" tabIndex={-1} data-drawer-title>
              {product || reference}
            </h2>
            {request ? (
              <p className="odrawer__for">
                {["pentru " + (request.reference ?? "cererea"), request.title, siteName ? `⌖ ${siteName}` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p className="odrawer__facts">
              <span className="dstate" data-tone={item.superseded ? "past" : item.orderSnapshotId ? "done" : "neutral"}>
                <span>{item.superseded ? "Înlocuită de o versiune nouă" : item.stageLabel}</span>
              </span>
              {attention ? (
                <span className="dstate" data-tone="offer">
                  <span>{attention}</span>
                </span>
              ) : null}
              <span className="odrawer__dates">{[created ? `creată ${created}` : null, accepted ? `acceptată ${accepted}` : null].filter(Boolean).join(" · ")}</span>
            </p>

            <section className="odrawer__part" aria-labelledby={`${offerId}-pret`}>
              <h3 id={`${offerId}-pret`} className="odrawer__label">Preț</h3>
              {total ? (
                <dl className="odrawer__rows">
                  <Row label="Net" value={money(total.netPrice)} />
                  <Row label={total.vatPercent === null ? "TVA" : `TVA ${total.vatPercent}%`} value={money(total.vatAmount)} />
                  <Row label="Total cu TVA" value={money(total.grossPrice)} strong />
                </dl>
              ) : offer?.status === "error" ? (
                <PartState status="error" loading="" error="Prețul nu a putut fi citit. Totalul din listă rămâne valabil." onRetry={offer.retry} />
              ) : offer ? (
                <PartState status="loading" loading="Se citește prețul ofertei…" error="" onRetry={offer.retry} />
              ) : null}
            </section>

            <section className="odrawer__part" aria-labelledby={`${offerId}-config`}>
              <h3 id={`${offerId}-config`} className="odrawer__label">Configurație</h3>
              <dl className="odrawer__rows">
                {item.inscription ? <Row label="Text" value={item.inscription} /> : null}
                {(detail.data?.measurements ?? []).map((measurement) => (
                  <Row key={measurement.label} label={measurement.label} value={`${measure.format(measurement.value)} ${measurement.unit}`} />
                ))}
                {item.kind === "ASSEMBLY" && offer?.status === "ready"
                  ? offer.lines.map((line) => <Row key={line.key} label={line.title} value={line.detail ?? ""} />)
                  : null}
              </dl>
              {!detail.data && detail.status === "error" ? (
                <PartState status="error" loading="" error="Dimensiunile ofertei nu au putut fi citite." onRetry={() => detailKey && invalidateResources(detailKey)} />
              ) : !detail.data && detailKey ? (
                <PartState status="loading" loading="Se citesc dimensiunile…" error="" onRetry={() => detailKey && invalidateResources(detailKey)} />
              ) : null}
            </section>

            <section className="odrawer__part" aria-labelledby={`${offerId}-lucrare`}>
              <h3 id={`${offerId}-lucrare`} className="odrawer__label">Lucrare</h3>
              {job.status === "absent" ? (
                <p className="odrawer__text">Încă nu: oferta nu are comandă.</p>
              ) : job.status === "ready" ? (
                <div className="odrawer__work">
                  <p className="odrawer__work-text">
                    <span className="odrawer__work-title">{presentJobSheetTitle(job.job)}</span>
                    <span className="odrawer__work-meta">{[presentJobSheetStage(job.job), job.job.progressLabel].filter(Boolean).join(" · ")}</span>
                  </p>
                  <a className="odrawer__secondary" href={jobHref(job.job.jobId)}>
                    Deschide fișa lucrării →
                  </a>
                </div>
              ) : (
                <PartState status={job.status} loading="Se citește lucrarea…" error="Lucrarea nu a putut fi citită." onRetry={job.retry} />
              )}
            </section>
          </div>
        ) : (
          <div className="odrawer__body">
            <h2 className="odrawer__title" tabIndex={-1} data-drawer-title>
              Oferta nu este disponibilă
            </h2>
            <p className="odrawer__text">Oferta cerută nu există sau nu aparține acestui client.</p>
          </div>
        )}
        {item ? (
          <div className="odrawer__actions">
            <a className="odrawer__primary" href={registryQuoteHref(item)}>
              Deschide oferta completă →
            </a>
            <button type="button" className="odrawer__secondary" disabled={pdf.pending} aria-busy={pdf.pending || undefined} onClick={() => void pdf.download()}>
              {pdf.pending ? "Se descarcă…" : "Descarcă oferta PDF"}
            </button>
            {request ? (
              <a className="odrawer__link" href={requestHref(request.requestId)}>
                Deschide cererea →
              </a>
            ) : null}
            {pdf.error ? (
              <p className="odrawer__action-error" role="alert">
                {pdf.error}{" "}
                <button type="button" className="odrawer__retry" onClick={() => void pdf.download()}>
                  Reîncearcă descărcarea
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </DossierDialog>
  );
}
