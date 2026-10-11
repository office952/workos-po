import { useEffect, useRef, useState } from "react";
import { createAssembly, existingCommercialWork, loadAssemblyOfferings, type AssemblyOffering } from "../api/assemblies";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCatalogProducts } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { assemblyHref, configuratorHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { Button } from "./Button";
import { InlineAlert } from "./InlineAlert";
import { LoadingFloor } from "./LoadingFloor";
import { ProductPicker } from "./ProductPicker";

/**
 * `first`: the request has no commercial work yet.
 * `additional`: work exists; starting more is an explicit, confirmed choice that never replaces it.
 */
export function RequestProductSelection({ customerId, requestId, mode = "first", existingLabel = null }: {
  customerId: string; requestId: string; mode?: "first" | "additional"; existingLabel?: string | null;
}) {
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const assemblies = useResource("assembly-offerings", loadAssemblyOfferings);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [existingAssemblyId, setExistingAssemblyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AssemblyOffering | null>(null);
  const saving = useRef(false); const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const additional = mode === "additional";
  async function create(kind: string) {
    if (saving.current || assemblies.data?.canCreate !== true) return;
    saving.current = true; setPending(true); setError(null); setExistingAssemblyId(null);
    const scope = generation.current;
    try {
      const id = await createAssembly(requestId, kind, { alternative: additional });
      invalidateResources(resourceKeys.request(requestId));
      if (scope === generation.current) navigate(assemblyHref(id));
    } catch (failure) {
      if (scope !== generation.current) return;
      const existing = existingCommercialWork(failure);
      if (existing) {
        setExistingAssemblyId(existing.assemblyId);
        setError(existing.reason || "Cererea are deja un ansamblu.");
        invalidateResources(resourceKeys.request(requestId));
      } else {
        setError("Lansarea ansamblului a eșuat. Reîncearcă.");
      }
    } finally { saving.current = false; if (scope === generation.current) { setPending(false); setConfirming(null); } }
  }
  const offerings = assemblies.data?.canCreate ? assemblies.data.offerings : [];
  const body = <>
    {offerings.length > 0 ? (
      <div>
        <h3>{additional ? "Variantă comercială nouă" : "Produs compus"}</h3>
        <p>{additional
          ? `Creează un ansamblu nou, separat${existingLabel ? ` de „${existingLabel}”` : ""}. Lucrul existent și oferta lui rămân neschimbate.`
          : "Parcurs recomandat: configurezi fiecare parte, verifici ansamblul și pregătești o singură ofertă."}</p>
        {offerings.map((item) => (
          <div key={item.kind}>
            <p>{item.summary}</p>
            <Button variant={additional ? "secondary" : "primary"} disabled={pending || confirming !== null} onClick={() => additional ? setConfirming(item) : void create(item.kind)}>
              {pending ? "Se creează…" : additional ? `Creează variantă nouă: ${item.label}` : `Începe: ${item.label}`}
            </Button>
          </div>
        ))}
        {confirming && (
          <InlineAlert tone="pending" title="Confirmă varianta comercială nouă">
            Se creează „{confirming.label}” ca lucrare separată în această cerere. Nu se copiază configurațiile și nu se modifică oferta existentă.
            <div className="configuration-action-tray__buttons">
              <Button disabled={pending} onClick={() => void create(confirming.kind)}>Confirmă varianta nouă</Button>
              <Button variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>Renunță</Button>
            </div>
          </InlineAlert>
        )}
      </div>
    ) : null}
    <h3>{additional ? "Produs separat" : "Produs simplu"}</h3>
    <p>{additional
      ? "Pentru un produs care nu face parte din lucrul existent. Va avea o ofertă proprie."
      : "Pentru o singură piesă (litere, panou ACM sau logo), alege produsul de mai jos."}</p>
    {!catalog.data && catalog.status !== "error" && <LoadingFloor variant="registry" label="Se citesc produsele disponibile" />}
    {catalog.status === "error" && <InlineAlert tone="error" title="Produsele nu au putut fi citite"><Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalog())}>Reîncearcă</Button></InlineAlert>}
    {catalog.data && <ProductPicker products={catalog.data} disabled={pending} onChoose={p => navigate(configuratorHref({ customerId, requestId, productCode: p.code }))} />}
    {assemblies.status === "error" && <InlineAlert tone="error" title="Produsele compuse nu au putut fi citite"><Button variant="secondary" onClick={() => invalidateResources("assembly-offerings")}>Reîncearcă produsele compuse</Button></InlineAlert>}
    {error && <InlineAlert tone={existingAssemblyId ? "blocked" : "error"} title={existingAssemblyId ? "Există deja lucru comercial" : "Crearea a eșuat"}>{error}{existingAssemblyId && <> <a className="text-link" href={assemblyHref(existingAssemblyId)}>Deschide ansamblul existent</a></>}</InlineAlert>}
  </>;
  if (additional) {
    return <details className="request-additional-work" aria-label="Altă lucrare pentru această cerere">
      <summary>Adaugă altă lucrare la această cerere</summary>
      {body}
    </details>;
  }
  return <section id="alege-produs" aria-label="Produsul cererii">
    <h2>Alege produsul pentru această cerere</h2>
    {body}
  </section>;
}
