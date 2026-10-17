import { useState } from "react";
import {
  fetchJobMaterialPreparation,
  MaterialDecisionConflictError,
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
  returnTo?: string;
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

function purchasePhrase(quantity: number | null, unit: string): string {
  if (quantity === null) {
    return "cantitate de cumpărare nestabilită";
  }
  return displayQuantity(quantity) + " " + unit;
}

function estimatedLabel(line: JobMaterialLineTransport, jobTotal: boolean): string {
  const quantity = displayQuantity(line.estimatedQuantity) + " " + line.unit;
  return jobTotal
    ? "Necesar estimat total pe lucrare: " + quantity
    : "Necesar estimat: " + quantity;
}

export function JobMaterialPreparation({ jobId, onlyResourceIds, returnTo }: Props) {
  const key = resourceKeys.jobMaterialPreparation(jobId);
  const resource = useResource(key, () => fetchJobMaterialPreparation(jobId));
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const [pendingResource, setPendingResource] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const personName = session.status === "success" ? session.data?.displayName : null;
  const selectedIds = onlyResourceIds ? new Set(onlyResourceIds) : null;
  const lines = (resource.data?.lines ?? []).filter(
    (line) => !selectedIds || selectedIds.has(line.resourceId),
  );
  if (selectedIds && lines.length === 0 && resource.status !== "error") {
    return null;
  }

  async function decide(line: JobMaterialLineTransport, status: "AVAILABLE" | "MISSING") {
    if (!personName || pendingResource !== null) {
      return;
    }
    setPendingResource(line.resourceId);
    setActionError(null);
    try {
      const updated = await submitJobMaterialDecision(jobId, line.resourceId, { status });
      writeResource(key, updated);
      invalidateAfterJobMaterialDecision(jobId);
    } catch (error) {
      if (error instanceof MaterialDecisionConflictError) {
        writeResource(key, error.preparation);
        invalidateAfterJobMaterialDecision(jobId);
        setActionError("Există deja o verificare pentru acest material. Lista a fost recitită și solicitarea nu a fost dublată.");
      } else if (error instanceof TypeError) {
        setActionError("Conexiunea s-a întrerupt. Reîncearcă aceeași acțiune. Solicitarea nu se dublează.");
      } else {
        setActionError(
          error instanceof TransportError && error.status === 409
            ? "Starea materialelor a fost modificată. Reîncarcă lista înainte de continuare."
            : "Verificarea nu a putut fi înregistrată. Nu s-a creat o comandă.",
        );
      }
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
            Necesarul estimat vine din plan. Verificarea nu numără piese și nu cumpără materiale.
          </p>
          {actionError ? (
            <InlineAlert tone="error" title="Verificarea a eșuat">{actionError}</InlineAlert>
          ) : null}
          {lines.map((line) => {
            const requestPending = line.openRequest !== null;
            return (
              <article className="job-materials__line" key={line.resourceId}>
                <div className="job-materials__row">
                  <div className="job-materials__identity">
                    <strong>{line.label}</strong>
                    <span>{estimatedLabel(line, onlyResourceIds !== undefined)}</span>
                  </div>
                  <span className="job-materials__state" data-status={line.latestCheck?.status ?? "UNKNOWN"}>
                    {line.latestCheck?.status === "AVAILABLE"
                      ? "Confirmat disponibil"
                      : line.latestCheck?.status === "MISSING"
                        ? "Insuficient"
                        : "Neverificat"}
                  </span>
                </div>
                {line.latestCheck ? (
                  <p className="job-materials__audit">
                    Verificat de {line.latestCheck.checkedByLabel} · {displayWhen(line.latestCheck.checkedAt)}
                  </p>
                ) : null}
                {line.latestCheck?.status === "MISSING" ? (
                  <p className="job-materials__warning" role="status">
                    Avertisment: materialul nu este suficient pentru lucrare. Pornirea operației
                    rămâne decisă de WorkOS.
                  </p>
                ) : null}
                {line.openRequest ? (
                  <p
                    className="job-materials__request"
                    role="status"
                    data-review={line.openRequest.requiresReview ? "required" : "pending"}
                  >
                    {line.openRequest.requiresReview
                      ? "Solicitare de revizuit · " +
                        purchasePhrase(line.openRequest.requestedQuantity, line.openRequest.unit) +
                        " · " + line.openRequest.requestedByLabel +
                        ". Ultima verificare a confirmat disponibilitatea. Achizițiile revizuiesc " +
                        "cererea înainte de cumpărare."
                      : "Aprovizionare solicitată · " +
                        purchasePhrase(line.openRequest.requestedQuantity, line.openRequest.unit) +
                        " · " + line.openRequest.requestedByLabel + " · " +
                        displayWhen(line.openRequest.requestedAt) + ". Nu este o comandă."}
                  </p>
                ) : null}
                {line.canCheck && personName ? (
                  <div className="job-materials__actions">
                    <Button
                      variant="secondary"
                      disabled={pendingResource !== null}
                      onClick={() => void decide(line, "AVAILABLE")}
                    >
                      Confirmă disponibil
                    </Button>
                    {!requestPending ? (
                      <Button
                        variant="secondary"
                        disabled={pendingResource !== null}
                        onClick={() => void decide(line, "MISSING")}
                      >
                        Semnalează necesar de aprovizionare
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!personName ? (
            <p className="ui-note">
              Verificarea și solicitarea necesită identificarea personală a operatorului.{" "}
              <a className="text-link" href={atelierHref({ jobId, returnTo })}>
                Identifică-te în Atelier
              </a>
            </p>
          ) : (
            <p className="ui-note">Operator identificat: {personName}. Verificarea salvează numele și ora.</p>
          )}
        </>
      ) : null}
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
