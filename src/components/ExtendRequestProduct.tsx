import { useEffect, useRef, useState } from "react";
import { createAssembly, loadAssemblyOfferings } from "../api/assemblies";
import { postJson } from "../api/http";
import type { DraftValues } from "../api/types";
import { invalidateResources } from "../data/resourceCache";
import { useResource } from "../data/useResource";
import { assemblyHref } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { readConfiguratorSession, writeConfiguratorSession } from "../session/configuratorSession";
import { Button } from "./Button";
import { InlineAlert } from "./InlineAlert";

/** Explicitly attach the reviewed child to an existing typed assembly contract. */
export function ExtendRequestProduct({ customerId, requestId, productCode, reviewId, values, drafts, confirmed, commercial, onPending }: {
  customerId: string; requestId: string; productCode: string; reviewId: string | null;
  values: DraftValues; drafts: Record<string, string>; confirmed: boolean; commercial: Record<string, unknown>;
  onPending: (pending: boolean) => void;
}) {
  const offerings = useResource("assembly-offerings", loadAssemblyOfferings);
  const candidate = offerings.data?.offerings.find(item => item.members.some(member => member.role !== "SUPPORT_PANEL" && member.productCode === productCode) && item.members.some(member => member.role === "SUPPORT_PANEL"));
  const source = candidate?.members.find(member => member.productCode === productCode);
  const support = candidate?.members.find(member => member.role === "SUPPORT_PANEL");
  const [assemblyId, setAssemblyId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  async function extend() {
    if (!candidate || !source || !reviewId || !confirmed || busy.current) return;
    const scope = generation.current;
    busy.current = true; setPending(true); onPending(true); setError(null);
    try {
      const id = assemblyId ?? await createAssembly(requestId, candidate.kind);
      if (scope !== generation.current) return;
      setAssemblyId(id);
      invalidateResources(`request-assemblies:${requestId}`);
      await postJson(`/api/assemblies/${encodeURIComponent(id)}/members`, { role: source.role, values, reviewId, ...commercial });
      if (scope !== generation.current) return;
      const previous = readConfiguratorSession();
      writeConfiguratorSession({ ...previous, drafts, draftContext: { customerId, requestId, productCode, assemblyId: id }, customerId, requestId, productCode });
      navigate(assemblyHref(id));
    } catch { if (scope === generation.current) setError("Configurația nu a putut fi atașată. Datele sunt păstrate; poți reîncerca."); }
    finally { busy.current = false; if (scope === generation.current) { setPending(false); onPending(false); } }
  }
  if (!candidate || !source || !support || offerings.data?.canCreate !== true) return null;
  return <div><p>Ai nevoie și de {support.label.toLocaleLowerCase("ro")}? Configurația curentă va fi păstrată ca parte a produsului compus.</p>
    <Button variant="secondary" disabled={!confirmed || !reviewId || pending} onClick={() => void extend()}>{pending ? "Se atașează configurația…" : `Adaugă ${support.label.toLocaleLowerCase("ro")}`}</Button>
    {!confirmed && <p className="ui-note">Confirmă configurația și recalculează prețul înainte de a o atașa.</p>}
    {error && <InlineAlert tone="error" title="Atașarea a eșuat">{error}{assemblyId && <a className="text-link" href={assemblyHref(assemblyId)}>Deschide ansamblul creat</a>}</InlineAlert>}
  </div>;
}
