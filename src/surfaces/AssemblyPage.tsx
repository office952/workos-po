import { useState } from "react";
import { getJson, postJson } from "../api/http";
import { invalidateCustomerProjections } from "../data/invalidation";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { LoadingFloor } from "../components/LoadingFloor";
import "../styles/surfaces/commercial.css";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { configuratorHref, requestHref } from "../routing/appRoute";

type AssemblyScope = {
  id: "acm" | "logo" | "letters" | "relation" | "summary";
  title: string;
  complete: boolean;
  summary: string;
  productCode?: string | null;
  role?: string | null;
};

type AssemblyView = {
  assemblyId: string;
  customerId: string | null;
  requestId: string | null;
  label: string;
  statusLabel: string;
  stale: boolean;
  staleReason: string | null;
  canConfirm: boolean;
  scopes: AssemblyScope[];
  quote: {
    label: string;
    sections: { title: string; inscription: string; grossPrice: number }[];
    netPrice: number;
    vatAmount: number;
    grossPrice: number;
    currency: "EUR";
  } | null;
  orderId: string | null;
  productionId: string | null;
  executionPlanId: string | null;
};

export function assemblyLead(hasLogo: boolean, lettersPresent: boolean): string {
  if (!hasLogo) {
    return "Configurează panoul și literele, apoi confirmă ansamblul.";
  }
  if (lettersPresent) {
    return "Configurează panoul, literele și logo-ul, apoi confirmă ansamblul.";
  }
  return "Configurează panoul și logo-ul. Literele sunt opționale.";
}

function memberConfiguratorHref(
  assembly: AssemblyView,
  scope: AssemblyScope,
): string | null {
  if (!scope.productCode || !scope.role || !assembly.customerId || !assembly.requestId) {
    return null;
  }
  return configuratorHref({
    customerId: assembly.customerId,
    requestId: assembly.requestId,
    productCode: scope.productCode,
  }).concat(
    `&assembly=${encodeURIComponent(assembly.assemblyId)}&role=${encodeURIComponent(scope.role)}`,
  );
}

function firstIncompleteMemberScope(scopes: AssemblyScope[]): AssemblyScope | null {
  for (const scope of scopes) {
    if (scope.id === "summary" || scope.id === "relation") {
      continue;
    }
    if (!scope.complete) {
      return scope;
    }
  }
  return null;
}

async function loadAssembly(assemblyId: string): Promise<AssemblyView> {
  const body = (await getJson(`/api/assemblies/${encodeURIComponent(assemblyId)}`)) as {
    assembly: AssemblyView;
  };
  return body.assembly;
}

export function AssemblyPage() {
  const assemblyId = new URLSearchParams(window.location.search).get("assembly");
  const [scopeId, setScopeId] = useState<AssemblyScope["id"]>("summary");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loaded = useResource(
    assemblyId ? resourceKeys.assembly(assemblyId) : null,
    () => loadAssembly(assemblyId ?? ""),
    { staleMs: -1 },
  );
  const assembly = loaded.data ?? null;

  async function run(path: string): Promise<void> {
    if (!assemblyId || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = (await postJson(path)) as { assembly: AssemblyView };
      if (assemblyId) {
        writeResource(resourceKeys.assembly(assemblyId), body.assembly);
      }
      invalidateCustomerProjections();
    } catch {
      setError("Acțiunea nu a putut fi finalizată.");
    } finally {
      setPending(false);
    }
  }

  const scope = assembly?.scopes.find((item) => item.id === scopeId) ?? assembly?.scopes[0];
  const productCode = scope?.productCode;
  const role = scope?.role;
  const hasLogo = assembly?.scopes.some((item) => item.id === "logo") ?? false;
  const lettersPresent =
    assembly?.scopes.some((item) => item.id === "letters" && item.complete) ?? false;
  const incompleteMember = assembly ? firstIncompleteMemberScope(assembly.scopes) : null;
  const incompleteMemberHref =
    assembly && incompleteMember ? memberConfiguratorHref(assembly, incompleteMember) : null;

  return (
    <SlicePage
      contextLabel="Ansamblu"
      currentHref="/ansamblu"
      workspace="stack"
      surface="assembly-workbench"
      headerVariant="pilot"
      eyebrow="Ansamblu"
      title={assembly?.label ?? "Panou ACM + litere volumetrice"}
      lead={assemblyLead(hasLogo, lettersPresent)}
    >
      <div className="commercial-toolbar">
        <a className="text-link" href={assembly?.requestId ? requestHref(assembly.requestId) : "/cereri"}>← Înapoi la cerere</a>
      </div>
      {!assemblyId ? (
        <InlineAlert tone="blocked" title="Ansamblu lipsă">
          Deschide ansamblul din cererea pentru care lucrezi.
        </InlineAlert>
      ) : null}
      {loaded.status === "error" || error ? (
        <InlineAlert tone="error" title="Ansamblul nu este disponibil">
          {error ?? "Ansamblul nu a putut fi citit."}
        </InlineAlert>
      ) : null}
      {assembly?.stale ? (
        <InlineAlert tone="blocked" title="Necesită revizuire">
          {assembly.staleReason ?? "Un produs a fost reconfirmat. Revizuiește ansamblul."}
        </InlineAlert>
      ) : null}
      {assembly ? (
        <div className="commercial-object">
          <div className="filter-bar filter-bar--toolbar" role="group" aria-label="Părțile ansamblului">
            <div className="filter-bar__chips">
              {assembly.scopes.map((item) => (
                <Button variant="secondary" aria-pressed={scope?.id === item.id} key={item.id} onClick={() => setScopeId(item.id)}>
                  {item.title}
                  {item.id !== "summary" && item.id !== "relation" ? (
                    <StatusBadge
                      label={item.complete ? "Complet" : "De configurat"}
                      tone={item.complete ? "ready" : "incomplete"}
                    />
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
          {scope && scope.id !== "summary" ? (
            <SurfacePanel title={scope.title} label={scope.title}>
              <p>{scope.summary}</p>
              <InfoRow label="Stare" value={scope.complete ? "Complet" : "Necesită date"} />
              {productCode && role && assembly.customerId && assembly.requestId ? (
                <p>
                  <a
                    className="text-link"
                    href={configuratorHref({
                      customerId: assembly.customerId,
                      requestId: assembly.requestId,
                      productCode,
                    }).concat(
                      `&assembly=${encodeURIComponent(assembly.assemblyId)}&role=${role}`,
                    )}
                  >
                    Deschide configurația
                  </a>
                </p>
              ) : null}
            </SurfacePanel>
          ) : null}
          <SurfacePanel title="Rezumat ansamblu" label="Rezumat">
            <InfoRow label="Ansamblu" value={assembly.label} />
            <InfoRow label="Stare" value={assembly.statusLabel} />
            <dl>
              {assembly.scopes
                .filter((item) => item.id !== "summary" && item.id !== "relation")
                .map((item) => (
                  <InfoRow
                    key={item.id}
                    label={item.title}
                    value={item.complete ? "Complet" : "Necesită configurare"}
                  />
                ))}
            </dl>
            {!assembly.stale && incompleteMember && incompleteMemberHref ? (
              <InlineAlert tone="pending" title="Următorul pas">
                Configurează {incompleteMember.title.toLowerCase()} înainte de confirmarea ansamblului.{" "}
                <a className="text-link" href={incompleteMemberHref}>
                  Deschide {incompleteMember.title.toLowerCase()}
                </a>
              </InlineAlert>
            ) : null}
            {!assembly.stale && assembly.canConfirm && assembly.statusLabel !== "Confirmat" ? (
              <InlineAlert tone="pending" title="Gata de confirmare">
                Toate părțile ansamblului sunt complete. Confirmă ansamblul pentru a pregăti oferta comună.
              </InlineAlert>
            ) : null}
            {assembly.statusLabel === "Confirmat" && !assembly.quote ? (
              <InlineAlert tone="pending" title="Pregătire ofertă">
                Ansamblul este confirmat. Îngheață oferta comună pentru a continua comercial.
              </InlineAlert>
            ) : null}
            {assembly.stale ? (
              <Button disabled={pending} onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/review`)}>
                Revizuiește ansamblul
              </Button>
            ) : null}
            <Button
              disabled={pending || !assembly.canConfirm}
              onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/confirm`)}
            >
              Confirmă ansamblul
            </Button>
          </SurfacePanel>
          {assembly.quote ? (
            <SurfacePanel title="Ofertă" label="Ofertă">
              <h2>{assembly.quote.label}</h2>
              {assembly.quote.sections.map((section) => (
                <InfoRow
                  key={section.title}
                  label={section.title}
                  value={`${section.inscription} · ${section.grossPrice} ${assembly.quote?.currency}`}
                />
              ))}
              <InfoRow
                label="Total comercial"
                value={`${assembly.quote.grossPrice} ${assembly.quote.currency}`}
              />
            </SurfacePanel>
          ) : (
            <Button
              disabled={pending || assembly.statusLabel !== "Confirmat"}
              onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/quote`)}
            >
              Îngheață oferta
            </Button>
          )}
          {assembly.quote && !assembly.orderId ? (
            <Button disabled={pending} onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/accept`)}>
              Acceptă comanda
            </Button>
          ) : null}
          {assembly.orderId ? <InfoRow label="Comandă" value="Comandă înghețată" /> : null}
          {assembly.orderId && !assembly.productionId ? (
            <Button disabled={pending} onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/production`)}>
              Eliberează în producție
            </Button>
          ) : null}
          {assembly.productionId && !assembly.executionPlanId ? (
            <Button
              disabled={pending}
              onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/execution-plan`)}
            >
              Creează planul de execuție
            </Button>
          ) : null}
          {assembly.executionPlanId ? (
            <p>
              <a className="text-link" href={`/executie/${encodeURIComponent(assembly.executionPlanId)}`}>
                Deschide execuția
              </a>
            </p>
          ) : null}
        </div>
      ) : assemblyId && loaded.status === "loading" ? <LoadingFloor variant="facts" label="Se citește ansamblul" /> : null}
    </SlicePage>
  );
}
