import { useEffect, useState } from "react";
import { presentCatalogCapabilities } from "../adapters/catalogCapabilitiesAdapter";
import { presentProductSystem } from "../adapters/productSystemAdapter";
import { fetchCatalogCapabilities } from "../api/catalogCapabilities";
import { fetchProductSystem, updateProductLabel } from "../api/productSystem";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { TextField } from "../components/TextField";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { CatalogConstruction } from "../features/catalog/CatalogConstruction";
import { CatalogLibrary } from "../features/catalog/CatalogLibrary";
import { CatalogProperties } from "../features/catalog/CatalogProperties";
import { CatalogVariants } from "../features/catalog/CatalogVariants";
import { readCatalogSelection, writeCatalogSelection } from "../features/catalog/catalogSelection";
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
  const [rename, setRename] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function syncFromLocation() {
      const next = readCatalogSelection(window.location.search);
      setCode(next.productCode);
      setComponentId(next.componentId);
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

  function chooseProduct(nextCode: string) {
    const next = manifest?.products.find((item) => item.code === nextCode);
    const nextComponent = next?.components[0]?.id ?? null;
    setCode(nextCode);
    setComponentId(nextComponent);
    setRename(null);
    setError(null);
    writeCatalogSelection({ productCode: nextCode, componentId: nextComponent });
  }

  function chooseComponent(nextComponent: string) {
    setComponentId(nextComponent);
    writeCatalogSelection({ productCode: code, componentId: nextComponent });
  }

  async function saveLabel() {
    if (!product || !systemProduct || rename === null || pending || !canRename) return;
    setPending(true);
    setError(null);
    try {
      await updateProductLabel(product.code, rename.trim(), systemProduct.displayRevision);
      setRename(null);
      invalidateResources(resourceKeys.productSystem(), resourceKeys.catalog(), resourceKeys.catalogCapabilities());
    } catch (caught) {
      setError(caught instanceof TransportError && caught.status === 409 ? "Denumirea a fost modificată între timp. Reîncarcă produsul înainte de salvare." : "Denumirea nu a putut fi salvată.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SlicePage contextLabel="Catalog" currentHref="/catalog" workspace="stack" surface="catalog-registry" headerVariant="pilot" eyebrow="Definiții de produse" title="Catalog" lead="Biblioteca produselor validate, construcția lor și proprietățile fixe, setările organizației și faptele de pe lucrare.">
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
                  <h2>{product.label}</h2>
                  {systemProduct?.description ? <p>{systemProduct.description}</p> : null}
                  <p className="ui-note">{[systemProduct?.familyLabel, systemProduct?.categoryLabel].filter(Boolean).join(" · ")}</p>
                  {canRename && (rename === null ? (
                    <Button variant="secondary" disabled={pending} onClick={() => setRename(systemProduct?.label ?? product.label)}>Editează denumirea</Button>
                  ) : (
                    <form onSubmit={(event) => { event.preventDefault(); void saveLabel(); }}>
                      <TextField id="product-label" label="Denumire produs" value={rename} onChange={setRename} disabled={pending} />
                      <Button type="submit" disabled={pending || !rename.trim()}>Salvează denumirea</Button>
                      <Button variant="secondary" disabled={pending} onClick={() => setRename(null)}>Anulează</Button>
                    </form>
                  ))}
                  {error ? <InlineAlert tone="error" title="Salvarea a eșuat">{error}</InlineAlert> : null}
                </>
              ) : <p>{unknownProduct ? "Produsul indicat nu face parte din biblioteca curentă." : "Selectează un produs pentru construcție și proprietăți."}</p>}
            </div>
            <CatalogVariants key={product?.code ?? "none"} productCode={product?.code ?? null} preset={product?.preset ?? null} />
            <div className="catalog-workspace__regions">
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
              <CatalogConstruction product={product} component={component} systemType={systemType} unknownProduct={unknownProduct} onChooseComponent={chooseComponent} />
              <CatalogProperties product={product} component={component} platformLimits={manifest.platformLimits} permissions={manifest.permissions} unknownProduct={unknownProduct} />
            </div>
          </>
        )}
      </div>
    </SlicePage>
  );
}
