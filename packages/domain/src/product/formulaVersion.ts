import {
  formulaAstEquals,
  formulaAstIdentity,
  formulaDependencyGraphHasCycle,
  parseFormulaExpressionJson,
  serializeFormulaExpression,
  type FormulaAst,
} from "./formulaAst.js";
import {
  findFormulaDefinition,
  isSupportedFormulaId,
  lightingFrontLedFormulaDefinitions,
  starterAstFor,
  validateFormulaAstAgainstDefinition,
  type FormulaDefinition,
  type SupportedFormulaId,
} from "./formulaDefinition.js";
import type { ComponentTypeId } from "./componentTypes.js";
import type { FormulaPresentationUnit, FormulaValueKind } from "./formulaValue.js";

export const FORMULA_VERSION_SOURCES = ["PLATFORM_STARTER", "ORGANIZATION"] as const;
export type FormulaVersionSource = (typeof FORMULA_VERSION_SOURCES)[number];

export const FORMULA_VERSION_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type FormulaVersionStatus = (typeof FORMULA_VERSION_STATUSES)[number];

export const FORMULA_ACTOR_KINDS = ["SYSTEM", "USER"] as const;
export type FormulaActorKind = (typeof FORMULA_ACTOR_KINDS)[number];

export const FORMULA_SCOPE = "ORGANIZATION" as const;

export const FORMULA_STARTER_SYSTEM_ID = "FORMULA_STARTER_V1";

export type FormulaActor =
  | { readonly kind: "SYSTEM"; readonly systemId: string }
  | { readonly kind: "USER"; readonly userId: string };

export type FormulaIssue = {
  readonly field: string;
  readonly reason: string;
};

export type PersistedFormulaVersion = {
  readonly formulaVersionRowId: string;
  readonly formulaId: string;
  readonly componentTypeId: string;
  readonly resultId: string;
  readonly version: number;
  readonly status: string;
  readonly expressionJson: string;
  readonly source: string;
  readonly effectiveFrom: string;
  readonly createdAt: string;
  readonly actorKind: string;
  readonly actorUserId: string | null;
  readonly actorSystemId: string | null;
  readonly supersedesVersion: number | null;
};

export type FormulaVersionRecord = {
  readonly formulaVersionRowId: string;
  readonly formulaId: SupportedFormulaId;
  readonly componentTypeId: ComponentTypeId;
  readonly resultId: string;
  readonly version: number;
  readonly status: FormulaVersionStatus;
  readonly expression: FormulaAst;
  readonly expressionJson: string;
  readonly source: FormulaVersionSource;
  readonly effectiveFrom: string;
  readonly createdAt: string;
  readonly actorKind: FormulaActorKind;
  readonly actorUserId: string | null;
  readonly actorSystemId: string | null;
  readonly supersedesVersion: number | null;
};

export type FormulaDraftExpression = {
  readonly formulaId: string;
  readonly expression: FormulaAst;
};

export type FormulaSavePlan =
  | {
      readonly ok: true;
      readonly alreadyApplied: boolean;
      readonly next: readonly FormulaVersionRecord[];
      readonly retire: readonly { formulaId: string; version: number }[];
    }
  | { readonly ok: false; readonly issues: readonly FormulaIssue[] };

export function isFormulaVersionSource(value: string): value is FormulaVersionSource {
  return (FORMULA_VERSION_SOURCES as readonly string[]).includes(value);
}

export function isFormulaVersionStatus(value: string): value is FormulaVersionStatus {
  return (FORMULA_VERSION_STATUSES as readonly string[]).includes(value);
}

export function isFormulaActorKind(value: string): value is FormulaActorKind {
  return (FORMULA_ACTOR_KINDS as readonly string[]).includes(value);
}

export function formulaSourceLabel(source: FormulaVersionSource): string {
  switch (source) {
    case "PLATFORM_STARTER":
      return "Formulă de pornire";
    case "ORGANIZATION":
      return "Formulă a organizației";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function formulaStatusLabel(status: FormulaVersionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Activă";
    case "RETIRED":
      return "Retrasă";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function formulaActorFieldsFrom(
  actor: FormulaActor,
): Pick<FormulaVersionRecord, "actorKind" | "actorUserId" | "actorSystemId"> {
  switch (actor.kind) {
    case "SYSTEM":
      return {
        actorKind: "SYSTEM",
        actorUserId: null,
        actorSystemId: actor.systemId,
      };
    case "USER":
      return {
        actorKind: "USER",
        actorUserId: actor.userId,
        actorSystemId: null,
      };
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function formulaActorIsValid(record: {
  readonly actorKind: FormulaActorKind;
  readonly actorUserId: string | null;
  readonly actorSystemId: string | null;
}): boolean {
  switch (record.actorKind) {
    case "SYSTEM":
      return (
        typeof record.actorSystemId === "string" &&
        record.actorSystemId.trim().length > 0 &&
        record.actorUserId === null
      );
    case "USER":
      return (
        typeof record.actorUserId === "string" &&
        record.actorUserId.trim().length > 0 &&
        record.actorSystemId === null
      );
    default: {
      const _exhaustive: never = record.actorKind;
      return _exhaustive;
    }
  }
}

export function persistedFormulaVersionFromRecord(
  row: FormulaVersionRecord,
): PersistedFormulaVersion {
  return {
    formulaVersionRowId: row.formulaVersionRowId,
    formulaId: row.formulaId,
    componentTypeId: row.componentTypeId,
    resultId: row.resultId,
    version: row.version,
    status: row.status,
    expressionJson: row.expressionJson,
    source: row.source,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    actorKind: row.actorKind,
    actorUserId: row.actorUserId,
    actorSystemId: row.actorSystemId,
    supersedesVersion: row.supersedesVersion,
  };
}

export function createPlatformStarterFormulaVersions(input: {
  readonly now: string;
  readonly rowIdFor: (formulaId: string) => string;
}): FormulaVersionRecord[] {
  return lightingFrontLedFormulaDefinitions.map((definition) => {
    const expression = starterAstFor(definition.formulaId);
    const issues = validateFormulaAstAgainstDefinition(definition, expression);
    if (issues.length > 0) {
      throw new Error(`starter_invalid:${definition.formulaId}:${issues[0]?.reason ?? "invalid"}`);
    }
    return {
      formulaVersionRowId: input.rowIdFor(definition.formulaId),
      formulaId: definition.formulaId,
      componentTypeId: definition.componentTypeId,
      resultId: definition.resultId,
      version: 1,
      status: "ACTIVE",
      expression,
      expressionJson: serializeFormulaExpression(expression),
      source: "PLATFORM_STARTER",
      effectiveFrom: input.now,
      createdAt: input.now,
      ...formulaActorFieldsFrom({
        kind: "SYSTEM",
        systemId: FORMULA_STARTER_SYSTEM_ID,
      }),
      supersedesVersion: null,
    };
  });
}

export function planFormulaSave(
  existing: readonly FormulaVersionRecord[],
  drafts: readonly FormulaDraftExpression[],
  actor: FormulaActor,
  input: { readonly rowIdFor: (formulaId: string) => string; readonly now: string },
): FormulaSavePlan {
  if (actor.kind === "USER" && actor.userId.trim().length === 0) {
    return {
      ok: false,
      issues: [{ field: "actor", reason: "Salvarea cere un utilizator autentificat." }],
    };
  }
  if (actor.kind === "SYSTEM" && actor.systemId.trim().length === 0) {
    return {
      ok: false,
      issues: [{ field: "actor", reason: "Salvarea de sistem cere un identificator valid." }],
    };
  }

  const issues: FormulaIssue[] = [];
  const next: FormulaVersionRecord[] = [];
  const retire: { formulaId: string; version: number }[] = [];

  for (const draft of drafts) {
    const definition = findFormulaDefinition(draft.formulaId);
    if (!definition || !isSupportedFormulaId(draft.formulaId)) {
      issues.push({
        field: draft.formulaId,
        reason: "Formula nu este administrabilă în această versiune.",
      });
      continue;
    }
    const astIssues = validateFormulaAstAgainstDefinition(definition, draft.expression);
    if (astIssues.length > 0) {
      issues.push(...astIssues);
      continue;
    }

    const history = existing.filter((row) => row.formulaId === draft.formulaId);
    const active = history.filter((row) => row.status === "ACTIVE");
    if (active.length > 1) {
      issues.push({
        field: draft.formulaId,
        reason: "Există mai multe versiuni active. Salvează din nou după corectare.",
      });
      continue;
    }
    const currentActive = active[0] ?? null;
    if (currentActive && formulaAstEquals(currentActive.expression, draft.expression)) {
      continue;
    }

    const latestVersion = history.reduce((max, row) => (row.version > max ? row.version : max), 0);
    const nextVersion = latestVersion + 1;
    const supersedesVersion = currentActive
      ? currentActive.version
      : latestVersion > 0
        ? latestVersion
        : null;

    if (currentActive) {
      retire.push({ formulaId: draft.formulaId, version: currentActive.version });
    }

    next.push({
      formulaVersionRowId: input.rowIdFor(draft.formulaId),
      formulaId: definition.formulaId,
      componentTypeId: definition.componentTypeId,
      resultId: definition.resultId,
      version: nextVersion,
      status: "ACTIVE",
      expression: draft.expression,
      expressionJson: serializeFormulaExpression(draft.expression),
      source: "ORGANIZATION",
      effectiveFrom: input.now,
      createdAt: input.now,
      ...formulaActorFieldsFrom(actor),
      supersedesVersion,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const nextActive = new Map<string, FormulaAst>();
  for (const row of existing) {
    if (row.status === "ACTIVE") {
      nextActive.set(row.formulaId, row.expression);
    }
  }
  for (const item of retire) {
    nextActive.delete(item.formulaId);
  }
  for (const row of next) {
    nextActive.set(row.formulaId, row.expression);
  }
  if (
    formulaDependencyGraphHasCycle(
      [...nextActive.entries()].map(([formulaId, expression]) => ({ formulaId, expression })),
    )
  ) {
    return {
      ok: false,
      issues: [
        {
          field: "expression",
          reason: "Formulele de calcul conțin o dependență ciclică.",
        },
      ],
    };
  }

  return {
    ok: true,
    alreadyApplied: next.length === 0,
    next,
    retire,
  };
}

export function isFormulaVersionRecord(value: unknown): value is FormulaVersionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as PersistedFormulaVersion & { expression?: FormulaAst };
  const definition = findFormulaDefinition(row.formulaId);
  if (!definition || !isSupportedFormulaId(row.formulaId)) {
    return false;
  }
  const parsed = parseFormulaExpressionJson(row.expressionJson);
  if (!parsed.ok) {
    return false;
  }
  if (
    typeof row.formulaVersionRowId !== "string" ||
    row.componentTypeId !== definition.componentTypeId ||
    row.resultId !== definition.resultId ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    !isFormulaVersionStatus(row.status) ||
    !isFormulaVersionSource(row.source) ||
    !isFormulaActorKind(row.actorKind) ||
    typeof row.effectiveFrom !== "string" ||
    typeof row.createdAt !== "string"
  ) {
    return false;
  }
  if (row.supersedesVersion !== null && !Number.isInteger(row.supersedesVersion)) {
    return false;
  }
  if (validateFormulaAstAgainstDefinition(definition, parsed.ast).length > 0) {
    return false;
  }
  if (!formulaActorIsValid({
    actorKind: row.actorKind,
    actorUserId: row.actorUserId,
    actorSystemId: row.actorSystemId,
  })) {
    return false;
  }
  return true;
}

export function formulaVersionRecordFromPersisted(
  row: PersistedFormulaVersion,
): FormulaVersionRecord | null {
  if (!isFormulaVersionRecord(row)) {
    return null;
  }
  const parsed = parseFormulaExpressionJson(row.expressionJson);
  if (!parsed.ok || !isSupportedFormulaId(row.formulaId)) {
    return null;
  }
  return {
    formulaVersionRowId: row.formulaVersionRowId,
    formulaId: row.formulaId,
    componentTypeId: row.componentTypeId as ComponentTypeId,
    resultId: row.resultId,
    version: row.version,
    status: row.status as FormulaVersionStatus,
    expression: parsed.ast,
    expressionJson: serializeFormulaExpression(parsed.ast),
    source: row.source as FormulaVersionSource,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt,
    actorKind: row.actorKind as FormulaActorKind,
    actorUserId: row.actorUserId,
    actorSystemId: row.actorSystemId,
    supersedesVersion: row.supersedesVersion,
  };
}

export function formulaDefinitionPresentation(definition: FormulaDefinition): {
  readonly formulaId: SupportedFormulaId;
  readonly resultId: string;
  readonly resultUnit: FormulaPresentationUnit;
  readonly resultValueKind: FormulaValueKind;
  readonly astIdentity: string;
} {
  return {
    formulaId: definition.formulaId,
    resultId: definition.resultId,
    resultUnit: definition.resultUnit,
    resultValueKind: definition.resultValueKind,
    astIdentity: formulaAstIdentity(starterAstFor(definition.formulaId)),
  };
}
