import { useState, type ReactNode } from "react";
import {
  presentFormulasAdmin,
  type FormulaAstTransport,
  type FormulasAdminTransport,
} from "../adapters/formulasAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import {
  AdminBullets,
  AdminChangeBar,
  AdminContextBlock,
  AdminRegistry,
  AdminRegistryRow,
  AdminSupportDetails,
  AdminVersionList,
} from "../admin/adminParts";
import { postFormula } from "../api/formulas";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterFormulasChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadFormulasAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";
import { administrationReturnFromSearch } from "../routing/administrationReturn";
import { useUnsavedChangesGuard } from "../routing/useUnsavedChangesGuard";
import { FormulaAstEditor } from "./FormulaAstEditor";

type SaveState = "idle" | "pending" | "success" | "alreadyApplied" | "error";
type Drafts = Record<string, FormulaAstTransport | null>;

function sameExpression(left: FormulaAstTransport | null | undefined, right: FormulaAstTransport | null | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Each formula keeps its own draft. A save or a refresh replaces only the formulas that were not
 * being edited (and the one just saved): editing two formulas never loses the second (R1 · F4).
 */
function mergeDrafts(
  previous: FormulasAdminTransport | null,
  drafts: Drafts,
  next: FormulasAdminTransport,
  savedId: string | null = null,
): Drafts {
  const base = new Map(previous?.formulas.map((item) => [item.formulaId, item.expression]) ?? []);
  return Object.fromEntries(
    next.formulas.map((item) => {
      const draft = drafts[item.formulaId];
      const kept =
        item.formulaId !== savedId &&
        draft !== undefined &&
        base.has(item.formulaId) &&
        !sameExpression(draft, base.get(item.formulaId));
      return [item.formulaId, kept ? draft : item.expression];
    }),
  );
}

export function FormulasAdminPage() {
  const admin = useResource(resourceKeys.formulasAdmin(), loadFormulasAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<FormulasAdminTransport | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const componentId = new URLSearchParams(window.location.search).get("component");
  const administrationReturn = administrationReturnFromSearch(window.location.search);

  const loadState =
    admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setDrafts(mergeDrafts(model, drafts, admin.data));
    setModel(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Formulele de calcul nu sunt disponibile.");
  }

  const visible = model?.formulas.filter((item) => !componentId || item.typeId === componentId) ?? [];
  const selected = visible.find((item) => item.formulaId === selectedId) ?? visible[0] ?? null;
  const isDirty = (formulaId: string, expression: FormulaAstTransport | null) =>
    drafts[formulaId] !== undefined && !sameExpression(drafts[formulaId], expression);
  const dirtyFormulas = visible.filter((item) => isDirty(item.formulaId, item.expression));
  const dirty = dirtyFormulas.length > 0;
  const selectedDirty = selected ? isDirty(selected.formulaId, selected.expression) : false;
  const visibleHistory =
    model?.history.filter((row) => selected !== null && row.formulaId === selected.formulaId) ?? [];

  function discard(formulaIds: readonly string[]): void {
    if (!model) return;
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(
        model.formulas.filter((item) => formulaIds.includes(item.formulaId)).map((item) => [item.formulaId, item.expression]),
      ),
    }));
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function save(formulaId: string): Promise<boolean> {
    const expression = drafts[formulaId];
    if (!expression) {
      setSaveState("error");
      setErrorMessage("Expresia formulei este incompletă.");
      return false;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postFormula({ formulaId, expression });
    if (result.ok) {
      const presented = presentFormulasAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      writeResource(resourceKeys.formulasAdmin(), presented);
      setSource(presented);
      setDrafts((current) => mergeDrafts(model, current, presented, formulaId));
      setModel(presented);
      invalidateAfterFormulasChange();
      setSaveState(
        result.body && (result.body as { alreadyApplied?: boolean }).alreadyApplied ? "alreadyApplied" : "success",
      );
      return true;
    }
    setSaveState("error");
    setErrorMessage(
      adminFailureContent(describeAdminFailure(result.status, result.body, { forbidden: "Nu ai dreptul să modifici formulele de calcul." }, "Formulele de calcul nu au putut fi salvate.")),
    );
    return false;
  }

  /** Leaving the page with drafts: „Salvează și continuă” saves each edited formula, in order. */
  async function saveAll(): Promise<boolean> {
    for (const formula of dirtyFormulas) {
      if (!(await save(formula.formulaId))) return false;
    }
    return true;
  }

  const guard = useUnsavedChangesGuard({
    dirty,
    subject: dirtyFormulas.length === 1 ? `Formula „${dirtyFormulas[0].label}”` : "Formulele modificate",
    save: saveAll,
    onDiscard: () => discard(dirtyFormulas.map((item) => item.formulaId)),
  });

  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);

  return (
    <AdminLayout
      current="formulas"
      title="Formule de calcul"
      lead="Formule tehnice pentru lucrările noi. Nu înlocuiesc costul de achiziție al materialelor. Lucrările înghețate rămân neschimbate."
      returnLink={componentId ? administrationReturn : undefined}
      meta={
        loadState === "ready" && model ? (
          <>
            <span>
              {visible.length} {visible.length === 1 ? "formulă" : "formule"} · {model.resolutionOk ? "Active" : "Blocate"}
            </span>
            <span>
              {presentAdminEditMeta({
                settled: true,
                canEdit,
                whenEditable: "Doar proprietarul poate confirma formulele de calcul ale organizației.",
                whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
              })}
            </span>
          </>
        ) : undefined
      }
      changeBar={
        dirty && canEdit && selected ? (
          <AdminChangeBar
            title={
              dirtyFormulas.length === 1
                ? `1 formulă modificată · ${dirtyFormulas[0].label}`
                : `${dirtyFormulas.length} formule modificate`
            }
            detail={
              selectedDirty
                ? `Salvezi formula deschisă: ${selected.label}. Celelalte își păstrează ciorna.`
                : `Deschide o formulă marcată „nesalvat” ca s-o salvezi.`
            }
            saveLabel="Salvează formula"
            saveDisabled={!selectedDirty}
            pending={pending}
            onDiscard={() => discard(selectedDirty ? [selected.formulaId] : dirtyFormulas.map((item) => item.formulaId))}
            onSave={() => {
              void save(selected.formulaId);
            }}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă formulele de calcul" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          {componentId && !model.formulas.some((item) => item.typeId === componentId) ? (
            <p className="adm-section__description">Această componentă nu are formule editabile în versiunea curentă.</p>
          ) : null}
          {model.guidance ? (
            <InlineAlert
              tone={model.resolutionOk ? "pending" : "blocked"}
              title={model.resolutionOk ? "Calcul tehnic pentru lucrări noi" : "Formulele trebuie corectate"}
            >
              {model.guidance}
            </InlineAlert>
          ) : null}
          {visible.length > 0 ? (
            <AdminRegistry
              label="Formule"
              list={
                <>
                  <h2 className="adm-section__title adm-list-heading">Formule</h2>
                  {visible.map((formula) => (
                    <AdminRegistryRow
                      key={formula.formulaId}
                      title={formula.label}
                      detail={formula.resultUnit ? `rezultat în ${formula.resultUnit}` : undefined}
                      status={formula.statusLabel ?? undefined}
                      selected={selected?.formulaId === formula.formulaId}
                      dirty={isDirty(formula.formulaId, formula.expression)}
                      onSelect={() => {
                        setSelectedId(formula.formulaId);
                        setSaveState("idle");
                        setErrorMessage(null);
                      }}
                    />
                  ))}
                </>
              }
              detail={
                selected ? (
                  <section aria-labelledby="formula-detail-title">
                    <div className="adm-detail-head">
                      <h2 id="formula-detail-title" className="adm-detail-head__title">
                        {selected.label}
                      </h2>
                      <p className="adm-detail-head__meta">
                        {[
                          selected.version !== null ? `Versiunea ${selected.version}` : null,
                          selected.statusLabel,
                          selected.sourceLabel,
                          selected.effectiveFrom ? `din ${formatTimestamp(selected.effectiveFrom) ?? selected.effectiveFrom}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {selected.description ? <p className="adm-section__description">{selected.description}</p> : null}
                    {saveState === "success" && !selectedDirty ? (
                      <InlineAlert tone="success" title="Formula a fost salvată">
                        Versiunea nouă se aplică doar lucrărilor viitoare.
                      </InlineAlert>
                    ) : null}
                    {saveState === "alreadyApplied" && !selectedDirty ? (
                      <InlineAlert tone="pending" title="Formula este deja salvată">
                        Nu a fost creată o versiune nouă.
                      </InlineAlert>
                    ) : null}
                    {saveState === "error" && errorMessage ? (
                      <InlineAlert tone="error" title="Salvarea a eșuat">
                        {errorMessage} Modificările tale sunt păstrate.
                      </InlineAlert>
                    ) : null}
                    <div className="adm-subsection">
                      <h3 className="adm-subsection__title">Expresie</h3>
                      <FormulaAstEditor
                        id={selected.formulaId}
                        formula={selected}
                        value={drafts[selected.formulaId] ?? selected.expression}
                        disabled={!canEdit || pending}
                        onChange={(expression) => {
                          setDrafts((current) => ({ ...current, [selected.formulaId]: expression }));
                        }}
                      />
                      {selectedDirty ? <p className="adm-field__note adm-field__note--start">modificată · nesalvată</p> : null}
                    </div>
                    {selected.explanation ? (
                      <div className="adm-subsection">
                        <h3 className="adm-subsection__title">Explicație</h3>
                        <p className="adm-section__description">{selected.explanation}</p>
                      </div>
                    ) : null}
                    <div className="adm-subsection">
                      <AdminContextBlock title="La salvare">
                        <AdminBullets
                          items={[
                            "Salvarea creează o versiune nouă a acestei formule, folosită doar la calculele următoare.",
                            "Celelalte formule își păstrează valorile și ciornele.",
                            "Lucrările înghețate rămân neschimbate.",
                          ]}
                        />
                      </AdminContextBlock>
                    </div>
                    <div className="adm-subsection">
                      <AdminVersionList
                        rows={[...visibleHistory].reverse().map((row) => ({
                          key: `${row.formulaId}:${row.version}`,
                          version: `v${row.version}`,
                          active: row.status === "ACTIVE",
                          when: formatTimestamp(row.effectiveFrom ?? row.createdAt) ?? row.sourceLabel,
                          detail: row.status === "ACTIVE" ? null : row.statusLabel || row.status,
                        }))}
                        emptyText="Nu există încă versiuni persistate."
                      />
                    </div>
                    <AdminSupportDetails>
                      <p>Identificator: {selected.formulaId}</p>
                      <p>Rezultat: {selected.resultId}</p>
                    </AdminSupportDetails>
                  </section>
                ) : null
              }
            />
          ) : null}
        </>
      ) : null}
      {guard}
    </AdminLayout>
  );
}
