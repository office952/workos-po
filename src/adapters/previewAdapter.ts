import { presentFormSchema } from "./formSchemaAdapter";
import type {
  ConfigurationReadiness,
  InstallationTransport,
  MissingFact,
  PresentedComponent,
  PreviewTransport,
} from "../api/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function presentReadiness(value: unknown): ConfigurationReadiness | null {
  if (value === "ready" || value === "blocked") {
    return value;
  }
  return null;
}

function presentMissing(value: unknown): MissingFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record || typeof record.label !== "string") {
      return [];
    }
    return [
      {
        label: record.label,
        fieldId: typeof record.fieldId === "string" ? record.fieldId : undefined,
      },
    ];
  });
}

function presentInstallation(value: unknown): InstallationTransport {
  const record = asRecord(value);
  if (!record) {
    return { selected: false, prequoteReady: false, incompleteReasons: [] };
  }

  return {
    selected: record.selected === true,
    prequoteReady:
      record.prequoteReady === true
        ? true
        : record.prequoteReady === false
          ? false
          : null,
    incompleteReasons: Array.isArray(record.incompleteReasons)
      ? record.incompleteReasons.filter((reason) => typeof reason === "string")
      : [],
  };
}

function presentProductCode(product: Record<string, unknown>): string | null {
  if (typeof product.code === "string") {
    return product.code;
  }
  if (typeof product.productCode === "string") {
    return product.productCode;
  }
  return null;
}

function presentComponents(value: unknown): PresentedComponent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [{ id: item, label: item }];
    }
    const record = asRecord(item);
    if (!record || typeof record.id !== "string") {
      return [];
    }
    return [
      {
        id: record.id,
        label: typeof record.label === "string" ? record.label : record.id,
      },
    ];
  });
}

export function presentPreview(payload: unknown): PreviewTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const product = asRecord(record.product);
  const readiness = presentReadiness(record.readiness);
  const code = product ? presentProductCode(product) : null;
  if (!product || !code || typeof product.label !== "string" || readiness === null) {
    return null;
  }

  return {
    product: {
      code,
      label: product.label,
    },
    values:
      asRecord(record.values) !== null
        ? (record.values as PreviewTransport["values"])
        : {},
    formSchema: presentFormSchema(record.formSchema),
    selectedComponents: presentComponents(record.selectedComponents),
    readiness,
    missing: presentMissing(record.missing),
    reviewId: typeof record.reviewId === "string" ? record.reviewId : null,
    installation: presentInstallation(record.installation),
  };
}
