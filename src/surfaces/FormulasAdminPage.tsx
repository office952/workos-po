import { useState } from "react";
import {
  presentFormulasAdmin,
  type FormulaAstTransport,
  type FormulasAdminTransport,
} from "../adapters/formulasAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { postFormula } from "../api/formulas";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterFormulasChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadFormulasAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { FormulaAstEditor } from "./FormulaAstEditor";

type SaveState = "idle" | "pending" | "success" | "alreadyApplied" | "error";

export function FormulasAdminPage() {
  const admin = useResource(resourceKeys.formulasAdmin(), loadFormulasAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<FormulasAdminTransport | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FormulaAstTransport | null>>({});

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(next: FormulasAdminTransport): void {
    setModel(next);
    setDrafts(Object.fromEntries(next.formulas.map((item) => [item.formulaId, item.expression])));
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Formulele de calcul nu sunt disponibile.");
  }

  async function save(formulaId: string): Promise<void> {
    const expression = drafts[formulaId];
    if (!expression) {
      setSaveState("error");
      setErrorMessage("Expresia formulei este incompletă.");
      return;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postFormula({ formulaId, expression });
    if (result.ok) {
      const presented = presentFormulasAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.formulasAdmin(), presented);
      applyAdmin(presented);
      invalidateAfterFormulasChange();
      setSaveState(
        result.body && (result.body as { alreadyApplied?: boolean }).alreadyApplied
          ? "alreadyApplied"
          : "success",
      );
      return;
    }
    setSaveState("error");
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (readTransportErrorCode(result.body) === "forbidden"
          ? "Nu ai dreptul să modifici formulele de calcul."
          : "Formulele de calcul nu au putut fi salvate."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/formulas"
      workspace="admin"
      eyebrow="Administrare"
      title="Formule de calcul"
      lead="Aceste formule sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate."
      meta={
        model?.canEdit
          ? "Doar Owner poate confirma formulele de calcul ale organizației."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("formulas")}
          />
          <SurfacePanel title="Formulele curente" label="Formule" busy>
            <LoadingFloor variant="admin" label="Se încarcă formulele de calcul" />
          </SurfacePanel>
        </>
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("formulas")}
          />
          <SurfacePanel
            title="Formulele curente"
            label="Formule"
            status={
              <StatusBadge
                label={model.resolutionOk ? "Active" : "Blocate"}
                tone={model.resolutionOk ? "ready" : "blocked"}
              />
            }
          >
            {model.guidance ? (
              <InlineAlert
                tone={model.resolutionOk ? "pending" : "blocked"}
                title={
                  model.resolutionOk
                    ? "Calcul tehnic pentru lucrări noi"
                    : "Formulele trebuie corectate"
                }
              >
                {model.guidance}
              </InlineAlert>
            ) : null}
            {saveState === "success" ? (
              <InlineAlert tone="success" title="Formula a fost salvată">
                Versiunea nouă se aplică doar lucrărilor viitoare.
              </InlineAlert>
            ) : null}
            {saveState === "alreadyApplied" ? (
              <InlineAlert tone="pending" title="Formula este deja salvată">
                Nu a fost creată o versiune nouă.
              </InlineAlert>
            ) : null}
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            {model.formulas.map((formula) => (
              <div key={formula.formulaId}>
                <h3>{formula.label}</h3>
                <p>{formula.description}</p>
                <dl>
                  <InfoRow label="Identificator" value={formula.formulaId} />
                  {formula.sourceLabel ? (
                    <InfoRow label="Sursă" value={formula.sourceLabel} />
                  ) : null}
                  {formula.version !== null ? (
                    <InfoRow label="Versiune" value={String(formula.version)} />
                  ) : null}
                  {formula.statusLabel ? (
                    <InfoRow label="Stare" value={formula.statusLabel} />
                  ) : null}
                  {formula.explanation ? (
                    <InfoRow label="Explicație" value={formula.explanation} />
                  ) : null}
                </dl>
                <FormulaAstEditor
                  id={formula.formulaId}
                  formula={formula}
                  value={drafts[formula.formulaId] ?? formula.expression}
                  disabled={!editEnabled}
                  onChange={(expression) => {
                    setDrafts((current) => ({ ...current, [formula.formulaId]: expression }));
                  }}
                />
                {model.canEdit ? (
                  <Button
                    disabled={pending}
                    onClick={() => {
                      void save(formula.formulaId);
                    }}
                  >
                    Salvează formula
                  </Button>
                ) : (
                  <p>Editarea nu este disponibilă pentru acest rol.</p>
                )}
              </div>
            ))}
            {pending ? <LoadingIndicator label="Se salvează formula de calcul" /> : null}
          </SurfacePanel>
          <SurfacePanel title="Istoric versiuni" label="Istoric">
            {model.history.length === 0 ? (
              <p>Nu există încă versiuni persistate.</p>
            ) : (
              <Worklist variant="compact" label="Versiuni formule de calcul">
                {[...model.history].reverse().map((row) => (
                  <WorklistRow
                    key={`${row.formulaId}:${row.version}`}
                    variant="compact"
                    identity={`${row.formulaId} · versiunea ${row.version}`}
                    identityDetail={row.statusLabel || row.status}
                    context={
                      formatTimestamp(row.effectiveFrom ?? row.createdAt) ??
                      row.sourceLabel
                    }
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}
