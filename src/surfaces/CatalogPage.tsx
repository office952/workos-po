import { useEffect, useMemo, useState } from "react";
import { getJson, postJson } from "../api/http";
import { CatalogWorkspace } from "../components/CatalogWorkspace";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { InlineAlert } from "../components/InlineAlert";
import { CollectionBody } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import { resourceKeys } from "../data/resourceKeys";
import { loadCatalogProducts } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { presentContextMeta } from "../presentation/contextMeta";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { configuratorHref, parseSpineContext } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  labelsMatchingContext,
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";

const ALL = "all";
const COLUMNS = ["Produs", "Familie", "Acțiune"] as const;

export function CatalogPage() {
  const context = parseSpineContext(window.location.search);
  const stored = readConfiguratorSession();
  const customerId = context.customerId ?? stored.customerId;
  const requestId = context.requestId ?? stored.requestId;
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const products = useMemo(() => catalog.data ?? [], [catalog.data]);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(ALL);
  const [offering, setOffering] = useState<{ available: boolean; label: string; summary: string } | null>(
    null,
  );

  useEffect(() => {
    void getJson("/api/assemblies/offering")
      .then((body) => {
        const record = body as { available?: unknown; label?: unknown; summary?: unknown };
        if (record.available === true && typeof record.label === "string") {
          setOffering({
            available: true,
            label: record.label,
            summary: typeof record.summary === "string" ? record.summary : "",
          });
        }
      })
      .catch(() => {
        setOffering(null);
      });
  }, []);

  useEffect(() => {
    const previous = readConfiguratorSession();
    writeConfiguratorSession({
      ...previous,
      customerId,
      requestId,
      ...labelsMatchingContext(previous, { customerId, requestId }),
    });
  }, [customerId, requestId]);

  const labels = labelsMatchingContext(stored, { customerId, requestId });

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

  return (
    <SlicePage
      contextLabel="Catalog"
      currentHref="/catalog"
      workspace="catalog"
      eyebrow="Catalog"
      title="Catalog de produse"
      lead="Alege produsul lucrării. Configuratorul primește clientul, cererea și produsul selectat."
      meta={
        presentContextMeta([labels.customerLabel, labels.requestLabel]) ??
        (customerId && requestId
          ? "Clientul și cererea rămân contextul acestei configurări."
          : undefined)
      }
    >
      {!customerId || !requestId ? (
        <InlineAlert tone="blocked" title="Context incomplet">
          Catalogul are nevoie de un client și o cerere înainte de configurare.
        </InlineAlert>
      ) : null}
      <CatalogWorkspace
        families={families}
        selectedFamily={family}
        allLabel="Toate"
        onSelectFamily={setFamily}
      >
        <SurfacePanel
          variant="flush"
          label="Produse"
          busy={catalog.status === "loading" && products.length === 0}
        >
          <FilterBar
            searchId="catalog-cauta"
            searchLabel="Caută"
            searchValue={query}
            onSearchChange={setQuery}
            meta={
              catalog.status === "success"
                ? `${visible.length} din ${products.length}`
                : undefined
            }
          />
          <CollectionBody
            status={catalog.status}
            itemCount={products.length}
            visibleCount={visible.length}
            loadingLabel="Se citește catalogul"
            columns={COLUMNS}
            worklistLabel="Șabloane de produs"
            variant="compact"
            errorTitle="Catalogul nu a putut fi citit"
            errorBody="Produsele nu sunt disponibile."
            empty={<EmptyState title="Catalogul nu are șabloane de prezentat." />}
            filteredEmpty={
              <EmptyState title="Categoria nu are șabloane care să corespundă." />
            }
          >
            {offering?.available && requestId ? (
              <WorklistRow
                variant="compact"
                onSelect={() => {
                  void postJson("/api/assemblies", { requestId }).then((body) => {
                    const assembly = (body as { assembly?: { assemblyId?: string } }).assembly;
                    if (assembly?.assemblyId) {
                      navigate(`/ansamblu?assembly=${encodeURIComponent(assembly.assemblyId)}`);
                    }
                  });
                }}
                identity={offering.label}
                identityDetail={offering.summary}
                context="Ansamblu"
                actionLabel="Deschide ansamblul"
              />
            ) : null}
            {visible.map((product) => (
              <WorklistRow
                key={product.code}
                variant="compact"
                href={configuratorHref({
                  customerId,
                  requestId,
                  productCode: product.code,
                })}
                identity={product.label}
                identityDetail={product.description || undefined}
                context={product.familyLabel ?? "Produs"}
                actionLabel="Deschide configurația"
              />
            ))}
          </CollectionBody>
        </SurfacePanel>
      </CatalogWorkspace>
    </SlicePage>
  );
}
