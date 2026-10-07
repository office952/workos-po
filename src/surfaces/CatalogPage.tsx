import { useState } from "react";
import { presentProductSystem } from "../adapters/productSystemAdapter";
import { fetchProductSystem, updateProductLabel } from "../api/productSystem";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { ProductPicker } from "../components/ProductPicker";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";

async function loadProductSystem() {
  const model = presentProductSystem(await fetchProductSystem());
  if (!model) throw new Error("unpresentable_product_system");
  return model;
}

export function CatalogPage() {
  const loaded = useResource(resourceKeys.productSystem(), loadProductSystem);
  const [code, setCode] = useState<string | null>(() => new URLSearchParams(window.location.search).get("product"));
  const [typeId, setTypeId] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = loaded.data;
  const product = model?.products.find(p => p.code === code);
  const component = product?.composition.find(c => c.typeId === typeId) ?? product?.composition[0];
  const type = model?.types.find(t => t.typeId === component?.typeId);
  const attributes = type?.configurations.find(c => c.productCode === product?.code)?.attributes ?? [];

  async function saveLabel() {
    if (!product || rename === null || pending || !model?.canEdit) return;
    setPending(true); setError(null);
    try {
      await updateProductLabel(product.code, rename.trim(), product.displayRevision);
      setRename(null);
      invalidateResources(resourceKeys.productSystem(), resourceKeys.catalog());
    } catch (e) {
      setError(e instanceof TransportError && e.status === 409 ? "Denumirea a fost modificată între timp. Reîncarcă produsul înainte de salvare." : "Denumirea nu a putut fi salvată.");
    } finally { setPending(false); }
  }

  return <SlicePage contextLabel="Catalog" currentHref="/catalog" workspace="stack" surface="catalog-registry" headerVariant="pilot" eyebrow="Definiții de produse" title="Catalog" lead="Construcția produselor, materialele, procesele și regulile de calcul pentru lucrările noi.">
    <div className="product-system-links">
      <a className="text-link" href="/admin/products">Disponibilitatea produselor</a>
      <a className="text-link" href="/admin/technical">Setări tehnice</a>
      <a className="text-link" href="/admin/formulas">Formule de calcul</a>
    </div>
    {loaded.status === "error" && <InlineAlert tone="error" title="Definițiile produselor nu au putut fi citite">{model ? "Se afișează ultima versiune citită." : "Reîncearcă încărcarea."}<Button variant="secondary" onClick={() => invalidateResources(resourceKeys.productSystem())}>Reîncearcă</Button></InlineAlert>}
    {!model && loaded.status !== "error" && <LoadingFloor variant="registry" label="Se citesc definițiile produselor" />}
    {model && <div className="product-system-workspace">
      <ProductPicker products={model.products} selectedCode={code} disabled={pending} actionLabel="Deschide definiția" onChoose={p => { setCode(p.code); setTypeId(null); setRename(null); setError(null); }} />
      <div className="product-system-detail">
        {product ? <>
          <SurfacePanel title={product.label} label="Definiție produs">
            <p>{product.description}</p><p className="ui-note">{[product.familyLabel, product.categoryLabel].filter(Boolean).join(" · ")}</p>
            {model.canEdit && (rename === null ? <Button variant="secondary" onClick={() => setRename(product.label)}>Editează denumirea</Button> : <form onSubmit={e => { e.preventDefault(); void saveLabel(); }}>
              <TextField id="product-label" label="Denumire produs" value={rename} onChange={setRename} disabled={pending} />
              <Button type="submit" disabled={pending || !rename.trim()}>Salvează denumirea</Button><Button variant="secondary" disabled={pending} onClick={() => setRename(null)}>Anulează</Button>
            </form>)}
            {error && <InlineAlert tone="error" title="Salvarea a eșuat">{error}</InlineAlert>}
          </SurfacePanel>
          <nav className="product-system-detail__nav" aria-label="Componentele produsului">{product.composition.map(c => <button key={c.role} type="button" aria-pressed={component?.typeId === c.typeId} onClick={() => setTypeId(c.typeId)}>{c.roleLabel}</button>)}</nav>
          {type && <SurfacePanel title={component?.roleLabel ?? type.label} label="Construcție">
            <h3>{type.label}</h3><p>{type.description}</p>
            <dl className="product-system-facts">{attributes.map((a, i) => <div key={i}><dt>{a.label}</dt><dd>{a.valueDisplay}<small className="ui-note"> · {a.ownershipLabel}</small></dd></div>)}</dl>
            <h3>Măsurare și calcul</h3><p>{type.measurement} · {type.quantity}</p>
            <dl className="product-system-facts">{[...type.calculationInputs, ...type.calculationResults].map((line, i) => <div key={i}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
            <div className="product-system-links"><a className="text-link" href={`/admin/technical?component=${encodeURIComponent(type.typeId)}`}>Setările acestei componente</a><a className="text-link" href={`/admin/formulas?component=${encodeURIComponent(type.typeId)}`}>Formulele acestei componente</a></div>
            <h3>Materiale și resurse</h3><ul>{type.resourceReferences.map(r => <li key={r.id}>{r.label}</li>)}</ul>
            <h3>Procese</h3><ul>{type.processReferences.map(r => <li key={r.id}>{r.label}</li>)}</ul>
            <a className="text-link" href="/admin/resources">Tarifele resurselor</a>
            {type.gaps.length > 0 && <InlineAlert tone="pending" title="De completat în definiție">{type.gaps.join(" ")}</InlineAlert>}
          </SurfacePanel>}
          <p className="ui-note">Setările și formulele editabile sunt administrate în paginile lor. Proprietățile constructive fixe sunt prezentate pentru verificare; editorul complet de definiții nu este încă disponibil. Configurațiile și ofertele înghețate își păstrează versiunea.</p>
        </> : <SurfacePanel title="Selectează un produs" label="Definiție produs"><p>Deschide definiția pentru a verifica fața, cantul, spatele, iluminarea și modul de realizare, în funcție de produs.</p></SurfacePanel>}
      </div>
    </div>}
  </SlicePage>;
}
