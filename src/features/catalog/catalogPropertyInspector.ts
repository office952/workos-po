import type {
  CatalogCapabilitiesPermissions,
  CatalogComponentView,
  CatalogPropertyView,
  CatalogWorkspaceProduct,
} from "../../adapters/catalogCapabilitiesAdapter";
import { UNRESOLVED_CONDITION_LABEL } from "../../adapters/catalogCapabilitiesAdapter";
import { catalogAdminHref, type CatalogSelection } from "./catalogSelection";
import { componentIndexLabel } from "./catalogStructure";

export type CatalogInspectorSession = {
  selectedId: string | null;
  open: boolean;
  returnTo: { componentId: string; propertyId: string; title: string } | null;
};

export type CatalogInspectorFormulaRead =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: string | null }
  | { status: "error" };

export type CatalogInspectorAction =
  | { kind: "show-property"; propertyId: string; label: string }
  | { kind: "open-component"; componentId: string; label: string }
  | { kind: "admin"; href: string; label: string };

export type CatalogInspectorLine = {
  text: string;
  action?: CatalogInspectorAction;
};

export type CatalogInspectorSection = {
  id: "who" | "when" | "depends" | "where";
  title: string;
  lines: CatalogInspectorLine[];
  warning?: { title: string; body: string; retry: boolean };
};

export type CatalogInspectorModel = {
  eyebrow: string;
  title: string;
  summary: string;
  sections: CatalogInspectorSection[];
  footnote: string;
};

const FOOTNOTE = "Sunt afișate doar legăturile declarate în definiția produsului.";
const UNAVAILABLE_FIXED = "WorkOS nu ține evidența calculelor și a resurselor care folosesc această valoare.";
const UNAVAILABLE_FORMULA = "WorkOS nu ține evidența formulelor care o folosesc.";
const FORMULA_ELEMENTS_CLOSED = "Elementele formulei nu pot fi deschise de aici.";

export function requestAvailabilityLabel(item: CatalogPropertyView): string {
  const request = item.request;
  if (!request) return "—";
  switch (request.conditionState) {
    case "none":
      return "Întotdeauna";
    case "known":
      return request.conditions.join(" ") || "—";
    case "unresolved":
      return request.conditions.length > 0
        ? `${request.conditions.join(" ")} ${UNRESOLVED_CONDITION_LABEL}`
        : UNRESOLVED_CONDITION_LABEL;
    default: {
      const exhaustive: never = request.conditionState;
      return exhaustive;
    }
  }
}

export function inspectableProperties(component: CatalogComponentView): CatalogPropertyView[] {
  return component.properties.filter((item) => item.origin !== "identity" && item.group !== "unsupported");
}

function kindLine(item: CatalogPropertyView): string | null {
  if (item.request?.kind === "text") return "Text liber.";
  if (item.request?.kind === "number") return "Număr.";
  if (item.options.length > 0) {
    return `Alege între ${item.options.map((option) => option.label).join(" și ")}.`;
  }
  return null;
}

function requiredLine(item: CatalogPropertyView): string {
  if (item.group === "request") {
    return item.request?.required === false ? "Se stabilește la cerere · opțională" : "Se stabilește la cerere · obligatorie";
  }
  if (item.group === "setting") {
    const version = item.setting?.version == null ? "" : ` · v${item.setting.version}`;
    const source = item.setting?.sourceLabel ? ` · ${item.setting.sourceLabel}` : "";
    return `Setare a organizației${version}${source}`;
  }
  if (item.group === "formula") {
    const version = item.formula?.version == null ? "" : ` · v${item.formula.version}`;
    const source = item.formula?.sourceLabel ? ` · ${item.formula.sourceLabel}` : "";
    return `Formulă a organizației${version}${source}`;
  }
  return item.value ? `${item.value}` : "Proprietate fixă";
}

function whoSection(item: CatalogPropertyView, formula: CatalogInspectorFormulaRead): CatalogInspectorSection {
  switch (item.group) {
    case "platform":
      return {
        id: "who",
        title: "Cine stabilește valoarea",
        lines: [
          { text: "Definiția produsului." },
          { text: "Aceeași la orice lucrare. Nu se modifică din Catalog." },
        ],
      };
    case "setting": {
      const amount = item.setting?.amount && item.setting.unit
        ? `${item.setting.amount} ${item.setting.unit}`
        : item.value;
      return {
        id: "who",
        title: "Cine stabilește valoarea",
        lines: [
          { text: "Organizația, în Setări tehnice." },
          { text: amount ? `Valoarea citită: ${amount}.` : "Valoarea nu a putut fi citită." },
        ],
      };
    }
    case "formula":
      return formulaWho(item, formula);
    case "request": {
      const confirm = item.ref?.endsWith("confirmedAreaMm2") || item.ref?.endsWith("confirmedPerimeterMm");
      const lines: CatalogInspectorLine[] = [
        { text: confirm ? "Operatorul o confirmă la fiecare cerere." : "Operatorul, la fiecare cerere." },
      ];
      const kind = kindLine(item);
      if (kind) lines.push({ text: kind });
      return { id: "who", title: "Cine stabilește valoarea", lines };
    }
    case "unsupported":
      return { id: "who", title: "Cine stabilește valoarea", lines: [{ text: "Nu este disponibilă în Catalog." }] };
    default: {
      const exhaustive: never = item.group;
      return exhaustive;
    }
  }
}

function formulaWho(item: CatalogPropertyView, formula: CatalogInspectorFormulaRead): CatalogInspectorSection {
  const lines: CatalogInspectorLine[] = [{ text: "WorkOS o calculează, după formula organizației." }];
  switch (formula.status) {
    case "idle":
    case "loading":
      return {
        id: "who",
        title: "Cine stabilește valoarea",
        lines: [...lines, { text: "Se citește alcătuirea formulei." }],
      };
    case "error":
      return {
        id: "who",
        title: "Cine stabilește valoarea",
        lines,
        warning: {
          title: "Eroare de citire",
          body: "Alcătuirea formulei nu a putut fi citită. Restul fișei este la zi.",
          retry: true,
        },
      };
    case "ready": {
      if (formula.explanation) lines.push({ text: formula.explanation });
      else if (item.formula?.uses.length || (item.formula?.workInputCount ?? 0) > 0) {
        const parts = [...(item.formula?.uses ?? [])];
        if ((item.formula?.workInputCount ?? 0) > 0) {
          parts.push(item.formula?.workInputCount === 1 ? "o valoare de pe lucrare" : `${item.formula?.workInputCount} valori de pe lucrare`);
        }
        lines.push({ text: `Referințe permise: ${parts.join(", ")}.` });
      }
      lines.push({ text: FORMULA_ELEMENTS_CLOSED });
      return { id: "who", title: "Cine stabilește valoarea", lines };
    }
    default: {
      const exhaustive: never = formula;
      return exhaustive;
    }
  }
}

function sourceFieldAction(
  item: CatalogPropertyView,
  product: CatalogWorkspaceProduct,
  componentId: string,
): CatalogInspectorAction | undefined {
  if (item.request?.conditionState !== "known") return undefined;
  for (const component of product.components) {
    for (const property of component.properties) {
      if (!property.dependents.some((dependent) => dependent.id === item.id)) continue;
      if (component.id === componentId) {
        return { kind: "show-property", propertyId: property.id, label: `Arată ${property.label}` };
      }
    }
  }
  return undefined;
}

function whenSection(
  item: CatalogPropertyView,
  product: CatalogWorkspaceProduct,
  componentId: string,
): CatalogInspectorSection | null {
  const request = item.request;
  if (!request || request.conditionState === "none") return null;
  if (request.conditionState === "unresolved") {
    return { id: "when", title: "Când este disponibilă", lines: [{ text: UNRESOLVED_CONDITION_LABEL }] };
  }
  const action = sourceFieldAction(item, product, componentId);
  const lines: CatalogInspectorLine[] = request.conditions.map((condition, index) => ({
    text: condition.replace(/^Apare când/, "Doar când"),
    action: index === 0 ? action : undefined,
  }));
  return { id: "when", title: "Când este disponibilă", lines };
}

function dependsSection(
  item: CatalogPropertyView,
  componentId: string,
  rows: readonly { id: string; index: number }[],
): CatalogInspectorSection {
  const lines: CatalogInspectorLine[] = [];
  for (const dependent of item.dependents) {
    const onThisComponent = dependent.componentId === componentId;
    const index = rows.find((row) => row.id === dependent.componentId)?.index ?? 0;
    lines.push({
      text: `${dependent.label}. ${dependent.note}`,
      action: onThisComponent
        ? { kind: "show-property", propertyId: dependent.id, label: `Arată ${dependent.label}` }
        : dependent.componentId
          ? {
              kind: "open-component",
              componentId: dependent.componentId,
              label: `Deschide ${componentIndexLabel(index)} ${dependent.label} →`,
            }
          : undefined,
    });
  }
  for (const link of item.areaHandoffs) {
    lines.push({
      text: `${componentIndexLabel(link.componentIndex)} ${link.componentLabel}. Preia ${link.subject} din această componentă.`,
      action: {
        kind: "open-component",
        componentId: link.componentId,
        label: `Deschide ${componentIndexLabel(link.componentIndex)} ${link.componentLabel} →`,
      },
    });
  }
  if (lines.length > 0) {
    return { id: "depends", title: "Ce depinde de ea", lines };
  }
  if (item.group === "request") {
    return { id: "depends", title: "Ce depinde de ea", lines: [{ text: "Nicio legătură declarată." }] };
  }
  return {
    id: "depends",
    title: "Ce depinde de ea",
    lines: [
      { text: "Indisponibil." },
      { text: item.group === "formula" ? UNAVAILABLE_FORMULA : UNAVAILABLE_FIXED },
    ],
  };
}

function whereSection(
  item: CatalogPropertyView,
  component: CatalogComponentView,
  selection: CatalogSelection,
  permissions: CatalogCapabilitiesPermissions,
): CatalogInspectorSection | null {
  switch (item.group) {
    case "platform":
    case "unsupported":
      return null;
    case "setting":
      return {
        id: "where",
        title: "Unde se modifică",
        lines: [
          {
            text: "În pagina Setări tehnice.",
            action: {
              kind: "admin",
              href: catalogAdminHref("/admin/technical", component.typeId, selection),
              label: permissions.canEditTechnicalSettings ? "Modifică în Setări tehnice ↗" : "Vezi în Setări tehnice ↗",
            },
          },
        ],
      };
    case "formula":
      return {
        id: "where",
        title: "Unde se modifică",
        lines: [
          {
            text: "În pagina Formule.",
            action: {
              kind: "admin",
              href: catalogAdminHref("/admin/formulas", component.typeId, selection),
              label: permissions.canEditFormulas ? "Deschide în Formule ↗" : "Vezi în Formule ↗",
            },
          },
        ],
      };
    case "request":
      return {
        id: "where",
        title: "Unde se modifică",
        lines: [{ text: "În cerere, la configurarea produsului." }, { text: "Catalogul nu păstrează o valoare pentru ea." }],
      };
    default: {
      const exhaustive: never = item.group;
      return exhaustive;
    }
  }
}

export function buildCatalogInspectorModel(args: {
  item: CatalogPropertyView;
  component: CatalogComponentView;
  product: CatalogWorkspaceProduct;
  rows: readonly { id: string; index: number }[];
  selection: CatalogSelection;
  permissions: CatalogCapabilitiesPermissions;
  ownershipLabel: string | null;
  formula: CatalogInspectorFormulaRead;
}): CatalogInspectorModel {
  const summary = args.item.group === "platform"
    ? `${args.item.value ?? "—"} · ${args.ownershipLabel ?? "Fixat de produs"}`
    : requiredLine(args.item);
  const sections = [
    whoSection(args.item, args.formula),
    whenSection(args.item, args.product, args.component.id),
    dependsSection(args.item, args.component.id, args.rows),
    whereSection(args.item, args.component, args.selection, args.permissions),
  ].filter((section): section is CatalogInspectorSection => section !== null);
  return {
    eyebrow: `Proprietate · ${args.component.label}`,
    title: args.item.label,
    summary,
    sections,
    footnote: FOOTNOTE,
  };
}

