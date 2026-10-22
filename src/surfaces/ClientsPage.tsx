import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { presentCustomerId } from "../adapters/contextAdapter";
import { createCustomer } from "../api/customers";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { InlineAlert } from "../components/InlineAlert";
import { collectionViewState } from "../components/collectionViewState";
import { TextField } from "../components/TextField";
import { invalidateAfterCreateCustomer } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerRegistry } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { globalNavItems } from "../layout/globalNav";
import { PageRegion } from "../layout/PageRegion";
import { presentResourceAccess } from "../presentation/resourceAccess";
import { clientHref, clientsHref, parseClientsSelection } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { readClientsRegistryMemory, writeClientsRegistryMemory } from "../session/clientsRegistryMemory";
import { AgendaIndex } from "./clients/AgendaIndex";
import { ClientCard } from "./clients/ClientCard";
import { ClientsRegister } from "./clients/ClientsRegister";
import { agendaLetter, clientSignals, filterClients, type ClientChip, type ClientFilters } from "./clients/clientsAgendaModel";
import { DeskDialog, DeskDossier, type DeskVacancy } from "./desk/DeskDossier";
import { DeskSignalBoard } from "./desk/DeskSignalBoard";
import type { Density } from "./desk/DeskToolbar";
import { useDeskLayout } from "./desk/useDeskLayout";
import { useDeskSelection } from "./desk/useDeskSelection";
import "../styles/layout/registry-desk.css";
import "../styles/surfaces/clients-agenda.css";

const MODULE_INDEX = String(globalNavItems().findIndex((item) => item.href === "/clienti") + 1).padStart(2, "0");
const CHIPS: readonly ClientChip[] = ["all", "attention", "ACTIVE", "RETIRED"];

/**
 * Clienți: the agenda. An A–Z index over clients grouped by letter, and the client card in the
 * dossier, read from the client's workspace. The selected client lives in the URL (?client=…).
 */
export function ClientsPage({ search = "" }: { search?: string }) {
  const loaded = useResource(resourceKeys.customers(), loadCustomerRegistry);
  const access = presentResourceAccess(loaded.error);
  const registry = access === "denied" ? { ...loaded, data: undefined } : loaded;
  const items = useMemo(() => registry.data?.customers ?? [], [registry.data]);
  const [remembered] = useState(readClientsRegistryMemory);
  const [filters, setFilters] = useState<ClientFilters>({
    query: remembered.query,
    chip: CHIPS.includes(remembered.statusChip as ClientChip) ? (remembered.statusChip as ClientChip) : "all",
  });
  const [density, setDensity] = useState<Density>("comfortable");
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const creationScope = useRef(0);
  const layout = useDeskLayout();
  const selectedId = parseClientsSelection(search);

  useLayoutEffect(() => {
    creationScope.current += 1;
    return () => {
      creationScope.current += 1;
    };
  }, []);
  if (createOpen && registry.status !== "success") setCreateOpen(false);

  useEffect(() => {
    writeClientsRegistryMemory({ query: filters.query, statusChip: filters.chip, selectedId: null });
  }, [filters]);

  const visible = useMemo(() => filterClients(items, filters), [items, filters]);
  const order = useMemo(() => visible.map((customer) => customer.customerId), [visible]);
  const letters = useMemo(() => [...new Set(visible.map((customer) => agendaLetter(customer.displayName)))], [visible]);
  const view = collectionViewState(registry.status, items.length, visible.length);
  const listReady = registry.status === "success" || items.length > 0;
  const selected = items.find((customer) => customer.customerId === selectedId) ?? null;
  const selection = useDeskSelection({ layout, selectedId, href: clientsHref, order, searchRef });

  function changeFilters(next: ClientFilters): void {
    setFilters(next);
    if (selectedId && !filterClients(items, next).some((customer) => customer.customerId === selectedId)) selection.clear();
  }

  function onSignal(id: string): void {
    const chip = id as ClientChip;
    changeFilters({ ...filters, chip: filters.chip === chip && chip !== "all" ? "all" : chip });
  }

  function resetFilters(): void {
    changeFilters({ query: "", chip: "all" });
    searchRef.current?.focus();
  }

  async function create(): Promise<void> {
    if (name.trim() === "" || saveState === "pending" || registry.status !== "success") return;
    setSaveState("pending");
    setSaveError(null);
    const scope = creationScope.current;
    try {
      const created = presentCustomerId(await createCustomer(name.trim()));
      if (!created) {
        if (scope !== creationScope.current) return;
        setSaveState("error");
        setSaveError("Clientul nu a putut fi creat.");
        return;
      }
      invalidateAfterCreateCustomer();
      if (scope !== creationScope.current) return;
      setName("");
      setCreateOpen(false);
      setSaveState("idle");
      navigate(clientHref(created));
    } catch (error) {
      if (scope !== creationScope.current) return;
      setSaveState("error");
      setSaveError(error instanceof TransportError ? "Datele clientului nu sunt acceptate." : "Clientul nu a putut fi creat.");
    }
  }

  const vacancy: DeskVacancy | null = selected
    ? null
    : !listReady
      ? registry.status === "error"
        ? access === "denied"
          ? { title: "Dosarul nu este disponibil", body: "Accesul la registrul de clienți este refuzat în această organizație." }
          : { title: "Dosarul nu este disponibil", body: "Lista de clienți nu a putut fi citită." }
        : { title: "Se citește agenda", body: "Cartela se deschide după citirea listei de clienți." }
      : selectedId
        ? { title: "Clientul nu este în agendă", body: "Clientul cerut nu există sau nu este accesibil în această organizație." }
        : {
            title: "Niciun client selectat",
            body: "Alege un client din agendă sau din index. Cartela arată identitatea, contactul, cererile deschise și totalurile de oferte și lucrări.",
            hint: "↑ ↓ selectează · Enter deschide clientul",
          };

  const dossier = (
    <DeskDossier
      id="clienti-dosar"
      label="Cartela clientului"
      steps={{ previous: "Clientul anterior", next: "Clientul următor" }}
      layout={layout}
      position={selected ? { index: selection.index, count: visible.length } : null}
      vacancy={vacancy}
      onMove={selection.move}
      onClose={layout === "docked" ? undefined : selection.close}
    >
      {selected ? <ClientCard key={selected.customerId} customer={selected} /> : null}
    </DeskDossier>
  );

  return (
    <PageRegion>
      <div className="rdesk cagenda-desk" data-surface="clients-registry" data-layout={layout} data-density={density}>
        <header className="rdesk__bar">
          <div className="rdesk__title">
            <p className="rdesk__eyebrow"><span aria-hidden="true" />{MODULE_INDEX} · Registru comercial</p>
            <h1>Clienți</h1>
          </div>
          <DeskSignalBoard label="Filtre registru clienți" signals={clientSignals(registry.data, filters)} ready={listReady} onPress={onSignal} />
        </header>
        <div className="rdesk__instrument">
          <AgendaIndex letters={letters} layout={layout} />
        </div>
        <div className="rdesk__work">
          <ClientsRegister
            layout={layout}
            view={view}
            denied={access === "denied"}
            refreshFailed={registry.status === "error" && Boolean(registry.data)}
            items={visible}
            total={items.length}
            filters={filters}
            density={density}
            canCreate={registry.status === "success"}
            selectedId={selectedId}
            searchRef={searchRef}
            onFilters={changeFilters}
            onDensity={setDensity}
            onCreate={() => setCreateOpen(true)}
            onReset={resetFilters}
            onRetry={() => invalidateResources(resourceKeys.customers())}
            onSelect={layout === "docked" ? selection.select : selection.open}
            onOpen={selection.open}
          />
          {layout === "docked" ? dossier : null}
        </div>
        {selection.dialogOpen ? <DeskDialog layout={layout} label="Cartela clientului" onClose={selection.close}>{dossier}</DeskDialog> : null}
        <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
          {selected ? `Cartela afișează clientul ${selected.displayName}` : ""}
        </span>
      </div>
      {createOpen && registry.status === "success" ? (
        <CreationDialog title="Client nou" busy={saveState === "pending"} onDismiss={() => setCreateOpen(false)}>
          <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <TextField id="customer-name" label="Denumire" value={name} onChange={setName} disabled={saveState === "pending"} />
            <Button type="submit" disabled={name.trim() === "" || saveState === "pending"}>
              Înregistrează clientul
            </Button>
            <p className="ui-note">Creează clientul și deschide hubul pentru continuare.</p>
            {saveError ? (
              <InlineAlert tone="error" title="Înregistrarea a eșuat">
                {saveError}
              </InlineAlert>
            ) : null}
          </form>
        </CreationDialog>
      ) : null}
    </PageRegion>
  );
}
