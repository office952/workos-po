import { useEffect, useRef, useState } from "react";
import { readTransportReasons } from "../../api/http";
import { fetchAssemblyQuoteDocument, fetchQuoteDocument } from "../../api/quote";
import type { JobListItemTransport, QuoteListItemTransport } from "../../api/types";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { loadAssemblyQuote, loadJobDetail, loadQuoteSnapshot } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { triggerBrowserDownload } from "../../presentation/download";
import { readCloudBoundaryVersion } from "../../session/sessionExpiryBridge";
import type { QuoteLine, QuoteTotal } from "../quoteDetail";
import {
  presentAssemblyQuoteLines,
  presentAssemblyQuoteTotal,
  presentProductQuoteLines,
  presentProductQuoteTotal,
} from "../quoteDocumentModel";

export type PartStatus = "loading" | "error" | "ready";

export type DossierOffer = {
  status: PartStatus;
  total: QuoteTotal | null;
  lines: QuoteLine[];
  /** True when every line carries its own VAT and gross amount. */
  lineTax: boolean;
  caption: string;
  note: string | null;
  /** The last successful read is shown, but the latest refresh failed. */
  refreshFailed: boolean;
  retry: () => void;
};

export type DossierJob =
  | { status: "absent" }
  | { status: "loading" | "error"; retry: () => void }
  | { status: "ready"; job: JobListItemTransport; refreshFailed: boolean; retry: () => void };

function partStatus(status: string, hasData: boolean): PartStatus {
  if (hasData) return "ready";
  return status === "error" ? "error" : "loading";
}

/** The cache keeps the last good value when a later read fails; the dossier must say so. */
function refreshFailedAfterRead(status: string, hasData: boolean): boolean {
  return hasData && status === "error";
}

/**
 * The dossier reads the frozen offer and its job independently, each under its own
 * resource key. A late answer for a previous selection lands in that selection's cache
 * entry and can never be shown for another offer.
 */
export function useQuoteDossier(item: QuoteListItemTransport | null): { offer: DossierOffer | null; job: DossierJob } {
  const id = item?.quoteSnapshotId ?? "";
  const productKey = item && item.kind === "PRODUCT" ? resourceKeys.quote(item.productCode, id) : null;
  const assemblyKey = item && item.kind === "ASSEMBLY" ? resourceKeys.assemblyQuote(id) : null;
  const productCode = item?.productCode ?? "";
  const product = useResource(productKey, () => loadQuoteSnapshot(productCode, id));
  const assembly = useResource(assemblyKey, () => loadAssemblyQuote(id));
  const orderId = item?.orderSnapshotId ?? null;
  const jobKey = orderId ? resourceKeys.job(orderId) : null;
  const jobResource = useResource(jobKey, () => loadJobDetail(orderId ?? ""));

  let offer: DossierOffer | null = null;
  if (item && productKey) {
    const snapshot = product.data ?? null;
    const total = snapshot ? presentProductQuoteTotal(snapshot) : null;
    offer = {
      status: partStatus(product.status, snapshot !== null),
      total,
      lines: snapshot ? presentProductQuoteLines(snapshot, total) : [],
      lineTax: snapshot ? snapshot.offerLines.length === 0 : false,
      caption: "Ce se ofertează",
      note: "Oferta este înghețată. Acceptarea și comanda păstrează această versiune.",
      refreshFailed: refreshFailedAfterRead(product.status, snapshot !== null),
      retry: () => invalidateResources(productKey),
    };
  } else if (item && assemblyKey) {
    const quote = assembly.data ?? null;
    const ordered = Boolean(quote?.orderSnapshotId ?? item.orderSnapshotId);
    offer = {
      status: partStatus(assembly.status, quote !== null),
      total: quote ? presentAssemblyQuoteTotal(quote) : null,
      lines: quote ? presentAssemblyQuoteLines(quote) : [],
      lineTax: true,
      caption: "Secțiuni ofertă",
      note: quote
        ? ordered
          ? "Oferta este acceptată. Comanda păstrează sumele acestei versiuni."
          : quote.acceptance.canAccept && !quote.superseded
            ? "Oferta este înghețată. Acceptarea creează comanda din această versiune."
            : quote.acceptance.reason ?? "Oferta este înghețată."
        : null,
      refreshFailed: refreshFailedAfterRead(assembly.status, quote !== null),
      retry: () => invalidateResources(assemblyKey),
    };
  }

  let job: DossierJob = { status: "absent" };
  if (jobKey) {
    const retry = () => invalidateResources(jobKey);
    const presented = jobResource.data?.job ?? null;
    job = presented
      ? { status: "ready", job: presented, refreshFailed: refreshFailedAfterRead(jobResource.status, true), retry }
      : { status: jobResource.status === "error" ? "error" : "loading", retry };
  }

  return { offer, job };
}

export const DOCUMENT_UNREACHABLE =
  "Documentul ofertei nu a putut fi descărcat. Verifică conexiunea și reîncearcă.";

/**
 * One request at a time per offer: the server-rendered PDF that the offer page already offers.
 * Every outcome ends the pending state. An answer that arrives after the offer, the dossier or
 * the session changed is dropped: it neither downloads nor reports anything.
 */
export function useQuoteDocumentDownload(item: QuoteListItemTransport | null) {
  const [state, setState] = useState<{ id: string | null; pending: boolean; error: string | null }>({
    id: null,
    pending: false,
    error: null,
  });
  const ticketRef = useRef(0);
  const id = item?.quoteSnapshotId ?? null;
  // A download belongs to the offer that started it; another selection starts clean.
  const current = state.id === id ? state : { id, pending: false, error: null };

  useEffect(
    () => () => {
      ticketRef.current += 1;
    },
    [],
  );

  async function download(): Promise<void> {
    if (!item || current.pending) return;
    const target = item.quoteSnapshotId;
    const ticket = ++ticketRef.current;
    const boundary = readCloudBoundaryVersion();
    const stillCurrent = () => ticketRef.current === ticket && boundary === readCloudBoundaryVersion();
    setState({ id: target, pending: true, error: null });
    try {
      const result =
        item.kind === "ASSEMBLY"
          ? await fetchAssemblyQuoteDocument(target)
          : await fetchQuoteDocument(item.productCode, target);
      if (!stillCurrent()) return;
      if (!result.ok) {
        setState({ id: target, pending: false, error: readTransportReasons(result.body)[0] ?? "Documentul ofertei nu este disponibil." });
        return;
      }
      triggerBrowserDownload(result.blob, result.filename ?? "oferta.pdf");
      setState({ id: target, pending: false, error: null });
    } catch {
      if (!stillCurrent()) return;
      setState({ id: target, pending: false, error: DOCUMENT_UNREACHABLE });
    }
  }

  return { pending: current.pending, error: current.error, download };
}
