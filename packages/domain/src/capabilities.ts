export const CAPABILITY_IDS = [
  "PRODUCT",
  "FORM",
  "TRUTH_COMPILER",
  "RESOURCES_COST",
  "COMMERCIAL",
  "EXECUTION",
  "PEOPLE",
  "REPORTING_PROJECTION",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CAPABILITY_STATUSES = [
  "PLANNED",
  "FOUNDATION_ONLY",
  "ACTIVE",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityDefinition = {
  id: CapabilityId;
  responsibility: string;
  owns: readonly string[];
  doesNotOwn: readonly string[];
  consumes: readonly string[];
  produces: readonly string[];
  currentPhase: string;
  status: CapabilityStatus;
};

export const capabilities: readonly CapabilityDefinition[] = [
  {
    id: "PRODUCT",
    responsibility:
      "Defines product families, templates, composition, and allowed configuration rules.",
    owns: [
      "Product Family",
      "Product Template",
      "composition rules",
      "component/module structure",
      "allowed product configuration rules",
    ],
    doesNotOwn: [
      "operator-confirmed Product Truth",
      "material purchase prices",
      "commercial price",
      "execution actuals",
    ],
    consumes: ["operator configuration intent"],
    produces: ["product structure", "configuration rules"],
    currentPhase: "PHASE 2 — Product Template foundation",
    status: "PLANNED",
  },
  {
    id: "FORM",
    responsibility:
      "Presents schema-driven operator input without becoming the source of product truth.",
    owns: [
      "Form Schema",
      "sections/fields/options",
      "visibility rules",
      "validation presentation contract",
    ],
    doesNotOwn: [
      "Product Truth",
      "formulas",
      "pricing",
      "product technical calculations",
    ],
    consumes: ["Product Template", "product structure"],
    produces: ["operator input presentation", "validation presentation contract"],
    currentPhase: "PHASE 3 — Schema-driven Form System",
    status: "PLANNED",
  },
  {
    id: "TRUTH_COMPILER",
    responsibility:
      "Compiles confirmed product meaning into ProductDefinition, Product Truth, and ProductAggregate.",
    owns: [
      "ProductDefinition",
      "Product Truth confirmation semantics",
      "ProductAggregate compilation",
      "later provenance/version/hash boundaries",
    ],
    doesNotOwn: [
      "material catalog truth",
      "commercial price",
      "execution actuals",
    ],
    consumes: [
      "confirmed operator input",
      "Product Template",
      "later resource facts",
    ],
    produces: ["ProductDefinition", "Product Truth", "ProductAggregate"],
    currentPhase: "PHASE 4–6 — ProductDefinition / Product Truth / ProductAggregate",
    status: "PLANNED",
  },
  {
    id: "RESOURCES_COST",
    responsibility:
      "Owns resource catalogs, pricing evidence, operational recipes, and EIC.",
    owns: [
      "material/resource catalogs",
      "pricing evidence",
      "operational processes",
      "labor/service recipes",
      "EIC",
    ],
    doesNotOwn: [
      "customer commercial price",
      "Product Truth",
      "execution actuals",
    ],
    consumes: ["ProductAggregate", "technical demand"],
    produces: ["resource facts", "EIC"],
    currentPhase: "PHASE 7–8 — Resource Catalogs / EIC",
    status: "PLANNED",
  },
  {
    id: "COMMERCIAL",
    responsibility:
      "Owns customer commercial price, company commercial rules, Quote Snapshot freeze, Quote Acceptance, Order Snapshot, and the customer Quote Document PDF projection of a frozen Quote. Quote freeze carries generic frozen production-input evidence that Order copies. That evidence is not a second Product Truth, EIC, or Commercial authority. The PDF does not reprice. Production Release is workshop authorization, not a Commercial fact.",
    owns: [
      "customer commercial price",
      "commercial rules",
      "Quote Snapshot",
      "Quote Acceptance",
      "Order Snapshot",
      "Quote Document projection",
    ],
    doesNotOwn: [
      "EIC authority",
      "Product Template",
      "execution actuals",
      "resource rates",
      "technical quantities",
      "production composition authority",
      "Production Release",
    ],
    consumes: ["planned EIC total", "EIC currency", "EIC completeness"],
    produces: [
      "commercial price projection",
      "Quote Snapshot",
      "Quote Acceptance",
      "Order Snapshot",
      "Quote Document projection",
      "frozen production-input copy",
    ],
    currentPhase: "FOUNDATION — Commercial price rules",
    status: "PLANNED",
  },
  {
    id: "EXECUTION",
    responsibility:
      "Will own operational plans, assignments, machine runs, and execution actuals. Owns Production Release as workshop authorization truth derived from Order.",
    owns: [
      "Production Release",
      "ExecutionPlan",
      "operational tasks",
      "assignments",
      "actual execution",
      "MachineRun",
      "Post-Job operational actuals",
    ],
    doesNotOwn: [
      "historical commercial reprice",
      "Product Truth rewriting",
      "attendance truth",
    ],
    consumes: ["Order commercial freeze", "frozen production input", "ProductAggregate", "EIC"],
    produces: ["Production Release", "ExecutionPlan", "operational actuals"],
    currentPhase: "LATER — Execution",
    status: "PLANNED",
  },
  {
    id: "PEOPLE",
    responsibility:
      "Will own employee master, attendance, payments, and advances as distinct people facts.",
    owns: ["employee master", "attendance", "payments", "advances"],
    doesNotOwn: [
      "execution session",
      "labor cost basis",
      "Product Truth",
    ],
    consumes: ["later operational assignment needs"],
    produces: ["employee master", "attendance records", "payment records", "advance records"],
    currentPhase: "LATER — People",
    status: "PLANNED",
  },
  {
    id: "REPORTING_PROJECTION",
    responsibility:
      "Projects and aggregates facts owned elsewhere. Never becomes the source of business truth.",
    owns: [
      "projections only",
      "aggregation/view models",
      "later reporting provenance",
    ],
    doesNotOwn: ["underlying business truth"],
    consumes: ["facts owned by other capabilities"],
    produces: ["read-only projections"],
    currentPhase: "LATER — Reports",
    status: "PLANNED",
  },
];

export function capability(id: CapabilityId): CapabilityDefinition {
  const found = capabilities.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Capability ${id} is missing from the kernel`);
  }
  return found;
}
