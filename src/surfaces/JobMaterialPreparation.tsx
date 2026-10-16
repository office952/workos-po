import { useState } from "react";
import {
  fetchJobMaterialPreparation,
  submitJobMaterialDecision,
  type JobMaterialLineTransport,
} from "../api/jobMaterials";
import { TransportError } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateAfterJobMaterialDecision } from "../data/invalidation";
import { resourceKeys } from "../data/resourceKeys";
import { writeResource } from "../data/resourceCache";
import { loadOperatorSession } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { atelierHref } from "../routing/appRoute";
import "../styles/surfaces/job-materials.css";

type Props = {
  jobId: string;
  onlyResourceIds?: readonly string[];
};

function displayQuantity(value: number): string {
  return value.toLocaleString("ro-RO", { maximumFractionDigits: 4 });
}

function displayWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "moment indisponibil"
    : date.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

function minimumPurchase(line: JobMaterialLineTransport): number {
  return line.unit === "buc" ? Math.ceil(line.estimatedQuantity) : line.estimatedQuantity;
}

export function JobMaterialPreparation({ jobId, onlyResourceIds }: Props) {
  const key = resourceKeys.jobMaterialPreparation(jobId);
  const resource = useResource(key, () => fetchJobMaterialPreparation(jobId));
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const [pendingResource, setPendingResource] = useState<string | null>(null);
  const [requestedDrafts, setRequestedDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const personName = session.status === "success" ? session.data?.displayName : null;
  const selectedIds = onlyResourceIds ? new Set(onlyResourceIds) : null;
  const lines = (resource.data?.lines ?? []).filter(
    (line) => !selectedIds || selectedIds.has(line.resourceId),
  );

  async function decide(line: JobMaterialLineTransport, status: "AVAILABLE" | "MISSING") {
    if (!personName || pendingResource !== null) {
      return;
    }
    const request = status === "MISSING"
      ? Number(requestedDrafts[line.resourceId] ?? String(minimumPurchase(line)))
      : null;
    if (status === "MISSING" && (
      request === null ||
      !Number.isFinite(request) ||
      request < minimumPurchase(line) ||
      (line.unit === "buc" && !Number.isInteger(request))
    )) {
      setActionError("Cantitatea de achiziționat trebuie să fie cel puțin necesarul estimat.");
      return;
    }
    setPendingResource(line.resourceId);
    setActionError(null);
    setActionMessage(null);
    try {
      const updated = await submitJobMaterialDecision(
        jobId,
        line.resourceId,
        status === "AVAILABLE"
          ? { status }
          : { status, requestedQuantity: request ?? minimumPurchase(line) },
      );
      writeResource(key, updated);
      invalidateAfterJobMaterialDecision(jobId);
      setActionMessage(status === "AVAILABLE"
        ? "Disponibilitatea a fost confirmată."
        : "Solicitarea a fost înregistrată pentru viitoarele Achiziții. Nu este comandă plasată.");
    } catch (error) {
      setActionError(
        error instanceof TransportError && error.status === 409
          ? "Starea materialelor a fost modificată. Reîncarcă lista înainte de continuare."
          : "Verificarea nu a putut fi înregistrată. Nu s-a confirmat nicio achiziție.",
      );
    } finally {
      setPendingResource(null);
    }
  }

  const body = (
    <div className="job-materials" data-testid="job-material-preparation">
      {resource.status === "error" ? (
        <InlineAlert tone="error" title="Materialele nu sunt disponibile">
          Lista nu a putut fi citită din planul lucrării.
        </InlineAlert>
      ) : null}
      {resource.status === "loading" && !resource.data ? (
        <p className="ui-note">Se citește necesarul din planul lucrării.</p>
      ) : null}
      {resource.data && resource.data.planId === null ? (
        <p className="ui-note">Necesarul de execuție va apărea după crearea planului.</p>
      ) : null}
      {resource.data?.planId && lines.length === 0 ? (
        <p className="ui-note">Nu există materiale planificate în această selecție.</p>
      ) : null}
      {resource.data?.planId && lines.length > 0 ? (
        <>
          <p className="ui-note">
            Necesarul este estimat de WorkOS din plan. Nu se numără LED-uri și nu se
            măsoară materiale pentru această verificare. Stocul numeric nu confirmă
            disponibilitatea în atelier.
          </p>
          {lines.map((line) => {
            const min = minimumPurchase(line);
            const requestPending = line.openRequest !== null;
            return (
              <article className="job-materials__line" key={line.resourceId}>
                <div className="job-materials__row">
                  <div className="job-materials__identity">
                    <strong>{line.label}</strong>
                    <span>Necesar estimat: {displayQuantity(line.estimatedQuantity)} {line.unit}</span>
                  </div>
                  <span className="job-materials__state" data-status={line.latestCheck?.status ?? "UNKNOWN"}>
                    {line.latestCheck?.status === "AVAILABLE"
                      ? "Confirmat disponibil"
                      : line.latestCheck?.status === "MISSING"
                        ? "Material insuficient"
                        : "Neverificat"}
                  </span>
                </div>
                {line.latestCheck ? (
                  <p className="job-materials__audit">
                    Verificat de {line.latestCheck.checkedByLabel} · {displayWhen(line.latestCheck.checkedAt)}
                  </p>
                ) : null}
                {line.openRequest ? (
                  <p className="job-materials__request">
                    Solicitare {line.openRequest.requestId}: {displayQuantity(line.openRequest.requestedQuantity)}{" "}
                    {line.openRequest.unit} · {line.openRequest.requestedByLabel} ·{" "}
                    {displayWhen(line.openRequest.requestedAt)}. În așteptarea Achizițiilor.
                  </p>
                ) : null}
                {line.canCheck && personName ? (
                  <div className="job-materials__actions">
                    <Button
                      variant="secondary"
                      disabled={pendingResource !== null}
                      onClick={() => void decide(line, "AVAILABLE")}
                    >
                      Confirmă disponibile
                    </Button>
                    {!requestPending ? (
                      <div className="job-materials__purchase">
                        <label htmlFor={"job-material-qty-" + line.resourceId}>
                          Cantitate de achiziționat (minimum necesar)
                        </label>
                        <div className="job-materials__purchase-controls">
                          <input
                            id={"job-material-qty-" + line.resourceId}
                            type="number"
                            className="field__control"
                            min={min}
                            step={line.unit === "buc" ? "1" : "any"}
                            value={requestedDrafts[line.resourceId] ?? String(min)}
                            onChange={(event) =>
                              setRequestedDrafts((current) => ({
                                ...current, [line.resourceId]: event.target.value,
                              }))}
                          />
                          <Button
                            disabled={pendingResource !== null}
                            onClick={() => void decide(line, "MISSING")}
                          >
                            Lipsește — solicită achiziție
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!personName ? (
            <p className="ui-note">
              Verificarea și solicitarea necesită identificarea personală a operatorului.{" "}
              <a className="text-link" href={atelierHref({ jobId })}>
                Identifică-te în Atelier
              </a>
            </p>
          ) : (
            <p className="ui-note">Operator identificat: {personName}. Verificarea salvează numele și ora.</p>
          )}
        </>
      ) : null}
      {actionError ? (
        <InlineAlert tone="error" title="Verificarea a eșuat">{actionError}</InlineAlert>
      ) : null}
      {actionMessage ? <p role="status" className="ui-note">{actionMessage}</p> : null}
    </div>
  );

  return onlyResourceIds ? (
    <section aria-label="Materialele operației">
      <h3 className="job-materials__heading">Materiale pentru operație</h3>
      {body}
    </section>
  ) : (
    <SurfacePanel
      title="Necesar și verificare materiale"
      description="Pregătire pentru execuție. Solicitarea nu cumpără automat materiale."
      label="Necesar și verificare materiale"
    >
      {body}
    </SurfacePanel>
  );
}
