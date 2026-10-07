import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/surfaces/clients.css";
import { presentCustomerId } from "../adapters/contextAdapter";
import { createCustomer } from "../api/customers";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InlineAlert } from "../components/InlineAlert";
import { collectionViewState } from "../components/collectionViewState";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateAfterCreateCustomer } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerRegistry } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { matchesSearch } from "../presentation/listFilter";
import { presentResourceAccess } from "../presentation/resourceAccess";
import { statusTone } from "../presentation/statusTone";
import { clientHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  readClientsRegistryMemory,
  writeClientsRegistryMemory,
} from "../session/clientsRegistryMemory";

const ALL = "all";

export function ClientsPage() {
  const loaded = useResource(resourceKeys.customers(), loadCustomerRegistry);
  const access = presentResourceAccess(loaded.error);
  const registry = access === "denied" ? { ...loaded, data: undefined } : loaded;
  const items = useMemo(() => registry.data?.customers ?? [], [registry.data]);
  const summary = registry.data?.summary;
  const remembered = readClientsRegistryMemory();
  const [name, setName] = useState("");
  const [query, setQuery] = useState(remembered.query);
  const [statusChip, setStatusChip] = useState(remembered.statusChip);
  const [selectedId, setSelectedId] = useState<string | null>(remembered.selectedId);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writeClientsRegistryMemory({ query, statusChip, selectedId });
  }, [query, selectedId, statusChip]);

  const visible = useMemo(
    () =>
      items.filter((customer) => {
        const matchesChip =
          statusChip === ALL ||
          (statusChip === "attention" && customer.needsAttention) ||
          (statusChip === "ACTIVE" && customer.status === "ACTIVE") ||
          (statusChip === "RETIRED" && customer.status === "RETIRED");
        return (
          matchesChip &&
          matchesSearch(query, [
            customer.displayName,
            customer.city,
            customer.cui,
            customer.contactName,
            customer.phone,
            customer.email,
            customer.statusLabel,
            customer.attentionLabel,
          ])
        );
      }),
    [items, query, statusChip],
  );

  const selected = visible.find((item) => item.customerId === selectedId) ?? null;
  if (selectedId && registry.status === "success" && !items.some((item) => item.customerId === selectedId)) {
    setSelectedId(null);
  }

  async function create(): Promise<void> {
    if (name.trim() === "") {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const created = presentCustomerId(await createCustomer(name.trim()));
      if (!created) {
        setSaveState("error");
        setSaveError("Clientul nu a putut fi creat.");
        return;
      }
      setName("");
      setSaveState("idle");
      invalidateAfterCreateCustomer();
      navigate(clientHref(created));
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof TransportError
          ? "Datele clientului nu sunt acceptate."
          : "Clientul nu a putut fi creat.",
      );
    }
  }

  const view = collectionViewState(registry.status, items.length, visible.length);
  const count = (value: number | undefined) =>
    registry.status === "success" && value !== undefined ? String(value).padStart(2, "0") : "—";

  return (
    <SlicePage
      contextLabel="Clienți"
      currentHref="/clienti"
      workspace="collection-with-rail"
      surface="clients-registry"
      eyebrow="Registru comercial"
      title="Clienți"
      lead="Găsește clientul și continuă lucrarea din fișa lui."
      meta={registry.status === "success" ? `${visible.length} rezultate` : undefined}
      instrument={
        <>
        <div className="clients-instrument" role="group" aria-label="Filtre registru clienți">
          <button
            type="button"
            className="clients-instrument__metric"
            aria-pressed={statusChip === ALL}
            onClick={() => setStatusChip(ALL)}
          >
            <strong className="clients-instrument__metric-value">{count(summary?.total)}</strong>
            <span className="clients-instrument__metric-label">Total</span>
          </button>
          <button
            type="button"
            className="clients-instrument__metric"
            aria-pressed={statusChip === "ACTIVE"}
            onClick={() => setStatusChip("ACTIVE")}
          >
            <strong className="clients-instrument__metric-value">{count(summary?.active)}</strong>
            <span className="clients-instrument__metric-label">Activi</span>
          </button>
          <button
            type="button"
            className="clients-instrument__metric"
            aria-pressed={statusChip === "RETIRED"}
            onClick={() => setStatusChip("RETIRED")}
          >
            <strong className="clients-instrument__metric-value">{count(summary?.retired)}</strong>
            <span className="clients-instrument__metric-label">Retrași</span>
          </button>
          <button
            type="button"
            className="clients-instrument__metric clients-instrument__metric--attention"
            data-attention={(summary?.needsAttention ?? 0) > 0}
            aria-pressed={statusChip === "attention"}
            onClick={() => setStatusChip("attention")}
          >
            <strong className="clients-instrument__metric-value">
              {count(summary?.needsAttention)}
            </strong>
            <span className="clients-instrument__metric-label">Necesită acțiune</span>
          </button>
        </div>
        <div className="clients-toolbar">
          <div className="clients-search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <label className="u-visually-hidden" htmlFor="clienti-cauta">
              Caută
            </label>
            <input
              ref={searchRef}
              id="clienti-cauta"
              type="search"
              placeholder="Caută denumire, oraș sau contact"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        </>
      }
    >
      <section className="clients-register" aria-label="Registru clienți">
        {registry.status === "error" && registry.data ? (
          <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
            Datele afișate sunt de la ultima citire reușită.
            <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.customers())}>
              Reîncearcă
            </Button>
          </InlineAlert>
        ) : null}
        <div className="clients-register__strip">
          <h2>{statusChip === "attention" ? "Necesită acțiune" : "Lista de clienți"}</h2>
          <span className="clients-result" role={view !== "ready" ? "status" : undefined}>
            {registry.status === "success" ? `${visible.length} din ${items.length}` : "—"}
          </span>
        </div>
        {view === "loading" ? (
          <p className="clients-feedback" role="status">
            Se citesc clienții
          </p>
        ) : view === "error" ? (
          <div className="clients-feedback">
            <ErrorState
              title={access === "denied" ? "Acces refuzat" : "Lista nu a putut fi citită"}
            >
              {access === "denied"
                ? "Nu ai acces la registrul de clienți în această organizație."
                : "Lista de clienți nu este disponibilă momentan."}
              <Button
                variant="secondary"
                onClick={() => invalidateResources(resourceKeys.customers())}
              >
                Reîncearcă
              </Button>
            </ErrorState>
          </div>
        ) : view === "empty" ? (
          <div className="clients-feedback">
            <EmptyState title="Nu există încă clienți" description="Înregistrează primul client." />
          </div>
        ) : view === "filtered-empty" ? (
          <div className="clients-feedback">
            <EmptyState title="Niciun client nu corespunde filtrului." />
          </div>
        ) : (
          <table className="clients-table">
            <caption className="u-visually-hidden">Clienți înregistrați</caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th className="clients-table__place" scope="col">
                  Localitate
                </th>
                <th className="clients-table__state" scope="col">
                  Stare
                </th>
                <th className="clients-table__action" scope="col">
                  Acțiune
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((customer) => (
                <tr
                  key={customer.customerId}
                  data-selected={customer.customerId === selected?.customerId ? "true" : undefined}
                  data-attention={customer.needsAttention ? "true" : undefined}
                >
                  <td className="clients-table__identity">
                    <a
                      className="clients-object"
                      href={clientHref(customer.customerId)}
                      onClick={() => setSelectedId(customer.customerId)}
                    >
                      <span className="clients-object__title">{customer.displayName}</span>
                      <span className="clients-object__detail">
                        {[
                          customer.contactName,
                          customer.attentionLabel,
                        ]
                          .filter(Boolean)
                          .join(" · ") || customer.cui || customer.city || "Date de contact necompletate"}
                      </span>
                    </a>
                  </td>
                  <td className="clients-table__place">
                    <span className="clients-place">{customer.city ?? "—"}</span>
                  </td>
                  <td className="clients-table__state">
                    <StatusBadge
                      label={customer.statusLabel}
                      tone={statusTone("workflow")}
                    />
                  </td>
                  <td className="clients-table__action">
                    <a
                      className="clients-next"
                      href={clientHref(customer.customerId)}
                      onClick={() => setSelectedId(customer.customerId)}
                    >
                      <span>Deschide</span>
                      <span aria-hidden="true">→</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {registry.status === "success" ? <SurfacePanel title="Client nou" label="Client nou">
        <div className="clients-create">
          <TextField id="customer-name" label="Denumire" value={name} onChange={setName} />
          <Button
            disabled={name.trim() === "" || saveState === "pending"}
            onClick={() => {
              void create();
            }}
          >
            Înregistrează clientul
          </Button>
          <p className="ui-note">Creează clientul și deschide hubul pentru continuare.</p>
          {saveError ? (
            <InlineAlert tone="error" title="Înregistrarea a eșuat">
              {saveError}
            </InlineAlert>
          ) : null}
        </div>
      </SurfacePanel> : null}
    </SlicePage>
  );
}
