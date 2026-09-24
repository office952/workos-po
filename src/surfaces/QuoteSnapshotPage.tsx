import { useState, type ReactNode } from "react";
import {
  presentOrderSnapshotId,
  presentQuoteAcceptanceFact,
} from "../adapters/quoteListAdapter";
import { TransportError, readTransportReasons } from "../api/http";
import { postQuoteAcceptance, postQuoteOrder } from "../api/lifecycle";
import { fetchQuoteDocument } from "../api/quote";
import type { QuoteListItemTransport } from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateAfterAcceptQuote, invalidateAfterCreateOrder } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadQuoteEnvelope, loadQuoteSnapshot } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { triggerBrowserDownload } from "../presentation/download";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
import { formatMoney } from "../presentation/format";
import { presentContextMeta } from "../presentation/contextMeta";
import { statusTone } from "../presentation/statusTone";
import { ALUMINIUM_RETURN_PROFILE_RESOURCE_ID } from "../reference/lettersProduct";
import { clientHref, jobHref, quoteHref, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";

type QuoteSnapshotPageProps = {
  productCode: string;
  quoteSnapshotId: string;
};

export function QuoteSnapshotPage({
  productCode,
  quoteSnapshotId,
}: QuoteSnapshotPageProps) {
  const snapshot = useResource(resourceKeys.quote(productCode, quoteSnapshotId), () =>
    loadQuoteSnapshot(productCode, quoteSnapshotId),
  );
  const envelope = useResource(resourceKeys.quoteEnvelope(quoteSnapshotId), () =>
    loadQuoteEnvelope(quoteSnapshotId),
  );
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [documentState, setDocumentState] = useState<"idle" | "pending" | "error">("idle");
  const [documentError, setDocumentError] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      await postQuoteAcceptance(productCode, quoteSnapshotId);
      invalidateAfterAcceptQuote(quoteSnapshotId);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Oferta nu poate fi acceptată încă."
          : "Acceptarea a eșuat.",
      );
    }
  }

  async function createOrder(): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      const created = presentOrderSnapshotId(
        await postQuoteOrder(productCode, quoteSnapshotId),
      );
      invalidateAfterCreateOrder(quoteSnapshotId);
      const orderSnapshotId = created ?? envelope.data?.orderSnapshotId;
      if (!orderSnapshotId) {
        setActionState("error");
        setActionError("Comanda nu a putut fi prezentată.");
        return;
      }
      setActionState("idle");
      navigate(jobHref(orderSnapshotId));
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Comanda poate fi creată doar dintr-o ofertă acceptată."
          : "Crearea comenzii a eșuat.",
      );
    }
  }

  async function downloadDocument(): Promise<void> {
    setDocumentState("pending");
    setDocumentError(null);
    const result = await fetchQuoteDocument(productCode, quoteSnapshotId);
    if (!result.ok) {
      const reasons = readTransportReasons(result.body);
      setDocumentState("error");
      setDocumentError(reasons[0] ?? "Documentul ofertei nu este disponibil.");
      return;
    }
    triggerBrowserDownload(result.blob, result.filename ?? "oferta.pdf");
    setDocumentState("idle");
  }

  const presentedSnapshot = snapshot.data ?? null;
  const presentedEnvelope = envelope.data ?? null;
  const stageLabel = presentedEnvelope?.stageLabel ?? presentedSnapshot?.stageLabel;
  const profile = presentedSnapshot
    ? selectLineByResource(presentedSnapshot.lines, ALUMINIUM_RETURN_PROFILE_RESOURCE_ID)
    : null;
  const presented = profile ? presentCostLine(profile) : null;
  const orderSnapshotId = presentedEnvelope?.orderSnapshotId ?? null;

  return (
    <SlicePage
      contextLabel="Ofertă"
      currentHref={quoteHref(productCode, quoteSnapshotId)}
      workspace="object"
      eyebrow="Ofertă"
      title={presentedSnapshot?.productLabel ?? "Ofertă înghețată"}
      lead="Înregistrare comercială înghețată. Acceptarea păstrează această versiune."
      meta={presentContextMeta([
        presentedSnapshot?.customerDisplayName,
        presentedSnapshot?.requestReference,
        presentedSnapshot?.inscription,
      ])}
      status={
        stageLabel ? <StatusBadge label={stageLabel} tone={statusTone("workflow")} /> : null
      }
      action={
        <QuoteEnvelopeAction
          envelope={presentedEnvelope}
          pending={actionState === "pending"}
          onAccept={() => void accept()}
          onCreateOrder={() => void createOrder()}
        />
      }
    >
      {snapshot.status === "error" && !presentedSnapshot ? (
        <InlineAlert tone="error" title="Oferta nu a putut fi citită">
          Identitatea ofertei nu este disponibilă în runtime-ul izolat.
        </InlineAlert>
      ) : null}
      <SurfacePanel
        title="Valori înghețate"
        label="Valori înghețate"
        busy={!presentedSnapshot && snapshot.status !== "error"}
      >
        {presentedSnapshot ? (
          <>
            <CommercialPricePanel
              commercial={presentedSnapshot.commercial}
              internalTotal={presentedSnapshot.total}
              internalCurrency={presentedSnapshot.currency}
            />
            {presentedSnapshot.offerLines.length > 0 ? (
              <dl className="fact-grid">
                {presentedSnapshot.offerLines.map((line) => (
                  <InfoRow
                    key={`${line.kind}-${line.label}`}
                    label={line.label}
                    value={
                      line.netPrice == null
                        ? "—"
                        : formatMoney(line.netPrice, line.currency ?? "EUR")
                    }
                  />
                ))}
                {presentedSnapshot.jobCommercial?.netPrice != null ? (
                  <InfoRow
                    label="Total ofertă"
                    value={formatMoney(
                      presentedSnapshot.jobCommercial.netPrice,
                      presentedSnapshot.jobCommercial.currency ?? "EUR",
                    )}
                  />
                ) : null}
              </dl>
            ) : null}
            <dl className="fact-grid">
              <InfoRow label="Produs" value={presentedSnapshot.productLabel} />
              <InfoRow
                label={
                  productCode === "PRD-LOGO-FRONTLIT-PLEXI-AL06"
                    ? "Denumire logo"
                    : "Text"
                }
                value={presentedSnapshot.inscription ?? "—"}
              />
              {presentedSnapshot.customerDisplayName ? (
                <InfoRow label="Client" value={presentedSnapshot.customerDisplayName} />
              ) : null}
              <InfoRow
                label="Acceptare"
                value={presentQuoteAcceptanceFact(presentedEnvelope?.stage ?? null)}
              />
            </dl>
            {presented ? (
              <div className="equation" data-testid="frozen-profile-cost">
                <p className="equation__label">{presented.label}</p>
                <p className="equation__value">{presented.equationLabel}</p>
                <p className="ui-note">
                  Linia internă nu este preț de vânzare și rămâne înghețată pe această
                  ofertă.
                </p>
              </div>
            ) : (
              <InlineAlert tone="blocked" title="Linie de profil indisponibilă">
                Oferta nu expune linia de cost intern pentru acest rol sau profilul
                lipsește din înregistrarea înghețată.
              </InlineAlert>
            )}
            <p>
              <Button
                variant="secondary"
                disabled={documentState === "pending"}
                onClick={() => void downloadDocument()}
              >
                Descarcă oferta PDF
              </Button>
            </p>
            {documentError ? (
              <InlineAlert tone="error" title="Documentul nu poate fi descărcat">
                {documentError}
              </InlineAlert>
            ) : null}
            {actionError ? (
              <InlineAlert tone="error" title="Acțiunea a eșuat">
                {actionError}
              </InlineAlert>
            ) : null}
          </>
        ) : snapshot.status !== "error" ? (
          <LoadingFloor variant="facts" label="Se citește oferta înghețată" />
        ) : null}
      </SurfacePanel>
      <SurfacePanel variant="quiet" title="Stare și următorul pas">
        <p className="ui-note">
          Acceptarea și lucrarea rămân pe această versiune înghețată. Nu se reconstruiește
          configurația.
        </p>
        {presentedSnapshot?.customerId ? (
          <p>
            <a className="text-link" href={clientHref(presentedSnapshot.customerId)}>
              Deschide clientul
            </a>
          </p>
        ) : null}
        {presentedSnapshot?.requestId ? (
          <p>
            <a className="text-link" href={requestHref(presentedSnapshot.requestId)}>
              Deschide cererea
            </a>
          </p>
        ) : null}
        {orderSnapshotId ? (
          <p>
            <a className="text-link" href={jobHref(orderSnapshotId)}>
              {presentedEnvelope?.nextAction === "OPEN_ORDER"
                ? presentedEnvelope.nextActionLabel || "Deschide comanda"
                : "Deschide lucrarea"}
            </a>
          </p>
        ) : null}
      </SurfacePanel>
    </SlicePage>
  );
}

function QuoteEnvelopeAction({
  envelope,
  pending,
  onAccept,
  onCreateOrder,
}: {
  envelope: QuoteListItemTransport | null;
  pending: boolean;
  onAccept: () => void;
  onCreateOrder: () => void;
}): ReactNode {
  if (!envelope) {
    return null;
  }
  switch (envelope.nextAction) {
    case "ACCEPT_QUOTE":
      return (
        <Button disabled={pending} onClick={onAccept}>
          {envelope.nextActionLabel || "Marchează acceptată"}
        </Button>
      );
    case "CREATE_ORDER":
      return (
        <Button disabled={pending} onClick={onCreateOrder}>
          {envelope.nextActionLabel || "Creează comanda"}
        </Button>
      );
    case "OPEN_ORDER":
      if (!envelope.orderSnapshotId) {
        return null;
      }
      return (
        <a className="hit" href={jobHref(envelope.orderSnapshotId)}>
          <span className="button button--primary">
            {envelope.nextActionLabel || "Deschide comanda"}
          </span>
        </a>
      );
    default:
      return null;
  }
}
