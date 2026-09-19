import { useMemo, useState } from "react";
import { presentCustomerId } from "../adapters/contextAdapter";
import { createCustomer } from "../api/customers";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { FilterBar } from "../components/FilterBar";
import { InlineAlert } from "../components/InlineAlert";
import { EmptyState } from "../components/EmptyState";
import { CollectionBody } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterCreateCustomer } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { matchesSearch } from "../presentation/listFilter";
import { statusTone } from "../presentation/statusTone";
import { clientHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";

const COLUMNS = ["Client", "Loc", "Stare", "Acțiune"] as const;

export function ClientsPage() {
  const customers = useResource(resourceKeys.customers(), loadCustomerList);
  const items = useMemo(() => customers.data ?? [], [customers.data]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      items.filter((customer) =>
        matchesSearch(query, [customer.displayName, customer.city, customer.status]),
      ),
    [items, query],
  );

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

  return (
    <SlicePage
      contextLabel="Clienți"
      currentHref="/clienti"
      workspace="collection-with-rail"
      eyebrow="Clienți"
      title="Clienți"
      lead="Alege un client existent sau înregistrează unul nou pentru lucrare."
    >
      <SurfacePanel
        variant="flush"
        label="Listă clienți"
        busy={customers.status === "loading" && items.length === 0}
      >
        <FilterBar
          searchId="clienti-cauta"
          searchLabel="Caută"
          searchValue={query}
          onSearchChange={setQuery}
          meta={customers.status === "success" ? `${visible.length} din ${items.length}` : undefined}
        />
        <CollectionBody
          status={customers.status}
          itemCount={items.length}
          visibleCount={visible.length}
          loadingLabel="Se citesc clienții"
          columns={COLUMNS}
          worklistLabel="Clienți înregistrați"
          variant="commercial"
          errorTitle="Lista nu a putut fi citită"
          errorBody="Clienții nu sunt disponibili în acest runtime."
          empty={
            <EmptyState
              title="Nu există încă clienți"
              description="Înregistrează primul client."
            />
          }
          filteredEmpty={<EmptyState title="Niciun client nu corespunde filtrului." />}
        >
          {visible.map((customer) => (
            <WorklistRow
              key={customer.customerId}
              variant="commercial"
              href={clientHref(customer.customerId)}
              identity={customer.displayName}
              context={customer.city ?? "Client"}
              state={
                <StatusBadge
                  label={customer.status === "ACTIVE" ? "Activ" : customer.status}
                  tone={statusTone("workflow")}
                />
              }
              actionLabel="Deschide"
            />
          ))}
        </CollectionBody>
      </SurfacePanel>
      <SurfacePanel title="Client nou" label="Client nou">
        <TextField id="customer-name" label="Denumire" value={name} onChange={setName} />
        <Button
          disabled={name.trim() === "" || saveState === "pending"}
          onClick={() => {
            void create();
          }}
        >
          Înregistrează clientul
        </Button>
        {saveError ? (
          <InlineAlert tone="error" title="Înregistrarea a eșuat">
            {saveError}
          </InlineAlert>
        ) : null}
      </SurfacePanel>
    </SlicePage>
  );
}
