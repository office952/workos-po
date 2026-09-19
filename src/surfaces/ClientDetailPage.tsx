import { useEffect, useMemo, useState } from "react";
import { presentCreatedRequestId } from "../adapters/requestAdapter";
import { TransportError } from "../api/http";
import { createRequest } from "../api/requests";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { EmptyState } from "../components/EmptyState";
import { CollectionBody } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterCreateRequest } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomer, loadRequestList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { statusTone } from "../presentation/statusTone";
import { catalogHref, clientHref, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";

type ClientDetailPageProps = {
  customerId: string;
};

const COLUMNS = ["Cerere", "Context", "Stare", "Acțiune"] as const;

export function ClientDetailPage({ customerId }: ClientDetailPageProps) {
  const customer = useResource(resourceKeys.customer(customerId), () => loadCustomer(customerId));
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const mine = useMemo(
    () => (requests.data ?? []).filter((item) => item.customerId === customerId),
    [customerId, requests.data],
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer.data) {
      return;
    }
    const stored = readConfiguratorSession();
    writeConfiguratorSession({
      ...stored,
      customerId,
      customerLabel: customer.data.displayName,
      requestLabel: stored.customerId === customerId ? stored.requestLabel ?? null : null,
    });
  }, [customer.data, customerId]);

  async function create(): Promise<void> {
    if (title.trim() === "" || description.trim() === "") {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const requestId = presentCreatedRequestId(
        await createRequest({
          customerId,
          title: title.trim(),
          description: description.trim(),
        }),
      );
      if (!requestId) {
        setSaveState("error");
        setSaveError("Cererea nu a putut fi creată.");
        return;
      }
      invalidateAfterCreateRequest(customerId);
      navigate(requestHref(requestId));
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof TransportError
          ? "Cererea nu este acceptată."
          : "Cererea nu a putut fi creată.",
      );
    }
  }

  return (
    <SlicePage
      contextLabel="Client"
      currentHref={clientHref(customerId)}
      workspace="object"
      eyebrow="Client"
      title={customer.data?.displayName ?? "Client"}
      lead="Deschide o cerere existentă sau creează cererea pentru această lucrare."
      meta={
        [customer.data?.city, "Montajul nu face parte din această lucrare."]
          .filter(Boolean)
          .join(" · ")
      }
      status={
        customer.data ? (
          <StatusBadge
            label={customer.data.status === "ACTIVE" ? "Activ" : customer.data.status}
            tone={statusTone("workflow")}
          />
        ) : null
      }
    >
      <SurfacePanel
        variant="flush"
        title="Cereri ale clientului"
        meta={
          requests.status === "success"
            ? `${mine.length} ${mine.length === 1 ? "cerere" : "cereri"}`
            : undefined
        }
        label="Cereri"
        busy={requests.status === "loading" && mine.length === 0}
      >
        <CollectionBody
          status={requests.status}
          itemCount={mine.length}
          visibleCount={mine.length}
          loadingLabel="Se citesc cererile clientului"
          columns={COLUMNS}
          worklistLabel="Cereri ale clientului"
          variant="commercial"
          errorTitle="Cererile nu au putut fi citite"
          errorBody="Lista de cereri nu este disponibilă."
          empty={
            <EmptyState
              title="Nu există cereri"
              description="Creează cererea lucrării."
            />
          }
          filteredEmpty={
            <EmptyState
              title="Nu există cereri"
              description="Creează cererea lucrării."
            />
          }
        >
          {mine.map((item) => (
            <WorklistRow
              key={item.requestId}
              variant="commercial"
              href={requestHref(item.requestId)}
              identity={item.title}
              identityDetail={
                [item.reference && item.reference !== item.title ? item.reference : null, formatTimestamp(item.updatedAt)]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              context={item.contextLabel ?? item.statusLabel}
              state={<StatusBadge label={item.statusLabel} tone={statusTone("workflow")} />}
              actionLabel={item.nextActionLabel || "Deschide"}
            />
          ))}
        </CollectionBody>
        {customer.data ? (
          <div className="ui-panel__pad">
            <p>
              <a
                className="text-link"
                href={catalogHref({
                  customerId,
                  requestId: null,
                  productCode: null,
                })}
              >
                Deschide catalogul pentru acest client
              </a>
            </p>
          </div>
        ) : null}
      </SurfacePanel>
      <div className="stack">
        {customer.status === "error" && !customer.data ? (
          <InlineAlert tone="error" title="Clientul nu a putut fi citit">
            Identitatea clientului nu este disponibilă.
          </InlineAlert>
        ) : null}
        <SurfacePanel title="Cerere nouă" label="Cerere nouă">
          <TextField id="request-title" label="Titlu" value={title} onChange={setTitle} />
          <TextField
            id="request-description"
            label="Descriere"
            value={description}
            onChange={setDescription}
          />
          <Button
            disabled={title.trim() === "" || description.trim() === "" || saveState === "pending"}
            onClick={() => {
              void create();
            }}
          >
            Creează cererea
          </Button>
          {saveError ? (
            <InlineAlert tone="error" title="Crearea a eșuat">
              {saveError}
            </InlineAlert>
          ) : null}
          <p className="ui-note">
            Clientul rămâne contextul. Cererea pornește fluxul comercial și operațional.
          </p>
        </SurfacePanel>
      </div>
    </SlicePage>
  );
}
