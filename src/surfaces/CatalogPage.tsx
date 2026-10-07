import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getJson, postJson } from "../api/http";
import { Button } from "../components/Button";
import { PageMetrics } from "../components/PageMetrics";
import { SelectField } from "../components/SelectField";
import "../styles/surfaces/commercial.css";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { InlineAlert } from "../components/InlineAlert";
import { CollectionBody } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import { resourceKeys } from "../data/resourceKeys";
import { invalidateResources } from "../data/resourceCache";
import { invalidateCustomerProjections } from "../data/invalidation";
import { loadCatalogProducts, loadRequestList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { configuratorHref, parseSpineContext, requestHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  labelsMatchingContext,
  readConfiguratorSession,
  resolveOwnedSpine,
  writeConfiguratorSession,
} from "../session/configuratorSession";

const ALL = "all";
const COLUMNS = ["Produs", "Familie", "Acțiune"] as const;

export function CatalogPage() {
  const context = parseSpineContext(window.location.search);
  const stored = readConfiguratorSession();
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const owned = resolveOwnedSpine({
    url: context,
    stored,
    requests: requests.status === "success" ? requests.data ?? [] : null,
  });
  const customerId = owned.customerId;
  const requestId = owned.requestId;
  const ownershipVerified = requests.status === "success";
  const canConfigure = ownershipVerified && Boolean(customerId && requestId);
  const products = useMemo(() => catalog.data ?? [], [catalog.data]);
  const contextRequest =
    (requests.data ?? []).find((item) => item.requestId === requestId) ?? null;
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(ALL);
  const [offerings, setOfferings] = useState<
    { kind: string; available: boolean; label: string; summary: string }[]
  >([]);

  const [offeringsAttempt, setOfferingsAttempt] = useState(0);
  const [offeringsError, setOfferingsError] = useState(false);
  const contextKey = JSON.stringify([customerId, requestId]);
  const [creation, setCreation] = useState<{ contextKey: string; kind: string | null; error: string | null } | null>(null);
  const [creationContext, setCreationContext] = useState(contextKey);
  // Do not revive an abandoned pending action when A → B → A reuses this page.
  if (creationContext !== contextKey) {
    setCreationContext(contextKey);
    setCreation(null);
  }
  const creatingKind = creation?.contextKey === contextKey ? creation.kind : null;
  const createError = creation?.contextKey === contextKey ? creation.error : null;
  const creationScope = useRef(0);
  useLayoutEffect(() => {
    creationScope.current += 1;
    return () => { creationScope.current += 1; };
  }, [customerId, requestId]);

  async function createAssembly(kind: string): Promise<void> {
    if (!canConfigure || !requestId || creatingKind) return;
    const scope = creationScope.current;
    setCreation({ contextKey, kind, error: null });
    try {
      const body = await postJson("/api/assemblies", { requestId, kind }) as { assembly?: { assemblyId?: string } };
      if (scope !== creationScope.current) return;
      if (!body.assembly?.assemblyId) throw new Error("missing assembly");
      invalidateCustomerProjections();
      navigate(`/ansamblu?assembly=${encodeURIComponent(body.assembly.assemblyId)}`);
    } catch {
      if (scope === creationScope.current) setCreation({ contextKey, kind: null, error: "Ansamblul nu a putut fi creat. Reîncearcă." });
    } finally {
      if (scope === creationScope.current) setCreation((current) => current && ({ ...current, kind: null }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    void getJson("/api/assemblies/offering")
      .then((body) => {
        if (cancelled) return;
        setOfferingsError(false);
        const record = body as {
          available?: unknown;
          label?: unknown;
          summary?: unknown;
          offerings?: unknown;
        };
        if (Array.isArray(record.offerings)) {
          setOfferings(
            record.offerings.flatMap((item) => {
              if (typeof item !== "object" || item === null) {
                return [];
              }
              const row = item as {
                kind?: unknown;
                available?: unknown;
                label?: unknown;
                summary?: unknown;
              };
              if (row.available !== true || typeof row.label !== "string" || typeof row.kind !== "string") {
                return [];
              }
              return [
                {
                  kind: row.kind,
                  available: true,
                  label: row.label,
                  summary: typeof row.summary === "string" ? row.summary : "",
                },
              ];
            }),
          );
          return;
        }
        if (record.available === true && typeof record.label === "string") {
          setOfferings([
            {
              kind: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
              available: true,
              label: record.label,
              summary: typeof record.summary === "string" ? record.summary : "",
            },
          ]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOfferings([]);
        setOfferingsError(true);
      });
    return () => { cancelled = true; };
  }, [offeringsAttempt]);

  useEffect(() => {
    if (!ownershipVerified) {
      return;
    }
    const previous = readConfiguratorSession();
    const matched = labelsMatchingContext(previous, { customerId, requestId });
    const customerLabel =
      matched.customerLabel ?? contextRequest?.customerDisplayName ?? null;
    const requestLabel =
      matched.requestLabel ??
      contextRequest?.reference ??
      contextRequest?.title ??
      null;
    writeConfiguratorSession({
      ...previous,
      customerId,
      requestId,
      customerLabel,
      requestLabel,
    });
  }, [contextRequest, customerId, requestId, ownershipVerified]);

  const sessionLabels = labelsMatchingContext(stored, { customerId, requestId });
  const labels = {
    customerLabel:
      sessionLabels.customerLabel ?? contextRequest?.customerDisplayName ?? null,
    requestLabel:
      sessionLabels.requestLabel ??
      contextRequest?.reference ??
      contextRequest?.title ??
      null,
  };

  const families = useMemo(
    () => uniqueLabels(products.map((product) => product.familyLabel)),
    [products],
  );

  const visible = useMemo(
    () =>
      products.filter((product) => {
        const matchesFamily = family === ALL || product.familyLabel === family;
        return (
          matchesFamily &&
          matchesSearch(query, [product.label, product.description, product.familyLabel])
        );
      }),
    [family, products, query],
  );

  const visibleOfferings = offerings.filter((item) => matchesSearch(query, [item.label, item.summary]));
  return (
    <SlicePage
      contextLabel="Catalog"
      currentHref="/catalog"
      workspace="stack"
      surface="catalog-registry"
      headerVariant="pilot"
      eyebrow="Alegere produs"
      title="Catalog"
      instrument={<PageMetrics items={[{ label: "Produse disponibile", value: catalog.status === "success" ? products.length : "—" }]} />}
    >
      {canConfigure && requestId ? <div className="commercial-toolbar">
        <div className="commercial-toolbar__context">
            <a className="text-link" href={requestHref(requestId)}>← Înapoi la cerere</a>
            <span>{presentContextMeta([labels.customerLabel, labels.requestLabel]) ?? "Clientul și cererea rămân contextul acestei configurări."}</span>
        </div>
      </div> : null}
      {requests.status === "idle" || requests.status === "loading" ? (
        <InlineAlert tone="pending" title="Se verifică cererea">
          Configurarea va fi disponibilă după verificarea clientului și a cererii.
        </InlineAlert>
      ) : requests.status === "error" ? (
        <InlineAlert tone="error" title="Cererea nu a putut fi verificată">
          <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.requests())}>Reîncearcă</Button>
          <a className="text-link" href="/cereri">Înapoi la cereri</a>
        </InlineAlert>
      ) : !canConfigure ? (
        <InlineAlert tone="blocked" title="Context incomplet">
          Catalogul are nevoie de un client și o cerere înainte de configurare.
          <a className="text-link" href="/cereri">Alege cererea</a>
        </InlineAlert>
      ) : null}
      <div className="commercial-toolbar">
        <FilterBar searchId="catalog-cauta" searchLabel="Caută" searchValue={query} onSearchChange={setQuery} variant="toolbar" searchPlaceholder="Caută produsul sau ansamblul" />
        <div className="commercial-toolbar__family">
          <SelectField id="catalog-family" label="Familie de produse" value={family} options={[{ value: ALL, label: "Toate" }, ...families.map((label) => ({ value: label, label }))]} onChange={setFamily} />
        </div>
        {query || family !== ALL ? <Button variant="secondary" onClick={() => { setQuery(""); setFamily(ALL); }}>Resetează filtrele</Button> : null}
      </div>
      <section className="commercial-register" aria-label="Produse">
        <div className="commercial-register__heading"><h2>Produse</h2><span>{catalog.status === "success" ? `${visible.length} din ${products.length}` : "—"}</span></div>
        <SurfacePanel variant="flush" label="Șabloane de produs" busy={catalog.status === "loading" && products.length === 0}>
          <CollectionBody status={catalog.status} itemCount={products.length} visibleCount={visible.length} loadingLabel="Se citește catalogul" columns={COLUMNS} worklistLabel="Șabloane de produs" variant="compact" errorTitle="Catalogul nu a putut fi citit" errorBody="Produsele nu sunt disponibile." empty={<EmptyState title="Catalogul nu are șabloane de prezentat." />} filteredEmpty={<EmptyState title="Niciun produs nu corespunde filtrului." />}>
            {visible.map((product) => <WorklistRow key={product.code} variant="compact" href={canConfigure ? configuratorHref({ customerId, requestId, productCode: product.code }) : undefined} identity={product.label} identityDetail={product.description || undefined} context={product.familyLabel ?? "Produs"} actionLabel={canConfigure ? "Deschide configurația" : "Necesită cerere"} />)}
          </CollectionBody>
        </SurfacePanel>
        {catalog.status === "error" ? <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalog())}>Reîncearcă citirea catalogului</Button> : null}
      </section>
      {offerings.length > 0 ? <section className="commercial-register" id="ansambluri" aria-label="Ansambluri">
        <div className="commercial-register__heading"><h2>Ansambluri</h2><span>{visibleOfferings.length} din {offerings.length}</span></div>
        <p className="commercial-note">Construiește un rezultat comun din produse configurate separat.</p>
        {createError ? <InlineAlert tone="error" title="Crearea a eșuat">{createError}</InlineAlert> : null}
        {visibleOfferings.length === 0 ? <EmptyState title="Niciun ansamblu nu corespunde căutării." /> : visibleOfferings.map((item) => <button key={item.kind} type="button" className="worklist-row worklist-row--compact catalog-assembly" disabled={!canConfigure || creatingKind !== null} onClick={() => void createAssembly(item.kind)}>
          <span className="worklist-row__identity"><span className="worklist-row__title">{item.label}</span><span className="worklist-row__detail">{item.summary}</span></span>
          <span className="worklist-row__context">Ansamblu</span>
          <span className="worklist-row__action">{creatingKind === item.kind ? "Se creează" : canConfigure ? "Creează ansamblul" : "Necesită cerere"}</span>
        </button>)}
      </section> : null}
      {offeringsError ? <InlineAlert tone="error" title="Ansamblurile nu au putut fi citite"><Button variant="secondary" onClick={() => setOfferingsAttempt((value) => value + 1)}>Reîncearcă citirea ansamblurilor</Button></InlineAlert> : null}
    </SlicePage>
  );
}
