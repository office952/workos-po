import { resourceKeys } from "../../data/resourceKeys";
import { loadQuoteEnvelope } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import type { QuotesSheet } from "../../routing/appRoute";
import { DossierDialog, QuoteDossier } from "../quotes/QuoteDossier";
import { useQuotesLayout } from "../quotes/useQuotesLayout";
import "../../styles/surfaces/offers-desk.css";

/**
 * N-018 · an offer of the request previewed over the request page, in the same dossier as in
 * Oferte (Ofertă and Comandă · lucrare sheets). The full offer page stays one click away.
 */
export function RequestOfferPreview({
  offerId,
  sheet,
  position,
  onSheet,
  onMove,
  onClose,
}: {
  offerId: string;
  sheet: QuotesSheet;
  position: { index: number; count: number };
  onSheet: (sheet: QuotesSheet) => void;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const desk = useQuotesLayout();
  const layout = desk === "docked" ? "overlay" : desk;
  const envelope = useResource(resourceKeys.quoteEnvelope(offerId), () => loadQuoteEnvelope(offerId));
  const item = envelope.data ?? null;
  const empty = item ? "none" : envelope.status === "error" ? "unavailable" : envelope.status === "success" ? "not-found" : "loading";
  const emptyCopy =
    empty === "loading"
      ? { title: "Se citește oferta", body: "Dosarul se deschide după citirea ofertei.", hint: null }
      : empty === "none"
        ? undefined
        : { title: "Oferta nu este disponibilă", body: "Oferta cerută nu a putut fi citită sau nu este accesibilă în această organizație.", hint: null };
  return (
    <DossierDialog layout={layout} onClose={onClose}>
      <QuoteDossier emptyCopy={emptyCopy} layout={layout} item={item} empty={empty} sheet={sheet} position={position} onSheet={onSheet} onMove={onMove} onClose={onClose} />
    </DossierDialog>
  );
}
