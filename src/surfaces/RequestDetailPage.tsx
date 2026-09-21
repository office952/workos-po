import { useEffect } from "react";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { resourceKeys } from "../data/resourceKeys";
import { loadRequestDetail } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { statusTone } from "../presentation/statusTone";
import { presentRequestPrimaryAction } from "../presentation/worklistAction";
import { quoteHref, requestHref } from "../routing/appRoute";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { RequestAttachmentsSection } from "./RequestAttachmentsSection";
import { RequestInstallationSection } from "./RequestInstallationSection";

type RequestDetailPageProps = {
  requestId: string;
};

export function RequestDetailPage({ requestId }: RequestDetailPageProps) {
  const request = useResource(resourceKeys.request(requestId), () => loadRequestDetail(requestId));
  const detail = request.data;
  const primary = detail ? presentRequestPrimaryAction(detail) : null;

  useEffect(() => {
    if (!detail) {
      return;
    }
    const stored = readConfiguratorSession();
    writeConfiguratorSession({
      ...stored,
      customerId: detail.customerId,
      requestId: detail.requestId,
      customerLabel: detail.customerDisplayName,
      requestLabel: detail.title,
    });
  }, [detail]);

  return (
    <SlicePage
      contextLabel="Cerere"
      currentHref={requestHref(requestId)}
      workspace="object"
      eyebrow="Cerere"
      title={detail?.title ?? "Cerere"}
      lead={detail?.commercialProgressLabel ?? detail?.description ?? undefined}
      meta={presentContextMeta([detail?.reference, detail?.customerDisplayName])}
      status={
        detail ? (
          <StatusBadge label={detail.statusLabel} tone={statusTone("workflow")} />
        ) : null
      }
      action={
        primary ? (
          <a className="hit" href={primary.actionHref}>
            <span className="button button--primary">{primary.actionLabel}</span>
          </a>
        ) : null
      }
    >
      {request.status === "error" && !detail ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi citită">
          Identitatea cererii nu este disponibilă.
        </InlineAlert>
      ) : null}
      {detail ? (
        <>
          <SurfacePanel title="Descriere" label="Descriere">
            <p>{detail.description || "Fără descriere."}</p>
          </SurfacePanel>
          {detail.linkedOffers.length > 0 ? (
            <SurfacePanel variant="quiet" title="Oferte legate" label="Oferte legate">
              {detail.linkedOffers.map((offer) => (
                <p key={offer.quoteSnapshotId}>
                  <a className="text-link" href={quoteHref(offer.productCode, offer.quoteSnapshotId)}>
                    {offer.reference ? `Deschide oferta ${offer.reference}` : "Deschide oferta"}
                  </a>
                </p>
              ))}
            </SurfacePanel>
          ) : null}
          <RequestAttachmentsSection
            requestId={detail.requestId}
            attachments={detail.attachments}
            canUploadAttachments={detail.canUploadAttachments}
          />
          <RequestInstallationSection detail={detail} />
        </>
      ) : request.status !== "error" ? (
        <SurfacePanel title="Descriere" label="Descriere" busy>
          <LoadingFloor variant="facts" label="Se citește cererea" />
        </SurfacePanel>
      ) : null}
    </SlicePage>
  );
}
