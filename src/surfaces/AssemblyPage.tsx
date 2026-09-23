import { useState } from "react";
import { getJson, postJson } from "../api/http";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SurfacePanel } from "../components/SurfacePanel";
import { writeResource } from "../data/resourceCache";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { configuratorHref } from "../routing/appRoute";
import { readConfiguratorSession } from "../session/configuratorSession";

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

const SCOPE_PRODUCT: Partial<Record<AssemblyScope["id"], string | null>> = {
  acm: "PRD-ACM-CASSETTE-NONE",
  logo: "PRD-LOGO-FRONTLIT-PLEXI-AL06",
  letters: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
  relation: null,
  summary: null,
};

const SCOPE_ROLE: Partial<Record<AssemblyScope["id"], string | null>> = {
  acm: "SUPPORT_PANEL",
  logo: "SIGNAGE_LOGO",
  letters: "SIGNAGE_LETTERS",
  relation: null,
  summary: null,
};

function assemblyKey(assemblyId: string): string {
  return `assembly:${assemblyId}`;
}

async function loadAssembly(assemblyId: string): Promise<AssemblyView> {
  const body = (await getJson(`/api/assemblies/${encodeURIComponent(assemblyId)}`)) as {
    assembly: AssemblyView;
  };
  return body.assembly;
}

export function AssemblyPage() {
  const assemblyId = new URLSearchParams(window.location.search).get("assembly");
  const session = readConfiguratorSession();
  const [scopeId, setScopeId] = useState<AssemblyScope["id"]>("summary");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loaded = useResource(assemblyId ? assemblyKey(assemblyId) : null, () =>
    loadAssembly(assemblyId ?? ""),
  );
  const assembly = loaded.data ?? null;

  async function run(path: string): Promise<void> {
    if (!assemblyId) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = (await postJson(path)) as { assembly: AssemblyView };
      if (assemblyId) {
        writeResource(assemblyKey(assemblyId), body.assembly);
      }
    } catch {
      setError("Acțiunea nu a putut fi finalizată.");
    } finally {
      setPending(false);
    }
  }

  const scope = assembly?.scopes.find((item) => item.id === scopeId) ?? assembly?.scopes[0];
  const productCode = scope?.productCode ?? (scope ? SCOPE_PRODUCT[scope.id] : null);
  const role = scope?.role ?? (scope ? SCOPE_ROLE[scope.id] : null);
  const hasLogo = assembly?.scopes.some((item) => item.id === "logo") ?? false;

  return (
    <SlicePage
      contextLabel="Ansamblu"
      currentHref="/ansamblu"
      workspace="stack"
      eyebrow="Ansamblu"
      title={assembly?.label ?? "Panou ACM + litere volumetrice"}
      lead={
        hasLogo
          ? "Configurează panoul și logo-ul. Literele sunt opționale."
          : "Configurează panoul și literele, apoi confirmă ansamblul."
      }
    >
      {!assemblyId ? (
        <InlineAlert tone="blocked" title="Ansamblu lipsă">
          Deschide ansamblul din catalog, dintr-o cerere.
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
        <>
          <div className="filter-bar" role="tablist" aria-label="Părțile ansamblului">
            <div className="filter-bar__chips">
              {assembly.scopes.map((item) => (
                <Button key={item.id} onClick={() => setScopeId(item.id)}>
                  {item.title}
                </Button>
              ))}
            </div>
          </div>
          {scope && scope.id !== "summary" ? (
            <SurfacePanel title={scope.title} label={scope.title}>
              <p>{scope.summary}</p>
              <InfoRow label="Stare" value={scope.complete ? "Complet" : "Necesită date"} />
              {productCode && role ? (
                <p>
                  <a
                    className="text-link"
                    href={configuratorHref({
                      customerId: session.customerId,
                      requestId: session.requestId,
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
        </>
      ) : null}
    </SlicePage>
  );
}
