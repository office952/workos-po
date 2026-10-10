import { useEffect, useRef, useState } from "react";
import { createAssembly, loadAssemblyOfferings, loadRequestAssemblies } from "../api/assemblies";
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

export function RequestProductSelection({ customerId, requestId }: { customerId: string; requestId: string }) {
  const catalog = useResource(resourceKeys.catalog(), loadCatalogProducts);
  const assemblies = useResource("assembly-offerings", loadAssemblyOfferings);
  const existing = useResource(`request-assemblies:${requestId}`, () => loadRequestAssemblies(requestId));
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const saving = useRef(false); const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  async function create(kind: string) {
    if (saving.current || assemblies.data?.canCreate !== true) return;
    saving.current = true; setPending(true); setError(null);
    const scope = generation.current;
    try { const id = await createAssembly(requestId, kind); invalidateResources(`request-assemblies:${requestId}`); if (scope === generation.current) navigate(assemblyHref(id)); }
    catch { if (scope === generation.current) setError("Lansarea ansamblului a eșuat. Reîncearcă."); }
    finally { saving.current = false; if (scope === generation.current) setPending(false); }
  }
  return <section id="alege-produs" aria-label="Produsul cererii">
    {existing.data && existing.data.length > 0 && <div><h3>Ansambluri începute</h3><ul>{existing.data.map(item => <li key={item.assemblyId}><a className="text-link" href={assemblyHref(item.assemblyId)}>{item.label}</a> · {item.statusLabel}</li>)}</ul></div>}
    {existing.status === "error" && <InlineAlert tone="error" title="Ansamblurile începute nu au putut fi citite"><Button variant="secondary" onClick={() => invalidateResources(`request-assemblies:${requestId}`)}>Reîncearcă citirea ansamblurilor</Button></InlineAlert>}
    <h2>Alege produsul pentru această cerere</h2>
    {assemblies.data?.canCreate && assemblies.data.offerings.length > 0 ? (
      <div>
        <h3>Litere pe panou ACM</h3>
        <p>Parcurs recomandat: configurează literele și panoul ACM, apoi verifică ansamblul și pregătește o singură ofertă.</p>
        {assemblies.data.offerings.map((item) => (
          <div key={item.kind}>
            <p>{item.summary}</p>
            <Button variant="primary" disabled={pending} onClick={() => void create(item.kind)}>
              {pending ? "Se creează…" : `Începe: ${item.label}`}
            </Button>
          </div>
        ))}
      </div>
    ) : null}
    <h3>Produs simplu</h3>
    <p>Pentru o singură piesă (litere, panou ACM sau logo), alege produsul de mai jos.</p>
    {!catalog.data && catalog.status !== "error" && <LoadingFloor variant="registry" label="Se citesc produsele disponibile" />}
    {catalog.status === "error" && <InlineAlert tone="error" title="Produsele nu au putut fi citite"><Button variant="secondary" onClick={() => invalidateResources(resourceKeys.catalog())}>Reîncearcă</Button></InlineAlert>}
    {catalog.data && <ProductPicker products={catalog.data} disabled={pending} onChoose={p => navigate(configuratorHref({ customerId, requestId, productCode: p.code }))} />}
    {assemblies.status === "error" && <InlineAlert tone="error" title="Produsele compuse nu au putut fi citite"><Button variant="secondary" onClick={() => invalidateResources("assembly-offerings")}>Reîncearcă produsele compuse</Button></InlineAlert>}
    {error && <InlineAlert tone="error" title="Crearea a eșuat">{error}</InlineAlert>}
  </section>;
}
