import {
  finiteFormulaNumber,
  isFormulaValueKind,
  type FormulaValueKind,
} from "./formulaValue.js";

export const FORMULA_AST_KINDS = [
  "NUMERIC_CONSTANT",
  "CONFIG_REF",
  "JOB_REF",
  "FORMULA_REF",
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "CEIL",
] as const;
export type FormulaAstKind = (typeof FORMULA_AST_KINDS)[number];

export const FORMULA_OPERATOR_KINDS = [
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "CEIL",
] as const;
export type FormulaOperatorKind = (typeof FORMULA_OPERATOR_KINDS)[number];

export const DEFERRED_FORMULA_OPERATORS = [
  "FLOOR",
  "ROUND",
  "MIN",
  "MAX",
  "COMPARE",
  "IF",
] as const;

export const MAX_AST_DEPTH = 12;
export const MAX_AST_NODES = 48;
export const FORMULA_AST_IDENTITY_PREFIX = "ast1:" as const;

export type FormulaAst =
  | {
      readonly kind: "NUMERIC_CONSTANT";
      readonly value: number;
      readonly valueKind: FormulaValueKind;
    }
  | { readonly kind: "CONFIG_REF"; readonly settingId: string }
  | { readonly kind: "JOB_REF"; readonly inputId: string }
  | { readonly kind: "FORMULA_REF"; readonly formulaId: string }
  | {
      readonly kind: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE";
      readonly left: FormulaAst;
      readonly right: FormulaAst;
    }
  | { readonly kind: "CEIL"; readonly operand: FormulaAst };

export type FormulaAstIssue = {
  readonly field: string;
  readonly reason: string;
};

export function isFormulaAstKind(value: string): value is FormulaAstKind {
  return (FORMULA_AST_KINDS as readonly string[]).includes(value);
}

export function isFormulaOperatorKind(value: string): value is FormulaOperatorKind {
  return (FORMULA_OPERATOR_KINDS as readonly string[]).includes(value);
}

export function parseFormulaExpressionJson(
  raw: unknown,
): { ok: true; ast: FormulaAst } | { ok: false; issues: readonly FormulaAstIssue[] } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      issues: [{ field: "expression", reason: "Expresia formulei lipsește." }],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      issues: [{ field: "expression", reason: "Expresia formulei nu este un JSON valid." }],
    };
  }
  return parseFormulaAst(parsed);
}

export function parseFormulaAst(
  value: unknown,
): { ok: true; ast: FormulaAst } | { ok: false; issues: readonly FormulaAstIssue[] } {
  const issues: FormulaAstIssue[] = [];
  const ast = readAst(value, 1, issues, { nodes: 0 });
  if (!ast || issues.length > 0) {
    return {
      ok: false,
      issues: issues.length > 0 ? issues : [{ field: "expression", reason: "AST invalid." }],
    };
  }
  return { ok: true, ast };
}

export function serializeFormulaExpression(ast: FormulaAst): string {
  return JSON.stringify(canonicalAst(ast));
}

export function formulaAstIdentity(ast: FormulaAst): string {
  return `${FORMULA_AST_IDENTITY_PREFIX}${fnv1aHex(serializeFormulaExpression(ast))}`;
}

export function formulaAstEquals(left: FormulaAst, right: FormulaAst): boolean {
  return serializeFormulaExpression(left) === serializeFormulaExpression(right);
}

export function countFormulaAstNodes(ast: FormulaAst): number {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
    case "CONFIG_REF":
    case "JOB_REF":
    case "FORMULA_REF":
      return 1;
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return 1 + countFormulaAstNodes(ast.left) + countFormulaAstNodes(ast.right);
    case "CEIL":
      return 1 + countFormulaAstNodes(ast.operand);
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

export function collectFormulaRefs(ast: FormulaAst): string[] {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
    case "CONFIG_REF":
    case "JOB_REF":
      return [];
    case "FORMULA_REF":
      return [ast.formulaId];
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return [...collectFormulaRefs(ast.left), ...collectFormulaRefs(ast.right)];
    case "CEIL":
      return collectFormulaRefs(ast.operand);
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

export function formulaDependencyGraphHasCycle(
  formulas: readonly { readonly formulaId: string; readonly expression: FormulaAst }[],
): boolean {
  const byId = new Map(formulas.map((item) => [item.formulaId, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (formulaId: string): boolean => {
    if (visited.has(formulaId)) {
      return false;
    }
    if (visiting.has(formulaId)) {
      return true;
    }
    visiting.add(formulaId);
    const formula = byId.get(formulaId);
    if (formula) {
      for (const ref of collectFormulaRefs(formula.expression)) {
        if (visit(ref)) {
          return true;
        }
      }
    }
    visiting.delete(formulaId);
    visited.add(formulaId);
    return false;
  };

  return formulas.some((formula) => visit(formula.formulaId));
}

export function formulaAstDepth(ast: FormulaAst): number {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
    case "CONFIG_REF":
    case "JOB_REF":
    case "FORMULA_REF":
      return 1;
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return 1 + Math.max(formulaAstDepth(ast.left), formulaAstDepth(ast.right));
    case "CEIL":
      return 1 + formulaAstDepth(ast.operand);
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

function readAst(
  value: unknown,
  depth: number,
  issues: FormulaAstIssue[],
  counter: { nodes: number },
): FormulaAst | null {
  if (depth > MAX_AST_DEPTH) {
    issues.push({
      field: "expression",
      reason: `Adâncimea AST depășește limita de ${MAX_AST_DEPTH}.`,
    });
    return null;
  }
  if (counter.nodes >= MAX_AST_NODES) {
    issues.push({
      field: "expression",
      reason: `Numărul de noduri AST depășește limita de ${MAX_AST_NODES}.`,
    });
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ field: "expression", reason: "Nodul AST trebuie să fie un obiect." });
    return null;
  }
  counter.nodes += 1;
  const node = value as Record<string, unknown>;
  const kind = typeof node.kind === "string" ? node.kind : "";
  if (!isFormulaAstKind(kind)) {
    issues.push({
      field: "expression",
      reason: "Nodul AST nu este suportat.",
    });
    return null;
  }
  switch (kind) {
    case "NUMERIC_CONSTANT": {
      const numeric = finiteFormulaNumber(node.value);
      const valueKind =
        typeof node.valueKind === "string" && isFormulaValueKind(node.valueKind)
          ? node.valueKind
          : null;
      if (numeric === null || valueKind === null) {
        issues.push({
          field: "NUMERIC_CONSTANT",
          reason: "Constanta trebuie să fie un număr finit cu dimensiune semantică.",
        });
        return null;
      }
      return { kind, value: numeric, valueKind };
    }
    case "CONFIG_REF": {
      const settingId = asNonEmptyString(node.settingId);
      if (!settingId) {
        issues.push({
          field: "CONFIG_REF",
          reason: "Referința de setare tehnică lipsește.",
        });
        return null;
      }
      return { kind, settingId };
    }
    case "JOB_REF": {
      const inputId = asNonEmptyString(node.inputId);
      if (!inputId) {
        issues.push({
          field: "JOB_REF",
          reason: "Referința de măsurătoare lipsește.",
        });
        return null;
      }
      return { kind, inputId };
    }
    case "FORMULA_REF": {
      const formulaId = asNonEmptyString(node.formulaId);
      if (!formulaId) {
        issues.push({
          field: "FORMULA_REF",
          reason: "Referința de formulă lipsește.",
        });
        return null;
      }
      return { kind, formulaId };
    }
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE": {
      const left = readAst(node.left, depth + 1, issues, counter);
      const right = readAst(node.right, depth + 1, issues, counter);
      if (!left || !right) {
        return null;
      }
      return { kind, left, right };
    }
    case "CEIL": {
      const operand = readAst(node.operand, depth + 1, issues, counter);
      if (!operand) {
        return null;
      }
      return { kind, operand };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function canonicalAst(ast: FormulaAst): unknown {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
      return { kind: ast.kind, value: ast.value, valueKind: ast.valueKind };
    case "CONFIG_REF":
      return { kind: ast.kind, settingId: ast.settingId };
    case "JOB_REF":
      return { kind: ast.kind, inputId: ast.inputId };
    case "FORMULA_REF":
      return { kind: ast.kind, formulaId: ast.formulaId };
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return {
        kind: ast.kind,
        left: canonicalAst(ast.left),
        right: canonicalAst(ast.right),
      };
    case "CEIL":
      return { kind: ast.kind, operand: canonicalAst(ast.operand) };
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function fnv1aHex(canonical: string): string {
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
