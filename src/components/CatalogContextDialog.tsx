import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TransportError } from "../api/http";
import { createRequest } from "../api/requests";
import type { CustomerTransport, RequestListItemTransport } from "../api/types";
import { presentCreatedRequestId } from "../adapters/requestAdapter";
import { loadCustomerList, loadCustomerWorkspace } from "../data/routeLoaders";
import { matchesSearch } from "../presentation/listFilter";
import { Button } from "./Button";
import { CreationDialog } from "./CreationDialog";
import { InlineAlert } from "./InlineAlert";
import { TextField } from "./TextField";

export type CatalogContextSelection = {
  customerId: string;
  requestId: string;
  customerLabel: string | null;
  requestLabel: string | null;
};

type CatalogContextDialogProps = {
  productLabel: string;
  busy?: boolean;
  onConfirm: (selection: CatalogContextSelection) => void;
  onDismiss: () => void;
};

type WorkspaceSlice = {
  canCreateRequest: boolean;
  requests: RequestListItemTransport[];
  customerDisplayName: string | null;
};

export function CatalogContextDialog({
  productLabel,
  busy = false,
  onConfirm,
  onDismiss,
}: CatalogContextDialogProps) {
  const [customers, setCustomers] = useState<CustomerTransport[] | null>(null);
  const [customersError, setCustomersError] = useState(false);
  const [customerLoadAttempt, setCustomerLoadAttempt] = useState(0);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSlice | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createState, setCreateState] = useState<"idle" | "pending" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const creationScope = useRef(0);

  useLayoutEffect(() => {
    creationScope.current += 1;
    return () => {
      creationScope.current += 1;
    };
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    void loadCustomerList()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setCustomers(list);
        setCustomersError(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCustomers(null);
        setCustomersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [customerLoadAttempt]);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    let cancelled = false;
    void loadCustomerWorkspace(customerId)
      .then((presented) => {
        if (cancelled) {
          return;
        }
        setWorkspace({
          canCreateRequest: presented.canCreateRequest,
          requests: presented.requests,
          customerDisplayName: presented.customer.displayName,
        });
        setWorkspaceStatus("success");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setWorkspace(null);
        setWorkspaceStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, workspaceAttempt]);

  const visibleCustomers = useMemo(() => {
    const list = customers ?? [];
    return list.filter((item) =>
      matchesSearch(customerQuery, [item.displayName, item.city, item.cui, item.contactName]),
    );
  }, [customerQuery, customers]);

  const selectedCustomer =
    customers?.find((item) => item.customerId === customerId) ?? null;
  const selectedRequest =
    workspace?.requests.find((item) => item.requestId === requestId) ?? null;

  function selectCustomer(nextCustomerId: string): void {
    setCustomerId(nextCustomerId);
    setRequestId(null);
    setCreateOpen(false);
    setTitle("");
    setDescription("");
    setCreateError(null);
    setCreateState("idle");
    setWorkspace(null);
    setWorkspaceStatus("loading");
    if (customerId === nextCustomerId) {
      setWorkspaceAttempt((value) => value + 1);
    }
  }

  async function create(): Promise<void> {
    if (
      !customerId ||
      title.trim() === "" ||
      description.trim() === "" ||
      createState === "pending" ||
      workspace?.canCreateRequest !== true
    ) {
      return;
    }
    const scope = creationScope.current;
    setCreateState("pending");
    setCreateError(null);
    try {
      const createdId = presentCreatedRequestId(
        await createRequest({
          customerId,
          title: title.trim(),
          description: description.trim(),
        }),
      );
      if (scope !== creationScope.current) {
        return;
      }
      if (!createdId) {
        setCreateState("error");
        setCreateError("Cererea nu a putut fi creată.");
        return;
      }
      onConfirm({
        customerId,
        requestId: createdId,
        customerLabel: selectedCustomer?.displayName ?? workspace?.customerDisplayName ?? null,
        requestLabel: title.trim(),
      });
    } catch (error) {
      if (scope !== creationScope.current) {
        return;
      }
      setCreateState("error");
      setCreateError(
        error instanceof TransportError
          ? "Cererea nu este acceptată."
          : "Cererea nu a putut fi creată.",
      );
    }
  }

  const confirmDisabled =
    busy ||
    createState === "pending" ||
    !customerId ||
    !requestId ||
    !selectedRequest;

  return (
    <CreationDialog title="Completează contextul comercial" busy={busy || createState === "pending"} onDismiss={onDismiss}>
      <div className="catalog-context-dialog">
        <p className="ui-note">
          Produs ales: <strong>{productLabel}</strong>. Alege clientul și cererea înainte de configurare.
          Nu se creează o cerere doar prin deschiderea acestui panou.
        </p>
        {customersError ? (
          <InlineAlert tone="error" title="Clienții nu au putut fi citiți">
            <Button
              variant="secondary"
              onClick={() => {
                setCustomerLoadAttempt((value) => value + 1);
              }}
            >
              Reîncearcă
            </Button>
          </InlineAlert>
        ) : null}
        <TextField
          id="catalog-context-customer-search"
          label="Caută clientul"
          value={customerQuery}
          onChange={setCustomerQuery}
          disabled={busy || createState === "pending"}
        />
        <div className="catalog-context-dialog__list" role="listbox" aria-label="Clienți">
          {customers === null && !customersError ? (
            <p className="ui-note">Se citesc clienții…</p>
          ) : null}
          {customers && visibleCustomers.length === 0 ? (
            <p className="ui-note">Niciun client nu corespunde căutării.</p>
          ) : null}
          {visibleCustomers.map((item) => (
            <button
              key={item.customerId}
              type="button"
              role="option"
              aria-selected={item.customerId === customerId}
              className={
                item.customerId === customerId
                  ? "catalog-context-dialog__option catalog-context-dialog__option--selected"
                  : "catalog-context-dialog__option"
              }
              disabled={busy || createState === "pending"}
              onClick={() => selectCustomer(item.customerId)}
            >
              <span>{item.displayName}</span>
              {item.city ? <span className="catalog-context-dialog__meta">{item.city}</span> : null}
            </button>
          ))}
        </div>
        {customerId ? (
          <div className="catalog-context-dialog__requests">
            <h3>Cereri ale clientului</h3>
            {workspaceStatus === "loading" ? (
              <p className="ui-note">Se citesc cererile…</p>
            ) : null}
            {workspaceStatus === "error" ? (
              <InlineAlert tone="error" title="Cererile clientului nu au putut fi citite">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setWorkspaceStatus("loading");
                    setWorkspaceAttempt((value) => value + 1);
                  }}
                >
                  Reîncearcă
                </Button>
              </InlineAlert>
            ) : null}
            {workspaceStatus === "success" && workspace ? (
              <>
                {workspace.requests.length === 0 ? (
                  <p className="ui-note">Acest client nu are cereri existente.</p>
                ) : (
                  <div className="catalog-context-dialog__list" role="listbox" aria-label="Cereri">
                    {workspace.requests.map((item) => (
                      <button
                        key={item.requestId}
                        type="button"
                        role="option"
                        aria-selected={item.requestId === requestId}
                        className={
                          item.requestId === requestId
                            ? "catalog-context-dialog__option catalog-context-dialog__option--selected"
                            : "catalog-context-dialog__option"
                        }
                        disabled={busy || createState === "pending"}
                        onClick={() => {
                          setRequestId(item.requestId);
                          setCreateOpen(false);
                        }}
                      >
                        <span>{item.reference ?? item.title}</span>
                        <span className="catalog-context-dialog__meta">{item.statusLabel}</span>
                      </button>
                    ))}
                  </div>
                )}
                {workspace.canCreateRequest ? (
                  createOpen ? (
                    <div className="catalog-context-dialog__create">
                      <TextField
                        id="catalog-context-request-title"
                        label="Titlu cerere nouă"
                        value={title}
                        onChange={setTitle}
                        disabled={createState === "pending"}
                      />
                      <TextField
                        id="catalog-context-request-description"
                        label="Descriere"
                        value={description}
                        onChange={setDescription}
                        disabled={createState === "pending"}
                      />
                      <div className="catalog-context-dialog__actions">
                        <Button
                          disabled={
                            title.trim() === "" ||
                            description.trim() === "" ||
                            createState === "pending"
                          }
                          onClick={() => {
                            void create();
                          }}
                        >
                          {createState === "pending" ? "Se creează…" : "Creează cererea"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={createState === "pending"}
                          onClick={() => {
                            setCreateOpen(false);
                            setTitle("");
                            setDescription("");
                            setCreateError(null);
                            setCreateState("idle");
                          }}
                        >
                          Anulează crearea
                        </Button>
                      </div>
                      {createError ? (
                        <InlineAlert tone="error" title="Crearea a eșuat">
                          {createError}
                          <Button
                            variant="secondary"
                            disabled={createState === "pending"}
                            onClick={() => {
                              void create();
                            }}
                          >
                            Reîncearcă
                          </Button>
                        </InlineAlert>
                      ) : null}
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy || createState === "pending"}
                      onClick={() => {
                        setCreateOpen(true);
                        setRequestId(null);
                      }}
                    >
                      Creează o cerere nouă
                    </Button>
                  )
                ) : (
                  <InlineAlert tone="blocked" title="Crearea cererii nu este disponibilă">
                    Rolul curent nu poate crea cereri pentru acest client.
                  </InlineAlert>
                )}
              </>
            ) : null}
          </div>
        ) : null}
        <div className="catalog-context-dialog__actions">
          <Button
            disabled={confirmDisabled}
            onClick={() => {
              if (!customerId || !selectedRequest) {
                return;
              }
              onConfirm({
                customerId,
                requestId: selectedRequest.requestId,
                customerLabel:
                  selectedCustomer?.displayName ?? workspace?.customerDisplayName ?? null,
                requestLabel: selectedRequest.reference ?? selectedRequest.title,
              });
            }}
          >
            Continuă la configurare
          </Button>
          <Button variant="secondary" disabled={busy || createState === "pending"} onClick={onDismiss}>
            Anulează
          </Button>
        </div>
      </div>
    </CreationDialog>
  );
}
