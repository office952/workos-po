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
import { catalogHref, quoteHref, requestHref } from "../routing/appRoute";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";

type RequestDetailPageProps = {
  requestId: string;
};

export function RequestDetailPage({ requestId }: RequestDetailPageProps) {
  const request = useResource(resourceKeys.request(requestId), () => loadRequestDetail(requestId));
  const detail = request.data;

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

  const catalogUrl = detail
    ? catalogHref({
        customerId: detail.customerId,
        requestId: detail.requestId,
        productCode: null,
      })
    : null;

  return (
    <SlicePage
      contextLabel="Cerere"
      currentHref={requestHref(requestId)}
      workspace="object"
      eyebrow="Cerere"
      title={detail?.title ?? "Cerere"}
      lead="Alege produsul din catalog. Nu adăuga montaj pe această lucrare."
      meta={presentContextMeta([detail?.customerDisplayName])}
      status={
        detail ? (
          <StatusBadge label={detail.statusLabel} tone={statusTone("workflow")} />
        ) : null
      }
      action={
        catalogUrl ? (
          <a className="hit" href={catalogUrl}>
            <span className="button button--primary">Alege produsul din catalog</span>
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
          {detail.linkedQuoteIds.length > 0 ? (
            <SurfacePanel variant="quiet" title="Oferte legate" label="Oferte legate">
              {detail.linkedQuoteIds.map((quoteSnapshotId, index) => {
                const productCode = detail.linkedQuoteProductCodes[index];
                if (!productCode) {
                  return null;
                }
                return (
                  <p key={quoteSnapshotId}>
                    <a className="text-link" href={quoteHref(productCode, quoteSnapshotId)}>
                      Deschide oferta
                    </a>
                  </p>
                );
              })}
            </SurfacePanel>
          ) : null}
        </>
      ) : request.status !== "error" ? (
        <SurfacePanel title="Descriere" label="Descriere" busy>
          <LoadingFloor variant="facts" label="Se citește cererea" />
        </SurfacePanel>
      ) : null}
    </SlicePage>
  );
}
