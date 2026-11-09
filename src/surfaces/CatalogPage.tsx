import { useEffect, useMemo, useState } from "react";
import { presentCatalogCapabilities } from "../adapters/catalogCapabilitiesAdapter";
import { presentProductSystem } from "../adapters/productSystemAdapter";
import { fetchCatalogCapabilities } from "../api/catalogCapabilities";
import { fetchProductSystem, updateProductLabel } from "../api/productSystem";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { TextField } from "../components/TextField";
import { invalidateResourcePrefix, invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { CatalogComponentDossier } from "../features/catalog/CatalogComponentDossier";
import { CatalogComponentNav, type CatalogComponentSummary } from "../features/catalog/CatalogComponentNav";
import { CatalogLibrary } from "../features/catalog/CatalogLibrary";
import { CatalogTabs } from "../features/catalog/CatalogTabs";
import { CatalogVariants } from "../features/catalog/CatalogVariants";
import { CatalogProcessSection } from "../features/catalog/graph/CatalogProcessSection";
import { readCatalogSelection, writeCatalogSelection, type CatalogTab } from "../features/catalog/catalogSelection";
import { SlicePage } from "../layout/SlicePage";
import "../styles/surfaces/catalog-workspace.css";

async function loadCapabilities() {
  const model = presentCatalogCapabilities(await fetchCatalogCapabilities());
  if (!model) throw new Error("unpresentable_catalog_capabilities");
  return model;
}

async function loadProductSystem() {
  const model = presentProductSystem(await fetchProductSystem());
  if (!model) throw new Error("unpresentable_product_system");
  return model;
}

export function CatalogPage() {
  const capabilities = useResource(resourceKeys.catalogCapabilities(), loadCapabilities);
  const definitions = useResource(resourceKeys.productSystem(), loadProductSystem);
  const manifest = capabilities.data;
  const definitionsModel = definitions.data;
  const initial = readCatalogSelection(window.location.search);
  const [code, setCode] = useState<string | null>(initial.productCode);
  const [componentId, setComponentId] = useState<string | null>(initial.componentId);
  const [tab, setTab] = useState<CatalogTab>(initial.tab);
  const [rename, setRename] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function syncFromLocation() {
      const next = readCatalogSelection(window.location.search);
      setCode(next.productCode);
      setComponentId(next.componentId);
      setTab(next.tab);
      setRename(null);
      setError(null);
    }
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);
  const product = manifest?.products.find((item) => item.code === code) ?? null;
  const unknownProduct = Boolean(manifest && code && !product);
  const component = product?.components.find((item) => item.id === componentId) ?? product?.components[0] ?? null;
  const systemProduct = definitionsModel?.products.find((item) => item.code === product?.code);
  const systemType = definitionsModel?.types.find((item) => item.typeId === component?.typeId) ?? null;
  const canRename = Boolean(product && systemProduct && definitionsModel?.canEdit && manifest?.permissions.canEditDisplayLabels);
  const catalogSelection = {
    productCode: code,
    componentId: component?.id ?? componentId,
    tab,
  };
  const componentSummaries = useMemo(() => {
    const summaries = new Map<string, CatalogComponentSummary>();
    for (const item of product?.components ?? []) {
      summaries.set(item.id, {
        settings: item.properties.filter((property) => property.group === "setting").length,
        formulas: item.properties.filter((property) => property.group === "formula").length,
        resources: definitionsModel?.types.find((type) => type.typeId === item.typeId)?.resourceReferences.length ?? 0,
      });
    }
    return summaries;
  }, [product, definitionsModel]);

  function chooseProduct(nextCode: string) {
    const next = manifest?.products.find((item) => item.code === nextCode);
    const nextComponent = next?.components[0]?.id ?? null;
    setCode(nextCode);
    setComponentId(nextComponent);
    setRename(null);
    setError(null);
    writeCatalogSelection({ productCode: nextCode, componentId: nextComponent, tab });
  }

  function chooseComponent(nextComponent: string) {
    setComponentId(nextComponent);
    writeCatalogSelection({ productCode: code, componentId: nextComponent, tab });
  }

  function chooseTab(nextTab: CatalogTab) {
    setTab(nextTab);
    writeCatalogSelection({ productCode: code, componentId: componentId, tab: nextTab });
  }

  async function saveLabel() {
    if (!product || !systemProduct || rename === null || pending || !canRename) return;
    setPending(true);
    setError(null);
    try {
      await updateProductLabel(product.code, rename.trim(), systemProduct.displayRevision);
      setRename(null);
      invalidateResources(resourceKeys.productSystem(), resourceKeys.catalog(), resourceKeys.catalogCapabilities());
      invalidateResourcePrefix("catalog-process-graph:");
    } catch (caught) {
      setError(caught instanceof TransportError && caught.status === 409 ? "Denumirea a fost modificată între timp. Reîncarcă produsul înainte de salvare." : "Denumirea nu a putut fi salvată.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SlicePage contextLabel="Catalog" currentHref="/catalog" workspace="stack" surface="catalog-registry" headerVariant="pilot-compact" eyebrow="Definiții de produse" title="Catalog" lead="Alegi produsul, apoi lucrezi în fișa componentei. Setările și formulele se modifică în administrare.">
      <div className="catalog-workspace">
        {capabilities.status === "error" && (
          <InlineAlert tone="error" title="Biblioteca de produse nu a putut fi citită">
            {manifest ? "Se afișează ultima versiune citită." : "Reîncearcă încărcarea."}
            <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalogCapabilities())}>Reîncearcă</Button>
          </InlineAlert>
        )}
        {definitions.status === "error" && (
          <InlineAlert tone="error" title="Definițiile produselor nu au putut fi citite">
            {definitionsModel ? "Se afișează ultima versiune citită." : "Detaliile de definiție lipsesc până la reîncercare."}
            <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.productSystem())}>Reîncearcă definițiile</Button>
          </InlineAlert>
        )}
        {!manifest && capabilities.status !== "error" && <LoadingFloor variant="registry" label="Se citește biblioteca de produse" />}
        {manifest && (
          <>
            <div className="catalog-workspace__identity">
              {product ? (
                <>
                  <div className="catalog-workspace__identity-copy">
                    <h2>{product.label}</h2>
                    <p className={`catalog-workspace__state catalog-workspace__state--${product.enablementTone}`}>{product.enablementLabel}</p>
                    {systemProduct?.description ? <p>{systemProduct.description}</p> : null}
                    <p className="ui-note catalog-workspace__identity-meta">{[systemProduct?.familyLabel, systemProduct?.categoryLabel].filter(Boolean).join(" · ")}</p>
                    <p className="catalog-workspace__links">
                      <a className="text-link" href="/admin/products">Disponibilitatea produselor</a>
                    </p>
                    {!manifest.permissions.canEditEnablement ? <p className="ui-note">Doar proprietarul poate schimba disponibilitatea.</p> : null}
                  </div>
                  {canRename && (
                    <div className="catalog-workspace__identity-actions">
                      {rename === null ? (
                        <Button variant="secondary" disabled={pending} onClick={() => setRename(systemProduct?.label ?? product.label)}>Editează denumirea</Button>
                      ) : (
                        <form onSubmit={(event) => { event.preventDefault(); void saveLabel(); }}>
                          <TextField id="product-label" label="Denumire produs" value={rename} onChange={setRename} disabled={pending} />
                          <Button type="submit" disabled={pending || !rename.trim()}>Salvează denumirea</Button>
                          <Button variant="secondary" disabled={pending} onClick={() => setRename(null)}>Anulează</Button>
                        </form>
                      )}
                    </div>
                  )}
                  {error ? <InlineAlert tone="error" title="Salvarea a eșuat">{error}</InlineAlert> : null}
                </>
              ) : <p>{unknownProduct ? "Produsul indicat nu face parte din biblioteca curentă." : "Selectează un produs din bibliotecă."}</p>}
            </div>
            <CatalogTabs selected={tab} onSelect={chooseTab} disabled={pending} />
            {tab === "constructie" ? (
              <div
                role="tabpanel"
                id="catalog-panel-constructie"
                aria-labelledby="catalog-tab-constructie"
              >
                <div className="catalog-workspace__regions">
                  <div className="catalog-workspace__nav">
                    <CatalogComponentNav
                      components={product?.components ?? []}
                      summaries={componentSummaries}
                      selectedId={component?.id ?? null}
                      disabled={pending || !product}
                      hasProduct={Boolean(product)}
                      unknownProduct={unknownProduct}
                      onChoose={chooseComponent}
                    />
                    <CatalogLibrary
                      products={manifest.products.map((item) => {
                        const defined = definitionsModel?.products.find((candidate) => candidate.code === item.code);
                        return {
                          code: item.code,
                          label: item.label,
                          description: defined?.description ?? "",
                          familyLabel: defined?.familyLabel ?? null,
                          categoryLabel: defined?.categoryLabel ?? null,
                          enablementLabel: item.enablementLabel,
                          enablementTone: item.enablementTone,
                        };
                      })}
                      selectedCode={product?.code ?? null}
                      disabled={pending}
                      onChoose={chooseProduct}
                    />
                  </div>
                  <CatalogComponentDossier
                    product={product}
                    component={component}
                    systemType={systemType}
                    platformLimits={manifest.platformLimits}
                    permissions={manifest.permissions}
                    unknownProduct={unknownProduct}
                    catalogSelection={catalogSelection}
                  />
                </div>
              </div>
            ) : null}
            {tab === "proces" ? (
              <div
                role="tabpanel"
                id="catalog-panel-proces"
                aria-labelledby="catalog-tab-proces"
              >
                {product ? (
                  <CatalogProcessSection key={`process-graph-${product.code}`} productCode={product.code} />
                ) : (
                  <section className="catalog-workspace__region">
                    <h2>Proces tehnologic</h2>
                    <p>{unknownProduct ? "Produsul indicat nu face parte din biblioteca curentă." : "Selectează un produs pentru a consulta procesul tehnologic."}</p>
                  </section>
                )}
              </div>
            ) : null}
            {tab === "variante" ? (
              <div
                role="tabpanel"
                id="catalog-panel-variante"
                aria-labelledby="catalog-tab-variante"
              >
                <CatalogVariants key={product?.code ?? "none"} productCode={product?.code ?? null} preset={product?.preset ?? null} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </SlicePage>
  );
}
