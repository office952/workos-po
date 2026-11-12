import { useEffect, useMemo, useState } from "react";
import { presentCatalogCapabilities } from "../adapters/catalogCapabilitiesAdapter";
import { presentProductSystem } from "../adapters/productSystemAdapter";
import { fetchCatalogCapabilities } from "../api/catalogCapabilities";
import { fetchProductSystem, updateProductLabel } from "../api/productSystem";
import { TransportError } from "../api/http";
import { invalidateResourcePrefix, invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { CatalogComponentSheet } from "../features/catalog/CatalogComponentSheet";
import type { CatalogInspectorSession } from "../features/catalog/catalogPropertyInspector";
import { CatalogLibraryView, type CatalogLibraryProduct } from "../features/catalog/CatalogLibraryView";
import { CatalogProductBar, type CatalogRenameState } from "../features/catalog/CatalogProductBar";
import { CatalogProductSwitcher } from "../features/catalog/CatalogProductSwitcher";
import { CatalogStates } from "../features/catalog/CatalogStates";
import { CatalogStructureNav } from "../features/catalog/CatalogStructureNav";
import { CatalogStructureOverview } from "../features/catalog/CatalogStructureOverview";
import { CatalogTabs } from "../features/catalog/CatalogTabs";
import { CatalogVariants } from "../features/catalog/CatalogVariants";
import { CatalogProcessSection } from "../features/catalog/graph/CatalogProcessSection";
import { readCatalogSelection, writeCatalogSelection, type CatalogSelection, type CatalogTab } from "../features/catalog/catalogSelection";
import { EMPTY_LIBRARY_FILTERS, structureRows, type CatalogLibraryFilters } from "../features/catalog/catalogStructure";
import { PageRegion } from "../layout/PageRegion";
import "../styles/surfaces/catalog-v2.css";
import "../styles/surfaces/catalog-v2-library.css";
import "../styles/surfaces/catalog-v2-structure.css";
import "../styles/surfaces/catalog-v2-inspector.css";

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

const UNKNOWN_PRODUCT = "Produsul indicat nu face parte din biblioteca curentă.";

export function CatalogPage() {
  const capabilities = useResource(resourceKeys.catalogCapabilities(), loadCapabilities);
  const definitions = useResource(resourceKeys.productSystem(), loadProductSystem);
  const manifest = capabilities.data;
  const definitionsModel = definitions.data;
  const [selection, setSelection] = useState<CatalogSelection>(() => readCatalogSelection(window.location.search));
  const [rename, setRename] = useState<CatalogRenameState | null>(null);
  const [libraryFilters, setLibraryFilters] = useState<CatalogLibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [inspector, setInspector] = useState<CatalogInspectorSession>({ selectedId: null, open: false, returnTo: null });

  useEffect(() => {
    function syncFromLocation() {
      setSelection(readCatalogSelection(window.location.search));
      setRename(null);
    }
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const product = manifest?.products.find((item) => item.code === selection.productCode) ?? null;
  const unknownProduct = Boolean(manifest && selection.productCode && !product);
  const systemProduct = definitionsModel?.products.find((item) => item.code === product?.code) ?? null;
  const rows = useMemo(
    () => (product ? structureRows(product, definitionsModel?.types ?? []) : []),
    [product, definitionsModel],
  );
  const row = rows.find((item) => item.component.id === selection.componentId) ?? null;
  const unknownComponent = Boolean(product && selection.componentId && !row);
  const systemType = definitionsModel?.types.find((item) => item.typeId === row?.component.typeId) ?? null;
  const canRename = Boolean(product && systemProduct && definitionsModel?.canEdit && manifest?.permissions.canEditDisplayLabels);
  const readOnly = Boolean(manifest)
    && !manifest?.permissions.canEditEnablement
    && !manifest?.permissions.canEditTechnicalSettings
    && !manifest?.permissions.canEditFormulas
    && !manifest?.permissions.canEditDisplayLabels;
  const pending = rename?.pending ?? false;

  const libraryProducts = useMemo<CatalogLibraryProduct[]>(
    () => (manifest?.products ?? []).map((item) => {
      const defined = definitionsModel?.products.find((candidate) => candidate.code === item.code);
      return {
        code: item.code,
        label: item.label,
        description: defined?.description ?? "",
        familyLabel: defined?.familyLabel ?? null,
        categoryLabel: defined?.categoryLabel ?? null,
        componentCount: item.components.length,
        versionLabel: item.templateVersion,
        enablementLabel: item.enablementLabel,
        enablementTone: item.enablementTone,
      };
    }),
    [manifest, definitionsModel],
  );

  function go(next: CatalogSelection) {
    setSelection(next);
    setRename(null);
    if (next.productCode !== selection.productCode) {
      setInspector({ selectedId: null, open: false, returnTo: null });
    } else if (next.componentId !== selection.componentId && next.tab !== "constructie") {
      setInspector((current) => ({ ...current, open: false }));
    }
    writeCatalogSelection(next);
  }

  function chooseProduct(nextCode: string) {
    go({ productCode: nextCode, componentId: null, tab: selection.tab });
  }

  function chooseTab(nextTab: CatalogTab) {
    go({ productCode: selection.productCode, componentId: selection.componentId, tab: nextTab });
  }

  async function saveLabel() {
    if (!product || !systemProduct || rename === null || rename.pending || !canRename) return;
    setRename({ ...rename, pending: true, error: null, conflict: false });
    try {
      await updateProductLabel(product.code, rename.value.trim(), systemProduct.displayRevision);
      setRename(null);
      invalidateResources(resourceKeys.productSystem(), resourceKeys.catalog(), resourceKeys.catalogCapabilities());
      invalidateResourcePrefix("catalog-process-graph:");
    } catch (caught) {
      const conflict = caught instanceof TransportError && caught.status === 409;
      // Only report on the form that is still open: a navigation during the save closes it.
      setRename((current) => (current?.pending ? {
        value: current.value,
        pending: false,
        conflict,
        error: conflict ? "Denumirea a fost modificată între timp. Reîncarcă produsul înainte de salvare." : "Denumirea nu a putut fi salvată.",
      } : current));
    }
  }

  function reloadLabel() {
    setRename(null);
    invalidateResources(resourceKeys.productSystem(), resourceKeys.catalogCapabilities());
  }

  return (
    <PageRegion>
      <div className="catv2" data-surface="catalog-registry" data-view={product ? "product" : "library"}>
        <CatalogStates
          capabilitiesFailed={capabilities.status === "error"}
          definitionsFailed={definitions.status === "error"}
          hasManifest={Boolean(manifest)}
          hasDefinitions={Boolean(definitionsModel)}
          onRetryCapabilities={() => invalidateResources(resourceKeys.catalogCapabilities())}
          onRetryDefinitions={() => invalidateResources(resourceKeys.productSystem())}
        />
        {manifest && !product ? (
          <CatalogLibraryView products={libraryProducts} notice={unknownProduct ? UNKNOWN_PRODUCT : null} filters={libraryFilters} onFiltersChange={setLibraryFilters} onOpen={go} />
        ) : null}
        {manifest && product ? (
          <>
            <CatalogProductBar
              product={product}
              canRename={canRename}
              readOnly={readOnly}
              rename={rename}
              onRenameStart={() => setRename({ value: systemProduct?.label ?? product.label, pending: false, error: null, conflict: false })}
              onRenameChange={(value) => setRename((current) => (current ? { ...current, value } : current))}
              onRenameSave={() => void saveLabel()}
              onRenameCancel={() => setRename(null)}
              onRenameReload={reloadLabel}
              onNavigate={go}
              switcher={<CatalogProductSwitcher products={libraryProducts} currentCode={product.code} disabled={pending} onChoose={chooseProduct} />}
              tabs={<CatalogTabs selected={selection.tab} onSelect={chooseTab} disabled={pending} />}
            />
            {selection.tab === "constructie" ? (
              <div role="tabpanel" id="catalog-panel-constructie" aria-labelledby="catalog-tab-constructie" className="catv2-body catv2-body--structure" data-detail={row ? "component" : "overview"}>
                <CatalogStructureNav productCode={product.code} rows={rows} selectedId={row?.component.id ?? null} onNavigate={go} />
                <div className="catv2-body__main">
                  {row ? (
                    <CatalogComponentSheet
                      key={`${product.code}:${row.component.id}`}
                      product={product}
                      rows={rows}
                      row={row}
                      systemType={systemType}
                      permissions={manifest.permissions}
                      inspector={inspector}
                      onInspectorChange={setInspector}
                      onNavigate={go}
                    />
                  ) : (
                    <CatalogStructureOverview
                      product={product}
                      definition={systemProduct}
                      rows={rows}
                      canEditEnablement={manifest.permissions.canEditEnablement}
                      unknownComponent={unknownComponent}
                      onNavigate={go}
                    />
                  )}
                </div>
              </div>
            ) : null}
            {selection.tab === "proces" ? (
              <div role="tabpanel" id="catalog-panel-proces" aria-labelledby="catalog-tab-proces" className="catv2-body">
                <CatalogProcessSection key={`process-graph-${product.code}`} productCode={product.code} />
              </div>
            ) : null}
            {selection.tab === "variante" ? (
              <div role="tabpanel" id="catalog-panel-variante" aria-labelledby="catalog-tab-variante" className="catv2-body">
                <CatalogVariants key={product.code} productCode={product.code} preset={product.preset} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </PageRegion>
  );
}
