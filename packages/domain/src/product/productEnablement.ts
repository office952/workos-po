import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "./acmCassetteNone.js";
import {
  presentedTemplates,
  type DisplayLabelCatalog,
} from "./displayMetadata.js";
import { projectProductCatalog } from "./catalogProjection.js";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import { getProductTemplate, productTemplates } from "./productRegistry.js";
import type { CatalogTreeNode } from "./types.js";

export const PRODUCT_ENABLEMENT_SOURCES = ["CODE_DEFAULT", "ORGANIZATION"] as const;
export type ProductEnablementSource = (typeof PRODUCT_ENABLEMENT_SOURCES)[number];

export const PRODUCT_ENABLEMENT_VERSION_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type ProductEnablementVersionStatus =
  (typeof PRODUCT_ENABLEMENT_VERSION_STATUSES)[number];

export const PRODUCT_NOT_ENABLED_FOR_NEW_WORK = "product_not_enabled";
export const PRODUCT_NOT_ENABLED_FOR_NEW_WORK_REASON =
  "Acest produs nu este oferit pentru lucrări noi. Ofertele și lucrările existente rămân deschise.";

export const INACTIVE_PRODUCT_ENABLEMENT = "inactive_product_enablement";
export const INACTIVE_PRODUCT_ENABLEMENT_REASON =
  "Organizația deține o selecție de produse, dar nu există o versiune activă validă. Configurează produsele oferite înainte de lucrări noi.";

export const CODE_DEFAULT_ENABLEMENT_GUIDANCE =
  "Produsele existente rămân oferite pentru lucrări noi, până când organizația confirmă propria selecție.";

export const PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1 = [
  CANONICAL_PRODUCT_CODE,
  ACM_CASSETTE_NONE_PRODUCT_CODE,
] as const;

export const ORGANIZATION_ENABLEMENT_GUIDANCE =
  "Aceste produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise.";

export type ProductEnablementIssue = {
  readonly field: string;
  readonly reason: string;
};

export type ProductEnablementDraft = {
  readonly templateCode: string;
  readonly enabled: boolean;
};

export type ProductEnablementEntry = {
  readonly templateCode: string;
  readonly label: string;
  readonly enabled: boolean;
};

export type ProductEnablementVersionRecord = {
  readonly enablementVersionRowId: string;
  readonly version: number;
  readonly status: ProductEnablementVersionStatus;
  readonly source: "ORGANIZATION";
  readonly enabledTemplateCodes: readonly string[];
  readonly createdAt: string;
  readonly effectiveFrom: string;
  readonly actorUserId: string | null;
  readonly supersedesVersion: number | null;
};

export type PersistedProductEnablementVersion = {
  readonly enablementVersionRowId: string;
  readonly version: number;
  readonly status: string;
  readonly source: string;
  readonly enabledTemplateCodes: readonly string[];
  readonly createdAt: string;
  readonly effectiveFrom: string;
  readonly actorUserId: string | null;
  readonly supersedesVersion: number | null;
};

export type ProductEnablementResolution =
  | {
      readonly ok: true;
      readonly source: ProductEnablementSource;
      readonly version: number | null;
      readonly enabledTemplateCodes: readonly string[];
      readonly entries: readonly ProductEnablementEntry[];
      readonly guidance: string;
    }
  | {
      readonly ok: false;
      readonly error: typeof INACTIVE_PRODUCT_ENABLEMENT;
      readonly reason: string;
      readonly history: readonly ProductEnablementVersionRecord[];
    };

export type ProductEnablementSavePlan =
  | {
      readonly ok: true;
      readonly alreadyApplied: boolean;
      readonly next: ProductEnablementVersionRecord | null;
      readonly retire: { readonly version: number } | null;
    }
  | { readonly ok: false; readonly issues: readonly ProductEnablementIssue[] };

export function isProductEnablementSource(
  value: string,
): value is ProductEnablementSource {
  return (PRODUCT_ENABLEMENT_SOURCES as readonly string[]).includes(value);
}

export function isProductEnablementVersionStatus(
  value: string,
): value is ProductEnablementVersionStatus {
  return (PRODUCT_ENABLEMENT_VERSION_STATUSES as readonly string[]).includes(value);
}

export function knownProductTemplateCodes(): readonly string[] {
  return productTemplates.map((item) => item.code);
}

export function defaultEnabledTemplateCodes(): readonly string[] {
  return PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1;
}

export function productEnablementSourceLabel(source: ProductEnablementSource): string {
  switch (source) {
    case "CODE_DEFAULT":
      return "Selecție de sistem";
    case "ORGANIZATION":
      return "Selecție a firmei";
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

export function productEnablementEntries(
  enabledTemplateCodes: readonly string[],
): ProductEnablementEntry[] {
  const enabled = new Set(enabledTemplateCodes);
  return productTemplates.map((template) => ({
    templateCode: template.code,
    label: template.label,
    enabled: enabled.has(template.code),
  }));
}

export function sortedTemplateCodes(codes: readonly string[]): string[] {
  return [...codes].slice().sort((left, right) => left.localeCompare(right));
}

export function sameEnabledTemplateCodes(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = sortedTemplateCodes(left);
  const b = sortedTemplateCodes(right);
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

export function isTemplateEnabledForNewWork(
  templateCode: string,
  resolution: Extract<ProductEnablementResolution, { ok: true }>,
): boolean {
  return resolution.enabledTemplateCodes.includes(templateCode);
}

export function projectNewWorkProductCatalog(
  labels: DisplayLabelCatalog,
  enabledTemplateCodes: readonly string[],
): CatalogTreeNode[] {
  return projectProductCatalog(labels, { enabledTemplateCodes });
}

export function overlayEnablementLabels(
  entries: readonly ProductEnablementEntry[],
  labels: DisplayLabelCatalog,
): ProductEnablementEntry[] {
  const presented = presentedTemplates(labels);
  return entries.map((entry) => {
    const labeled = presented.find((item) => item.code === entry.templateCode);
    return labeled ? { ...entry, label: labeled.label } : entry;
  });
}

export function codeDefaultProductEnablement(): Extract<
  ProductEnablementResolution,
  { ok: true }
> {
  const enabledTemplateCodes = defaultEnabledTemplateCodes();
  return {
    ok: true,
    source: "CODE_DEFAULT",
    version: null,
    enabledTemplateCodes,
    entries: productEnablementEntries(enabledTemplateCodes),
    guidance: CODE_DEFAULT_ENABLEMENT_GUIDANCE,
  };
}

export function productEnablementVersionRecordFromPersisted(
  row: PersistedProductEnablementVersion,
): ProductEnablementVersionRecord | null {
  if (
    !isProductEnablementVersionStatus(row.status) ||
    row.source !== "ORGANIZATION" ||
    !Number.isInteger(row.version) ||
    row.version < 1
  ) {
    return null;
  }
  const codes = row.enabledTemplateCodes;
  if (!Array.isArray(codes) || codes.some((code) => !getProductTemplate(code))) {
    return null;
  }
  return {
    enablementVersionRowId: row.enablementVersionRowId,
    version: row.version,
    status: row.status,
    source: "ORGANIZATION",
    enabledTemplateCodes: sortedTemplateCodes(codes),
    createdAt: row.createdAt,
    effectiveFrom: row.effectiveFrom,
    actorUserId: row.actorUserId,
    supersedesVersion: row.supersedesVersion,
  };
}

export function resolveProductEnablement(
  versions: readonly PersistedProductEnablementVersion[],
): ProductEnablementResolution {
  if (versions.length === 0) {
    return codeDefaultProductEnablement();
  }
  const valid = versions.flatMap((row) => {
    const record = productEnablementVersionRecordFromPersisted(row);
    return record ? [record] : [];
  });
  if (valid.length !== versions.length) {
    return {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason: INACTIVE_PRODUCT_ENABLEMENT_REASON,
      history: valid,
    };
  }
  const active = valid.filter((row) => row.status === "ACTIVE");
  if (active.length !== 1) {
    return {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason: INACTIVE_PRODUCT_ENABLEMENT_REASON,
      history: valid,
    };
  }
  const current = active[0];
  if (!current) {
    return {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason: INACTIVE_PRODUCT_ENABLEMENT_REASON,
      history: valid,
    };
  }
  return {
    ok: true,
    source: "ORGANIZATION",
    version: current.version,
    enabledTemplateCodes: current.enabledTemplateCodes,
    entries: productEnablementEntries(current.enabledTemplateCodes),
    guidance: ORGANIZATION_ENABLEMENT_GUIDANCE,
  };
}

export function planProductEnablementSave(
  existing: readonly ProductEnablementVersionRecord[],
  drafts: readonly ProductEnablementDraft[],
  options: {
    readonly now: string;
    readonly actorUserId: string | null;
    readonly rowId: string;
  },
): ProductEnablementSavePlan {
  const issues = validateEnablementDrafts(drafts);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const enabledTemplateCodes = sortedTemplateCodes(
    drafts.filter((item) => item.enabled).map((item) => item.templateCode),
  );
  const active = existing.filter((row) => row.status === "ACTIVE");
  if (existing.length > 0 && active.length !== 1) {
    return {
      ok: false,
      issues: [
        {
          field: "version",
          reason: INACTIVE_PRODUCT_ENABLEMENT_REASON,
        },
      ],
    };
  }
  const current = active[0];
  if (current && sameEnabledTemplateCodes(current.enabledTemplateCodes, enabledTemplateCodes)) {
    return { ok: true, alreadyApplied: true, next: null, retire: null };
  }
  const nextVersion = (current?.version ?? 0) + 1;
  return {
    ok: true,
    alreadyApplied: false,
    retire: current ? { version: current.version } : null,
    next: {
      enablementVersionRowId: options.rowId,
      version: nextVersion,
      status: "ACTIVE",
      source: "ORGANIZATION",
      enabledTemplateCodes,
      createdAt: options.now,
      effectiveFrom: options.now,
      actorUserId: options.actorUserId,
      supersedesVersion: current?.version ?? null,
    },
  };
}

function validateEnablementDrafts(
  drafts: readonly ProductEnablementDraft[],
): ProductEnablementIssue[] {
  const known = knownProductTemplateCodes();
  const seen = new Set<string>();
  const issues: ProductEnablementIssue[] = [];
  for (const draft of drafts) {
    if (!getProductTemplate(draft.templateCode)) {
      issues.push({
        field: draft.templateCode,
        reason: "Se pot oferi doar produsele partajate existente.",
      });
      continue;
    }
    if (seen.has(draft.templateCode)) {
      issues.push({
        field: draft.templateCode,
        reason: "Fiecare produs partajat trebuie să apară o singură dată.",
      });
      continue;
    }
    seen.add(draft.templateCode);
  }
  for (const code of known) {
    if (!seen.has(code)) {
      issues.push({
        field: code,
        reason: "Selecția trebuie să cuprindă toate produsele partajate.",
      });
    }
  }
  return issues;
}
