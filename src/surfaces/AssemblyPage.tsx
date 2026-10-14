import { useState } from "react";
import { presentRateAcknowledgement, rateAcknowledgementSatisfied } from "../adapters/confirmAdapter";
import { presentFrozenRateAcknowledgement } from "../adapters/quoteAdapter";
import {
  TransportError,
  getJson,
  postJson,
  readTransportErrorCode,
  readTransportReasons,
} from "../api/http";
import { invalidateAfterRequestDetailChange, invalidateCustomerProjections } from "../data/invalidation";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { LoadingFloor } from "../components/LoadingFloor";
import "../styles/surfaces/commercial.css";
import { invalidateResourcePrefix, invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatMoney } from "../presentation/format";
import {
  FrozenRateAcknowledgementNotice,
  RateAcknowledgementNotice,
} from "../presentation/rateAcknowledgement";
import { assemblyQuoteHref, configuratorHref, jobHref, requestHref } from "../routing/appRoute";
import { useAssemblyQuoteDocument } from "./useAssemblyQuoteDocument";

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
  status: "DRAFT" | "STALE" | "CONFIRMED";
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
  /** Identity of the frozen quote shown above; never derived on the client. */
  quoteSnapshotId?: string | null;
  /** The confirmed composition has no frozen quote yet (first freeze or after reconfirmation). */
  quoteFreezable?: boolean;
  orderId: string | null;
  productionId: string | null;
  executionPlanId: string | null;
  productionCost?: {
    total: number;
    currency: string;
    completeness: string;
    completenessLabel: string;
    unpricedOperations: string[];
  } | null;
  membersEditable?: boolean;
  rateAcknowledgement?: unknown;
  frozenRateAcknowledgement?: unknown;
};

/** Lowercases only the first letter so acronyms such as ACM keep their case in running text. */
function inSentence(title: string): string {
  return title.charAt(0).toLocaleLowerCase("ro") + title.slice(1);
}

export function assemblyLead(hasLogo: boolean, lettersPresent: boolean): string {
  if (!hasLogo) {
    return "Configurează literele și panoul ACM, verifică ansamblul, apoi îngheață oferta comună.";
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
  const [acknowledgedRateBinding, setAcknowledgedRateBinding] = useState<string | null>(null);
  const loaded = useResource(
    assemblyId ? resourceKeys.assembly(assemblyId) : null,
    () => loadAssembly(assemblyId ?? ""),
    { staleMs: -1 },
  );
  const assembly = loaded.data ?? null;
  const quoteFreezable = assembly?.quoteFreezable === true;
  const quoteDocument = useAssemblyQuoteDocument(assembly?.quoteSnapshotId ?? null);

  async function run(path: string, payload?: unknown): Promise<void> {
    if (!assemblyId || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = (await postJson(path, payload)) as { assembly: AssemblyView };
      if (assemblyId) {
        writeResource(resourceKeys.assembly(assemblyId), body.assembly);
      }
      if (body.assembly.requestId) {
        invalidateAfterRequestDetailChange(body.assembly.requestId);
      } else {
        invalidateCustomerProjections();
      }
      invalidateResources(resourceKeys.jobs(), resourceKeys.quotes());
      invalidateResourcePrefix(resourceKeys.assemblyQuote(""));
    } catch (failure) {
      const code = failure instanceof TransportError ? readTransportErrorCode(failure.body) : null;
      if (code === "rate_acknowledgement_stale" || code === "rate_acknowledgement_required") {
        setAcknowledgedRateBinding(null);
        invalidateResources(resourceKeys.assembly(assemblyId));
      }
      const reason =
        failure instanceof TransportError ? readTransportReasons(failure.body)[0] : undefined;
      setError(reason ?? "Acțiunea nu a putut fi finalizată.");
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
  const membersEditable = assembly?.membersEditable !== false;
  const rateRequirement = presentRateAcknowledgement(assembly?.rateAcknowledgement);
  const frozenRateAcknowledgement = presentFrozenRateAcknowledgement(
    assembly?.frozenRateAcknowledgement,
  );
  const ratesAcknowledged = rateAcknowledgementSatisfied(rateRequirement, acknowledgedRateBinding);
  const quotePayload =
    rateRequirement?.status === "REQUIRED" && rateRequirement.bindingHash && ratesAcknowledged
      ? { rateAcknowledgement: { bindingHash: rateRequirement.bindingHash } }
      : undefined;

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
      {error ? (
        <InlineAlert tone="error" title="Acțiunea nu a fost finalizată">
          {error}
        </InlineAlert>
      ) : loaded.status === "error" ? (
        <InlineAlert tone="error" title="Ansamblul nu este disponibil">
          Ansamblul nu a putut fi citit.
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
                    {membersEditable ? "Deschide configurația" : "Consultă configurația"}
                  </a>
                </p>
              ) : null}
              {!membersEditable ? (
                <p className="ui-note">
                  Comanda este acceptată. Configurația poate fi doar consultată; modificările se fac
                  într-o variantă comercială nouă, din cerere.
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
                Configurează {inSentence(incompleteMember.title)} înainte de confirmarea ansamblului.{" "}
                <a className="text-link" href={incompleteMemberHref}>
                  Deschide {inSentence(incompleteMember.title)}
                </a>
              </InlineAlert>
            ) : null}
            {assembly.status === "DRAFT" && assembly.canConfirm ? (
              <InlineAlert tone="pending" title="Gata de confirmare">
                Toate părțile ansamblului sunt complete. Confirmă ansamblul pentru a putea îngheța oferta comună.
              </InlineAlert>
            ) : null}
            {quoteFreezable ? (
              <InlineAlert tone="pending" title="Următorul pas: îngheață oferta">
                Ansamblul este confirmat. Îngheață oferta comună pentru a fixa prețurile și a continua comercial.
              </InlineAlert>
            ) : null}
            {assembly.stale ? (
              <Button disabled={pending} onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/review`)}>
                Revizuiește ansamblul
              </Button>
            ) : null}
            {assembly.status === "DRAFT" ? (
              <Button
                disabled={pending || !assembly.canConfirm}
                onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/confirm`)}
              >
                Confirmă ansamblul
              </Button>
            ) : null}
          </SurfacePanel>
          {assembly.quote && !quoteFreezable ? (
            <div id="oferta">
              <SurfacePanel title="Ofertă înghețată" label="Ofertă">
                <h2>{assembly.quote.label}</h2>
                <p className="section-label">Secțiuni · sume cu TVA inclus</p>
                <dl aria-label="Secțiuni ofertă, sume cu TVA inclus">
                  {assembly.quote.sections.map((section) => (
                    <InfoRow
                      key={section.title}
                      label={section.title}
                      value={`${section.inscription} · ${formatMoney(section.grossPrice, assembly.quote?.currency ?? "EUR")} cu TVA`}
                    />
                  ))}
                </dl>
                <p className="ui-note">
                  Sumele pe secțiuni includ TVA și formează împreună totalul comercial cu TVA.
                  Totalul net și TVA sunt afișate separat mai jos.
                </p>
                <p className="section-label">Totaluri ofertă</p>
                <dl aria-label="Totaluri ofertă">
                  <InfoRow
                    label="Total net (fără TVA)"
                    value={formatMoney(assembly.quote.netPrice, assembly.quote.currency)}
                  />
                  <InfoRow
                    label="TVA"
                    value={formatMoney(assembly.quote.vatAmount, assembly.quote.currency)}
                  />
                  <InfoRow
                    label="Total comercial (cu TVA)"
                    value={formatMoney(assembly.quote.grossPrice, assembly.quote.currency)}
                  />
                </dl>
                {frozenRateAcknowledgement ? (
                  <FrozenRateAcknowledgementNotice acknowledgement={frozenRateAcknowledgement} />
                ) : null}
                {assembly.quoteSnapshotId ? (
                  <div className="assembly-quote-actions">
                    <a className="hit" href={assemblyQuoteHref(assembly.quoteSnapshotId)}>
                      <span className={`button button--${assembly.orderId ? "secondary" : "primary"}`}>
                        Deschide oferta comercială
                      </span>
                    </a>
                    <Button
                      variant="secondary"
                      disabled={quoteDocument.pending}
                      onClick={() => void quoteDocument.download()}
                    >
                      Descarcă oferta PDF
                    </Button>
                  </div>
                ) : null}
                {!assembly.orderId ? (
                  <p className="ui-note">
                    Acceptarea ofertei și crearea comenzii se fac în pagina ofertei comerciale.
                  </p>
                ) : null}
                {quoteDocument.error ? (
                  <InlineAlert tone="error" title="Documentul nu poate fi descărcat">
                    {quoteDocument.error}
                  </InlineAlert>
                ) : null}
              </SurfacePanel>
            </div>
          ) : null}
          {quoteFreezable ? (
            <>
              {assembly.quote ? (
                <InlineAlert tone="pending" title="Ofertă nouă necesară">
                  Ansamblul a fost reconfirmat după ultima ofertă. Îngheață o ofertă nouă; oferta anterioară
                  rămâne în istoric și nu mai poate fi acceptată.
                </InlineAlert>
              ) : null}
              {rateRequirement ? (
                <RateAcknowledgementNotice
                  requirement={rateRequirement}
                  acknowledged={
                    acknowledgedRateBinding !== null &&
                    acknowledgedRateBinding === rateRequirement.bindingHash
                  }
                  disabled={pending}
                  onAcknowledgedChange={(acknowledged) => {
                    setAcknowledgedRateBinding(acknowledged ? rateRequirement.bindingHash : null);
                  }}
                />
              ) : null}
              <Button
                disabled={pending || !ratesAcknowledged}
                onClick={() => void run(`/api/assemblies/${assembly.assemblyId}/quote`, quotePayload)}
              >
                Îngheață oferta
              </Button>
            </>
          ) : null}
          {assembly.orderId ? (
            <div className="assembly-order">
              <dl>
                <InfoRow label="Comandă" value="Acceptată — comandă creată" />
              </dl>
              <a className="text-link" href={jobHref(assembly.orderId)}>
                Deschide comanda
              </a>
            </div>
          ) : null}
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
          {assembly.productionCost ? (
            <SurfacePanel title="Cost intern de producție" label="Cost intern de producție">
              <InfoRow
                label="Cost cunoscut"
                value={formatMoney(assembly.productionCost.total, assembly.productionCost.currency)}
              />
              <InfoRow label="Completitudine" value={assembly.productionCost.completenessLabel} />
              {assembly.productionCost.completeness === "PARTIAL" ? (
                <InlineAlert tone="pending" title="Cost parțial">
                  Costul nu include lucrările de ansamblu fără cost înregistrat
                  {assembly.productionCost.unpricedOperations.length > 0
                    ? `: ${assembly.productionCost.unpricedOperations.join(", ")}`
                    : ""}
                  . Nu sunt tratate ca zero.
                </InlineAlert>
              ) : null}
            </SurfacePanel>
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
