import type { DossierDocument, HistoryBranch, HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import type { QuoteListItemTransport, RequestListItemTransport } from "../../../../api/types";
import { jobHref, registryQuoteHref, requestHref } from "../../../../routing/appRoute";
import type { BandMode } from "../bandModel";
import { formatDay } from "../dossierModel";
import { attachedFiles, orderedPhotos, requestDocuments } from "../historyModel";
import { offerAmount } from "./branchChain";
import { FileList, Files, Photos } from "./cardParts";
import { follow } from "./follow";
import { OfferRowView } from "../OfferRowView";
import { openDocument, type Opened } from "./opened";

const lower = (value: string) => value.toLocaleLowerCase("ro");

/** The files and photos the server links to one work of the request. */
function workDocuments(entry: HistoryEntry, jobId: string): DossierDocument[] {
  return entry.documents.filter((document) => document.links.some((link) => link.kind === "JOB" && link.subjectId === jobId));
}

/**
 * The offer's own tag (Stare 557:3559 in Rând ofertă 605:8715): the reason the server gives when it
 * marks the offer for attention (warm), otherwise its stage — "Cu comandă" once ordered.
 */
function offerTag(branch: HistoryBranch, quote: QuoteListItemTransport | null): { tone: "offer" | "done" | "neutral"; label: string } | null {
  if (!branch.quote) return null;
  if (quote?.needsAttention && !quote.superseded && quote.attentionLabel) return { tone: "offer", label: quote.attentionLabel };
  const label = [branch.quote.stageLabel, branch.quote.superseded ? "înlocuită" : null].filter(Boolean).join(" · ");
  return { tone: branch.orderSnapshotId ? "done" : "neutral", label };
}

/**
 * One offer of the request and the work made from it (Rând ofertă 605:8715 through OfferRowView:
 * desktop in 813:31187 / 813:31490, the phone density at 768 and 390). The offer's tag and the work's
 * state are kept apart: the work says its own state and progress and opens its sheet.
 */
function OfferRow({ branch, quote, onPreview }: { branch: HistoryBranch; quote: QuoteListItemTransport | null; onPreview: (quoteSnapshotId: string) => void }) {
  const offer = branch.quote;
  const product = quote ? [quote.productLabel, quote.inscription].filter(Boolean).join(" · ") : branch.job ? [branch.job.productLabel, branch.job.inscription].filter(Boolean).join(" · ") : "";
  const tag = offerTag(branch, quote);
  const work = branch.job
    ? { href: jobHref(branch.job.jobId), label: [`Lucrare · ${branch.stateLabel}`, branch.job.progressLabel].filter(Boolean).join(" · ") }
    : { text: !offer ? "Fără lucrare" : branch.orderSnapshotId ? `Fără lucrare încă · ${lower(branch.stateLabel)}` : "Fără lucrare · oferta nu are comandă" };
  return (
    <OfferRowView
      amount={offerAmount(quote)}
      reference={offer?.reference ?? null}
      title={product}
      created={quote?.createdAt ? `creată ${formatDay(quote.createdAt)}` : null}
      tag={tag}
      work={work}
      attention={tag?.tone === "offer"}
      superseded={Boolean(offer?.superseded)}
      state={branch.state}
      preview={offer ? { id: offer.quoteSnapshotId, onPreview } : null}
      openHref={offer ? registryQuoteHref(offer) : null}
    />
  );
}

/**
 * The expanded WorkOS project (813:31187 two offers without a work; 813:31490 two works in
 * different states; 768 813:31793; 390 813:31918). The request once, then each offer once with the
 * work made from it; the request's photos and documents apart from each work's. Every relation,
 * state, amount and count is the server's.
 */
export function ProjectTree({
  entry,
  quotes,
  requests,
  mode,
  onOpen,
  onPreviewQuote,
}: {
  entry: HistoryEntry;
  quotes: readonly QuoteListItemTransport[];
  requests: readonly RequestListItemTransport[];
  mode: BandMode;
  onOpen: (opened: Opened) => void;
  onPreviewQuote: (quoteSnapshotId: string) => void;
}) {
  const openFile = (document: DossierDocument) => openDocument(entry, document, onOpen);
  const ownDocuments = requestDocuments(entry);
  const request = entry.request;
  const listed = request ? requests.find((item) => item.requestId === request.requestId) ?? null : null;
  const requestMeta = request ? [lower(request.statusLabel), formatDay(listed?.createdAt ?? null)].filter(Boolean).join(" · ") : null;
  const quoteOf = (branch: HistoryBranch) => (branch.quote ? quotes.find((item) => item.quoteSnapshotId === branch.quote?.quoteSnapshotId) ?? null : null);
  const works = entry.branches.filter((branch): branch is HistoryBranch & { job: NonNullable<HistoryBranch["job"]> } => branch.job !== null);
  return (
    <>
      <div className="hproj-request">
        <p className="hproj-request__kicker">Cerere</p>
        <p className="hproj-request__ref">{request?.reference ?? "Fără cerere"}</p>
        {/* Desktop (813:31187) names the request; narrower, the card title already does. */}
        {request && mode === "desktop" ? <p className="hproj-request__title">{request.title}</p> : null}
        {requestMeta ? <p className="hproj-request__meta">{requestMeta}</p> : null}
        {request ? (
          <a className="hproj-request__open" href={requestHref(request.requestId)} onClick={(event) => follow(event, requestHref(request.requestId))}>
            Deschide cererea →
          </a>
        ) : null}
      </div>

      <section className="hproj-branches" aria-label="Oferte și lucrările lor">
        <p className="hcard__label">{`Oferte și lucrările lor · ${entry.branches.length}`}</p>
        <ol className="hproj-branches__list">
          {entry.branches.map((branch) => (
            <OfferRow key={branch.branchId} branch={branch} quote={quoteOf(branch)} onPreview={onPreviewQuote} />
          ))}
        </ol>
      </section>

      <div className="hcard__columns" data-project>
        <Photos entry={entry} mode={mode} onOpen={onOpen} title="Fotografiile cererii" photos={orderedPhotos(ownDocuments)} phoneStart="first" phoneLabel />
        <Files title="Documentele cererii" documents={attachedFiles(ownDocuments)} onOpen={openFile} empty="Niciun fișier atașat" />
      </div>

      {works.length ? (
        <section className="hproj-works" aria-label="Documentele lucrărilor">
          <p className="hcard__label">Documentele lucrărilor</p>
          {works.map((branch) => {
            const documents = workDocuments(entry, branch.job.jobId);
            const photos = orderedPhotos(documents);
            const files = attachedFiles(documents);
            const product = [branch.job.productLabel, branch.job.inscription].filter(Boolean).join(" · ");
            return (
              <div key={branch.branchId} className="hproj-works__group">
                <p className="hproj-works__title">{["Documentele lucrării", branch.quote?.reference ?? null, product || null, branch.stateLabel].filter(Boolean).join(" · ")}</p>
                {photos.length ? <Photos entry={entry} mode={mode} onOpen={onOpen} title="Fotografiile lucrării" photos={photos} phoneLabel /> : null}
                {files.length ? <FileList documents={files} onOpen={openFile} /> : null}
                {documents.length ? null : <p className="hcard__none">Niciun fișier atașat</p>}
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
