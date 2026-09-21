import {
  findFormulaDefinition,
  requiredFormulaDefinitions,
  type FormulaDefinition,
} from "./formulaDefinition.js";
import {
  createPlatformStarterFormulaVersions,
  formulaActorIsValid,
  formulaVersionRecordFromPersisted,
  isFormulaVersionSource,
  persistedFormulaVersionFromRecord,
  type FormulaVersionRecord,
  type PersistedFormulaVersion,
} from "./formulaVersion.js";
import { formulaAstIdentity } from "./formulaAst.js";

export const FORMULAS_INACTIVE = "FORMULAS_INACTIVE";
export const FORMULAS_INVALID = "FORMULAS_INVALID";

export const FORMULAS_EMPTY_REASON =
  "Formulele de calcul ale organizației lipsesc. Organizația trebuie inițializată înainte de calcul.";

export const FORMULAS_INACTIVE_REASON =
  "Formulele de calcul nu au o versiune activă validă. Configurează formulele înainte de calcule noi.";

export const FORMULAS_INVALID_REASON =
  "Istoricul formulelor de calcul este invalid. Calculele noi sunt blocate până la corectare.";

export type ResolvedFormulaVersion = {
  readonly formulaId: FormulaVersionRecord["formulaId"];
  readonly componentTypeId: FormulaVersionRecord["componentTypeId"];
  readonly resultId: string;
  readonly version: number;
  readonly status: "ACTIVE";
  readonly expression: FormulaVersionRecord["expression"];
  readonly astIdentity: string;
  readonly source: FormulaVersionRecord["source"];
  readonly scope: "ORGANIZATION";
  readonly effectiveFrom: string;
  readonly createdAt: string;
};

export type FormulaResolution =
  | { readonly ok: true; readonly formulas: readonly ResolvedFormulaVersion[] }
  | {
      readonly ok: false;
      readonly error: typeof FORMULAS_INACTIVE | typeof FORMULAS_INVALID;
      readonly reason: string;
      readonly history: readonly PersistedFormulaVersion[];
    };

export function resolveOrganizationFormulas(
  versions: readonly PersistedFormulaVersion[],
  options: {
    readonly requiredDefinitions?: readonly FormulaDefinition[];
  } = {},
): FormulaResolution {
  const required = options.requiredDefinitions ?? requiredFormulaDefinitions();
  if (versions.length === 0) {
    return {
      ok: false,
      error: FORMULAS_INACTIVE,
      reason: FORMULAS_EMPTY_REASON,
      history: versions,
    };
  }

  const records: FormulaVersionRecord[] = [];
  for (const row of versions) {
    const record = formulaVersionRecordFromPersisted(row);
    if (!record) {
      return {
        ok: false,
        error: FORMULAS_INVALID,
        reason: FORMULAS_INVALID_REASON,
        history: versions,
      };
    }
    records.push(record);
  }

  const requiredIds = new Set(required.map((definition) => definition.formulaId));
  const active = records.filter((row) => row.status === "ACTIVE");
  for (const row of active) {
    if (!requiredIds.has(row.formulaId) || !findFormulaDefinition(row.formulaId)) {
      return {
        ok: false,
        error: FORMULAS_INVALID,
        reason: FORMULAS_INVALID_REASON,
        history: versions,
      };
    }
  }

  const resolved: ResolvedFormulaVersion[] = [];
  for (const definition of required) {
    const definitionActive = active.filter((row) => row.formulaId === definition.formulaId);
    if (definitionActive.length !== 1) {
      return {
        ok: false,
        error: FORMULAS_INACTIVE,
        reason: FORMULAS_INACTIVE_REASON,
        history: versions,
      };
    }
    const row = definitionActive[0];
    if (
      !row ||
      !isFormulaVersionSource(row.source) ||
      !formulaActorIsValid(row) ||
      row.componentTypeId !== definition.componentTypeId ||
      row.resultId !== definition.resultId
    ) {
      return {
        ok: false,
        error: FORMULAS_INVALID,
        reason: FORMULAS_INVALID_REASON,
        history: versions,
      };
    }
    resolved.push({
      formulaId: row.formulaId,
      componentTypeId: row.componentTypeId,
      resultId: row.resultId,
      version: row.version,
      status: "ACTIVE",
      expression: row.expression,
      astIdentity: formulaAstIdentity(row.expression),
      source: row.source,
      scope: "ORGANIZATION",
      effectiveFrom: row.effectiveFrom,
      createdAt: row.createdAt,
    });
  }

  return { ok: true, formulas: resolved };
}

export function formulasForTypeFromResolved(
  typeId: FormulaVersionRecord["componentTypeId"],
  resolved: readonly ResolvedFormulaVersion[],
): readonly ResolvedFormulaVersion[] {
  return resolved.filter((item) => item.componentTypeId === typeId);
}

export function starterResolvedFormulas(
  now = "2026-09-21T00:00:00.000Z",
): readonly ResolvedFormulaVersion[] {
  const records = createPlatformStarterFormulaVersions({
    now,
    rowIdFor: (formulaId) => `fv:${formulaId}:starter`,
  });
  const resolved = resolveOrganizationFormulas(records.map(persistedFormulaVersionFromRecord));
  if (!resolved.ok) {
    throw new Error(`starter_formulas_unresolved:${resolved.reason}`);
  }
  return resolved.formulas;
}

export function starterFormulaVersionsForType(
  typeId: FormulaVersionRecord["componentTypeId"],
): readonly ResolvedFormulaVersion[] {
  return formulasForTypeFromResolved(typeId, starterResolvedFormulas());
}
