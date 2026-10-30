import { forexBackChannelRecipe } from "./backManufacturing.js";
import { getFormSchema, getProductTemplate } from "./productRegistry.js";
import type { FormField, ProductTemplate } from "./types.js";

/**
 * ORGANIZATION_PRESET V1.
 *
 * A preset is a named, revisioned selection of closed options that the current
 * product form schema already offers. It is not a ProductTemplate, not an
 * organization technical setting, and not a request measurement.
 *
 * Durable storage is not part of this module. `planOrganizationPresetRevision`
 * returns the next immutable revision or a rejection. It does not write.
 */
export const ORGANIZATION_PRESET_SCHEMA_VERSION = "organization-preset.v1" as const;

export const ORGANIZATION_PRESET_LIFECYCLES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;
export type OrganizationPresetLifecycle = (typeof ORGANIZATION_PRESET_LIFECYCLES)[number];

export const PRESET_NAME_MAX_LENGTH = 80;
export const PRESET_DESCRIPTION_MAX_LENGTH = 280;

export type OrganizationPresetSelection = {
  readonly fieldId: string;
  readonly value: string;
};

export type OrganizationPresetRevision = {
  readonly schemaVersion: typeof ORGANIZATION_PRESET_SCHEMA_VERSION;
  readonly presetId: string;
  readonly organizationId: string;
  readonly templateCode: string;
  readonly templateVersion: string;
  readonly revision: number;
  readonly name: string;
  readonly description: string;
  readonly lifecycle: OrganizationPresetLifecycle;
  readonly selections: readonly OrganizationPresetSelection[];
  readonly supersedesRevision: number | null;
};

export type PresetIssueCode =
  | "unknown_template"
  | "not_preset_eligible"
  | "unknown_option"
  | "option_not_prepared"
  | "duplicate_field"
  | "empty_name"
  | "name_too_long"
  | "description_too_long"
  | "invalid_preset_id"
  | "member_cannot_change"
  | "organization_mismatch"
  | "revision_conflict"
  | "published_requires_selection"
  | "retired_is_closed"
  | "retired_selections_frozen"
  | "template_version_mismatch"
  | "invalid_lifecycle";

export type PresetIssue = {
  readonly code: PresetIssueCode;
  readonly fieldId: string | null;
  readonly message: string;
};

export type PresetEligibleOption = {
  readonly value: string;
  readonly label: string;
  readonly support: "SELECTABLE" | "NOT_PREPARED";
  readonly rejectionCode: "groove_recipe_missing" | null;
  readonly rejectionMessage: string | null;
};

export type PresetEligibleField = {
  readonly fieldId: string;
  readonly label: string;
  readonly componentId: string;
  readonly options: readonly PresetEligibleOption[];
};

export type OrganizationPresetContract = {
  readonly schemaVersion: typeof ORGANIZATION_PRESET_SCHEMA_VERSION;
  readonly persistence: "ORGANIZATION_VERSIONED";
  readonly canonicalWriter: {
    readonly method: "POST";
    readonly path: "/api/catalog/presets";
    readonly permission: "owner";
  };
  readonly templateCode: string;
  readonly templateVersion: string;
  readonly eligibleFields: readonly PresetEligibleField[];
  readonly whereUsed: { readonly available: false; readonly reason: "no_request_reference_index" };
};

export type OrganizationPresetPlan =
  | { readonly ok: true; readonly revision: OrganizationPresetRevision }
  | { readonly ok: false; readonly issues: readonly PresetIssue[] };

const PRESET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/**
 * A form field may be stored on an organization preset only when it is a closed
 * select that is always visible on the template and is not a platform-fixed value.
 * Text, numbers, colors, inscriptions, confirmed measurements, and fields that
 * appear only for a job context stay on the request.
 */
export function isPresetEligibleField(template: ProductTemplate, field: FormField): boolean {
  if (field.type !== "select" || !field.options || field.options.length === 0) return false;
  if (field.visibleWhen.kind !== "always") return false;
  if (Object.prototype.hasOwnProperty.call(template.fixedValues, field.id)) return false;
  return true;
}

function optionSupport(fieldId: string, value: string, label: string): PresetEligibleOption {
  if (fieldId === "back.profile" && value === "GROOVED" && !forexBackChannelRecipe()) {
    return {
      value,
      label,
      support: "NOT_PREPARED",
      rejectionCode: "groove_recipe_missing",
      rejectionMessage: "Spatele cu canal nu are încă o rețetă de prelucrare.",
    };
  }
  return { value, label, support: "SELECTABLE", rejectionCode: null, rejectionMessage: null };
}

export function presetEligibleFields(templateCode: string): readonly PresetEligibleField[] {
  const template = getProductTemplate(templateCode);
  if (!template) return [];
  const schema = getFormSchema(template.formSchemaId);
  if (!schema || schema.templateCode !== template.code) return [];
  return schema.sections.flatMap((section) =>
    section.fields.filter((field) => isPresetEligibleField(template, field)).map((field) => ({
      fieldId: field.id,
      label: field.label,
      componentId: field.componentId,
      options: (field.options ?? []).map((option) => optionSupport(field.id, option.value, option.label)),
    })),
  );
}

export function projectOrganizationPresetContract(templateCode: string): OrganizationPresetContract | null {
  const template = getProductTemplate(templateCode);
  if (!template) return null;
  return {
    schemaVersion: ORGANIZATION_PRESET_SCHEMA_VERSION,
    persistence: "ORGANIZATION_VERSIONED",
    canonicalWriter: {
      method: "POST",
      path: "/api/catalog/presets",
      permission: "owner",
    },
    templateCode: template.code,
    templateVersion: template.version,
    eligibleFields: presetEligibleFields(template.code),
    whereUsed: { available: false, reason: "no_request_reference_index" },
  };
}

function issue(code: PresetIssueCode, message: string, fieldId: string | null = null): PresetIssue {
  return { code, fieldId, message };
}

function validateSelections(
  templateCode: string,
  selections: readonly OrganizationPresetSelection[],
): { readonly ok: true; readonly selections: readonly OrganizationPresetSelection[] } | { readonly ok: false; readonly issues: readonly PresetIssue[] } {
  const template = getProductTemplate(templateCode);
  if (!template) {
    return { ok: false, issues: [issue("unknown_template", "Produsul platformei nu este cunoscut.")] };
  }
  const eligible = presetEligibleFields(template.code);
  const issues: PresetIssue[] = [];
  const seen = new Set<string>();
  const normalized: OrganizationPresetSelection[] = [];
  for (const selection of selections) {
    if (seen.has(selection.fieldId)) {
      issues.push(issue("duplicate_field", "Opțiunea este aleasă de două ori.", selection.fieldId));
      continue;
    }
    seen.add(selection.fieldId);
    const field = eligible.find((item) => item.fieldId === selection.fieldId);
    if (!field) {
      issues.push(issue("not_preset_eligible", "Această valoare rămâne pe lucrare sau este fixă pe platformă.", selection.fieldId));
      continue;
    }
    const option = field.options.find((item) => item.value === selection.value);
    if (!option) {
      issues.push(issue("unknown_option", "Opțiunea nu există pe schema produsului.", selection.fieldId));
      continue;
    }
    if (option.support !== "SELECTABLE") {
      issues.push(issue("option_not_prepared", option.rejectionMessage ?? "Opțiunea nu este pregătită.", selection.fieldId));
      continue;
    }
    normalized.push({ fieldId: selection.fieldId, value: selection.value });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, selections: normalized };
}

export function planOrganizationPresetRevision(input: {
  readonly actorRole: "owner" | "member";
  readonly organizationId: string;
  readonly presetId: string;
  readonly expectedRevision: number | null;
  readonly existing: OrganizationPresetRevision | null;
  readonly name: string;
  readonly description: string;
  readonly templateCode: string;
  readonly selections: readonly OrganizationPresetSelection[];
  readonly lifecycle: OrganizationPresetLifecycle;
}): OrganizationPresetPlan {
  if (input.actorRole !== "owner") {
    return { ok: false, issues: [issue("member_cannot_change", "Doar proprietarul poate schimba o variantă.")] };
  }
  if (!PRESET_ID_PATTERN.test(input.presetId)) {
    return { ok: false, issues: [issue("invalid_preset_id", "Identitatea variantei nu este validă.")] };
  }
  if (!ORGANIZATION_PRESET_LIFECYCLES.includes(input.lifecycle)) {
    return { ok: false, issues: [issue("invalid_lifecycle", "Starea variantei nu este recunoscută.")] };
  }
  const name = input.name.trim();
  const description = input.description.trim();
  const issues: PresetIssue[] = [];
  if (!name) issues.push(issue("empty_name", "Varianta are nevoie de un nume."));
  if (name.length > PRESET_NAME_MAX_LENGTH) issues.push(issue("name_too_long", "Numele variantei este prea lung."));
  if (description.length > PRESET_DESCRIPTION_MAX_LENGTH) issues.push(issue("description_too_long", "Descrierea variantei este prea lungă."));
  if (input.existing && input.existing.organizationId !== input.organizationId) {
    issues.push(issue("organization_mismatch", "Varianta aparține altei organizații."));
  }
  if (input.existing && input.existing.presetId !== input.presetId) {
    issues.push(issue("invalid_preset_id", "Revizia nu corespunde variantei indicate."));
  }
  if (input.existing?.lifecycle === "RETIRED") {
    issues.push(issue("retired_is_closed", "O variantă retrasă nu se redeschide."));
  }
  if (!input.existing && input.lifecycle === "RETIRED") {
    issues.push(issue("retired_is_closed", "O variantă nouă nu pornește retrasă."));
  }
  if (!input.existing && input.expectedRevision !== null) {
    issues.push(issue("revision_conflict", "Varianta nu are încă o revizie."));
  }
  if (input.existing && input.expectedRevision !== input.existing.revision) {
    issues.push(issue("revision_conflict", "Revizia variantei s-a schimbat între timp."));
  }
  const template = getProductTemplate(input.templateCode);
  if (!template) {
    issues.push(issue("unknown_template", "Produsul platformei nu este cunoscut."));
  } else if (input.existing && input.existing.templateCode !== template.code) {
    issues.push(issue("unknown_template", "Varianta nu poate schimba produsul platformei."));
  } else if (input.lifecycle !== "RETIRED" && input.existing && input.existing.templateVersion !== template.version) {
    issues.push(issue("template_version_mismatch", "Definiția platformei s-a schimbat. Varianta veche rămâne neschimbată."));
  }
  if (issues.length > 0) return { ok: false, issues };

  const retiring = input.lifecycle === "RETIRED";
  const selections = retiring && input.existing
    ? input.existing.selections.map((item) => ({ fieldId: item.fieldId, value: item.value }))
    : input.selections;
  if (retiring && input.existing) {
    const same = input.selections.length === input.existing.selections.length
      && input.existing.selections.every((item, index) => item.fieldId === input.selections[index]?.fieldId && item.value === input.selections[index]?.value);
    if (!same) {
      return { ok: false, issues: [issue("retired_selections_frozen", "Retragerea nu schimbă opțiunile variantei.")] };
    }
  }
  const checked = validateSelections(input.templateCode, selections);
  if (!checked.ok) return checked;
  if (input.lifecycle === "PUBLISHED" && checked.selections.length === 0) {
    return { ok: false, issues: [issue("published_requires_selection", "O variantă publicată alege cel puțin o opțiune suportată.")] };
  }
  const boundTemplate = template;
  if (!boundTemplate) {
    return { ok: false, issues: [issue("unknown_template", "Produsul platformei nu este cunoscut.")] };
  }
  return {
    ok: true,
    revision: {
      schemaVersion: ORGANIZATION_PRESET_SCHEMA_VERSION,
      presetId: input.presetId,
      organizationId: input.organizationId,
      templateCode: boundTemplate.code,
      templateVersion: retiring && input.existing ? input.existing.templateVersion : boundTemplate.version,
      revision: input.existing ? input.existing.revision + 1 : 1,
      name,
      description,
      lifecycle: input.lifecycle,
      selections: checked.selections,
      supersedesRevision: input.existing ? input.existing.revision : null,
    },
  };
}

/** Publishing or retiring a preset does not rewrite an already accepted snapshot. */
export function acceptedSnapshotAfterPresetChange<T>(snapshot: T): T {
  return snapshot;
}

/** Copies only the preset selections onto a request draft. Other keys stay as they are. */
export function mergePresetSelectionsIntoDraft<T extends Record<string, unknown>>(
  drafts: T,
  selections: readonly OrganizationPresetSelection[],
): T {
  const next = { ...drafts };
  for (const selection of selections) {
    (next as Record<string, unknown>)[selection.fieldId] = selection.value;
  }
  return next;
}

export function presetWhereUsed(): OrganizationPresetContract["whereUsed"] {
  return { available: false, reason: "no_request_reference_index" };
}
