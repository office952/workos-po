import { useState } from "react";
import { presentAcceptanceId, presentOrderSnapshotId } from "../adapters/quoteListAdapter";
import { TransportError } from "../api/http";
import { postQuoteAcceptance, postQuoteOrder } from "../api/lifecycle";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateAfterAcceptQuote, invalidateAfterCreateOrder } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadQuoteAcceptance, loadQuoteOrder, loadQuoteSnapshot } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { CommercialPricePanel } from "../presentation/commercialPrice";
import { presentCostLine, selectLineByResource } from "../presentation/costLine";
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
  const acceptance = useResource(
    resourceKeys.quoteAcceptance(productCode, quoteSnapshotId),
    () => loadQuoteAcceptance(productCode, quoteSnapshotId),
  );
  const order = useResource(resourceKeys.quoteOrder(productCode, quoteSnapshotId), () =>
    loadQuoteOrder(productCode, quoteSnapshotId),
  );
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setActionState("pending");
    setActionError(null);
    try {
      const accepted = presentAcceptanceId(
        await postQuoteAcceptance(productCode, quoteSnapshotId),
      );
      writeResource(resourceKeys.quoteAcceptance(productCode, quoteSnapshotId), accepted);
      invalidateAfterAcceptQuote();
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
      if (!created) {
        setActionState("error");
        setActionError("Comanda nu a putut fi prezentată.");
        return;
      }
      writeResource(resourceKeys.quoteOrder(productCode, quoteSnapshotId), created);
      invalidateAfterCreateOrder();
      setActionState("idle");
      navigate(jobHref(created));
    } catch (error) {
      setActionState("error");
      setActionError(
        error instanceof TransportError
          ? "Comanda poate fi creată doar dintr-o ofertă acceptată."
          : "Crearea comenzii a eșuat.",
      );
    }
  }

  const presentedSnapshot = snapshot.data ?? null;
  const profile = presentedSnapshot
    ? selectLineByResource(presentedSnapshot.lines, ALUMINIUM_RETURN_PROFILE_RESOURCE_ID)
    : null;
  const presented = profile ? presentCostLine(profile) : null;
  const acceptanceReady = acceptance.status === "success";
  const orderReady = order.status === "success";
  const accepted = acceptanceReady && acceptance.data !== null;

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
        presentedSnapshot?.inscription,
      ])}
      status={<StatusBadge label="Înghețată" tone={statusTone("workflow")} />}
      action={
        !acceptanceReady || !orderReady ? null : !acceptance.data ? (
          <Button disabled={actionState === "pending"} onClick={() => void accept()}>
            Acceptă oferta
          </Button>
        ) : !order.data ? (
          <Button disabled={actionState === "pending"} onClick={() => void createOrder()}>
            Creează lucrarea
          </Button>
        ) : (
          <a className="hit" href={jobHref(order.data)}>
            <span className="button button--primary">Deschide lucrarea</span>
          </a>
        )
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
            <dl className="fact-grid">
              <InfoRow label="Produs" value={presentedSnapshot.productLabel} />
              <InfoRow label="Text" value={presentedSnapshot.inscription ?? "—"} />
              {presentedSnapshot.customerDisplayName ? (
                <InfoRow label="Client" value={presentedSnapshot.customerDisplayName} />
              ) : null}
              <InfoRow
                label="Acceptare"
                value={
                  acceptanceReady ? (accepted ? "Acceptată" : "Neacceptată") : "Se verifică"
                }
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
      <SurfacePanel
        variant="quiet"
        title="Stare și următorul pas"
        busy={!acceptanceReady || !orderReady}
      >
        {acceptanceReady && orderReady ? (
          <>
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
            {order.data ? (
              <p>
                <a className="text-link" href={jobHref(order.data)}>
                  Deschide lucrarea
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <LoadingFloor variant="facts" label="Se citește continuarea ofertei" rows={3} />
        )}
      </SurfacePanel>
    </SlicePage>
  );
}
