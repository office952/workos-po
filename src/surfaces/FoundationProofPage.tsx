import { useMemo, useState } from "react";
import type { HealthPresentation } from "../adapters/healthAdapter";
import { resourceKeys } from "../data/resourceKeys";
import { loadHealthPresentation } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Separator } from "../components/Separator";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { FOUNDATION_PROOF_FIXTURE } from "../fixtures/foundationProof";
import { AppShell } from "../layout/AppShell";
import { PageHeader } from "../layout/PageHeader";
import { PageRegion } from "../layout/PageRegion";
import { presentProofNextStep, selectProofObject } from "../presentation/foundationProof";

function contractContext(health: HealthPresentation | null, loadState: "loading" | "ready"): string {
  if (loadState === "loading") {
    return "Contract: se verifică";
  }
  if (!health) {
    return "Contract: necunoscut";
  }
  return health.kind === "compatible"
    ? `Contract: ${health.contractId}`
    : "Contract: incompatibil";
}

export function FoundationProofPage() {
  const model = FOUNDATION_PROOF_FIXTURE;
  const healthResource = useResource(resourceKeys.health(), loadHealthPresentation);
  const health = healthResource.data ?? null;
  const loadState = healthResource.status === "success" || healthResource.status === "error" ? "ready" : "loading";
  const [selectedId, setSelectedId] = useState(model.items[0].id);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const selected = useMemo(
    () => selectProofObject(model, selectedId),
    [model, selectedId],
  );
  const fieldValue = drafts[selected.id] ?? selected.fieldValue;

  const contractOk = health?.kind === "compatible";
  const blocked = selected.readiness === "blocked" || !contractOk;
  const primaryDisabled = blocked || loadState === "loading";
  const nextStep = presentProofNextStep(contractOk, selected);

  function activatePrimary(): void {
    setActionNote(
      "Preview-ul de configurare nu rulează în Foundation. Confirmarea va folosi values + reviewId.",
    );
  }

  return (
    <AppShell contextLabel={contractContext(health, loadState)}>
      <PageRegion>
        <PageHeader
          title={model.pageTitle}
          lead={model.pageLead}
          meta={model.pageMeta}
          action={
            <Button
              variant="primary"
              disabled={primaryDisabled}
              onClick={activatePrimary}
            >
              {model.primaryAction}
            </Button>
          }
        />
        <div className="page-region">
          {loadState === "loading" ? (
            <LoadingIndicator label="Se verifică identitatea contractului API." />
          ) : (
            <div className="stack">
              {health?.kind === "incompatible" ? (
                <InlineAlert tone="error" title="Contract API incompatibil">
                  {`${health.reason} UI20 se oprește în loc să continue pe un API nesuportat.`}
                </InlineAlert>
              ) : (
                <InlineAlert tone="pending" title="Contract verificat">
                  {`GET /api/health a confirmat ${health?.contractId ?? "workos-ui-contract-v1"}.`}
                </InlineAlert>
              )}

              <div className="floorplan">
                <section className="panel" aria-labelledby="lista-cereri">
                  <div className="panel__header">
                    <h2 className="panel__title" id="lista-cereri">
                      Listă
                    </h2>
                  </div>
                  <div>
                    {model.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="list-row"
                        aria-pressed={item.id === selected.id}
                        data-object-id={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                          setActionNote(null);
                        }}
                      >
                        <span className="list-row__main">
                          <span className="list-row__id">{item.id}</span>
                          <span className="list-row__label">{item.title}</span>
                        </span>
                        <StatusBadge label={item.statusLabel} tone={item.tone} />
                        <span className="list-row__date">{item.dateLabel}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel" aria-labelledby="obiect-cerere">
                  <div className="panel__header">
                    <div className="cluster">
                      <h2 className="panel__title" id="obiect-cerere">
                        {selected.title}
                      </h2>
                      <StatusBadge
                        label={selected.readiness === "ready" ? "Pregătit" : "Blocat"}
                        tone={selected.readiness === "ready" ? "ready" : "blocked"}
                      />
                    </div>
                  </div>
                  <div className="panel__body stack">
                    {actionNote ? (
                      <InlineAlert tone="pending" title="Acțiune înregistrată">
                        {actionNote}
                      </InlineAlert>
                    ) : null}

                    <InlineAlert
                      tone={!contractOk || selected.readiness === "blocked" ? "blocked" : "pending"}
                      title={nextStep.title}
                    >
                      {nextStep.body}
                    </InlineAlert>

                    <dl>
                      <InfoRow label="Unde sunt" value="Cereri · obiect selectat" />
                      <InfoRow label="Scopul paginii" value={selected.purpose} />
                      <InfoRow
                        label="Starea văzută"
                        value={selected.readiness === "ready" ? "Pregătit" : "Blocat"}
                      />
                      <InfoRow label="Ce se întâmplă" value={selected.consequence} />
                    </dl>

                    <Separator />

                    <TextField
                      id="inscription"
                      label={selected.fieldLabel}
                      value={fieldValue}
                      hint={selected.fieldHint}
                      onChange={(value) => {
                        setDrafts((current) => ({
                          ...current,
                          [selected.id]: value,
                        }));
                      }}
                    />

                    <div className="cluster">
                      <Button variant="secondary" onClick={() => window.location.reload()}>
                        Reverifică sănătatea API
                      </Button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </PageRegion>
    </AppShell>
  );
}
