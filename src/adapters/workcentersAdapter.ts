import { asRecord, asString, asStringList } from "./record";

export type WorkcenterAdminLifecycle = "ACTIVE" | "PLANNED" | "RETIRED";
export type ProviderCoverage = "COVERED" | "PROVIDER_PLANNED" | "NO_PROVIDER";

export type WorkcenterAdminCapabilityOption = {
  id: string;
  label: string;
};

export type WorkcenterAdminMachine = {
  id: string;
  label: string;
  description: string;
  workcenterId: string;
  workcenterLabel: string;
  lifecycle: WorkcenterAdminLifecycle;
  lifecycleLabel: string;
  capabilityIds: string[];
  capabilityLabels: string[];
};

export type WorkcenterAdminWorkcenter = {
  id: string;
  label: string;
  description: string;
  lifecycle: WorkcenterAdminLifecycle;
  lifecycleLabel: string;
  capabilityIds: string[];
  capabilityLabels: string[];
  machineLabels: string[];
};

export type WorkcenterAdminCoverage = {
  label: string;
  coverage: ProviderCoverage;
  coverageLabel: string;
  providerLabels: string[];
};

export type WorkcentersAdminTransport = {
  canEdit: boolean;
  workcenters: WorkcenterAdminWorkcenter[];
  machines: WorkcenterAdminMachine[];
  capabilities: WorkcenterAdminCapabilityOption[];
  coverage: WorkcenterAdminCoverage[];
};

function presentLifecycle(value: unknown): WorkcenterAdminLifecycle | null {
  if (value === "ACTIVE" || value === "PLANNED" || value === "RETIRED") {
    return value;
  }
  return null;
}

function presentWorkcenter(value: unknown): WorkcenterAdminWorkcenter | null {
  const row = asRecord(value);
  const id = asString(row?.id);
  const label = asString(row?.label);
  const lifecycle = presentLifecycle(row?.lifecycle);
  if (!row || !id || !label || !lifecycle) {
    return null;
  }
  return {
    id,
    label,
    description: asString(row.description) ?? "",
    lifecycle,
    lifecycleLabel:
      asString(row.lifecycleLabel) ??
      (lifecycle === "RETIRED" ? "Retras" : lifecycle === "PLANNED" ? "Planificat" : "Activ"),
    capabilityIds: asStringList(row.capabilityIds),
    capabilityLabels: asStringList(row.capabilityLabels),
    machineLabels: asStringList(row.machineLabels),
  };
}

function presentMachine(value: unknown): WorkcenterAdminMachine | null {
  const row = asRecord(value);
  const id = asString(row?.id);
  const label = asString(row?.label);
  const workcenterId = asString(row?.workcenterId);
  const lifecycle = presentLifecycle(row?.lifecycle);
  if (!row || !id || !label || !workcenterId || !lifecycle) {
    return null;
  }
  return {
    id,
    label,
    description: asString(row.description) ?? "",
    workcenterId,
    workcenterLabel: asString(row.workcenterLabel) ?? "",
    lifecycle,
    lifecycleLabel:
      asString(row.lifecycleLabel) ??
      (lifecycle === "RETIRED" ? "Retras" : lifecycle === "PLANNED" ? "Planificat" : "Activ"),
    capabilityIds: asStringList(row.capabilityIds),
    capabilityLabels: asStringList(row.capabilityLabels),
  };
}

function presentCoverage(value: unknown): WorkcenterAdminCoverage | null {
  const row = asRecord(value);
  const label = asString(row?.label);
  const coverage =
    row?.coverage === "COVERED" ||
    row?.coverage === "PROVIDER_PLANNED" ||
    row?.coverage === "NO_PROVIDER"
      ? row.coverage
      : null;
  if (!row || !label || !coverage) {
    return null;
  }
  const providers = Array.isArray(row.providers)
    ? row.providers.flatMap((item) => {
        const provider = asRecord(item);
        const providerLabel = asString(provider?.label);
        return providerLabel ? [providerLabel] : [];
      })
    : [];
  return {
    label,
    coverage,
    coverageLabel:
      asString(row.coverageLabel) ??
      (coverage === "COVERED"
        ? "Acoperită"
        : coverage === "PROVIDER_PLANNED"
          ? "Furnizor planificat"
          : "Fără furnizor"),
    providerLabels: providers,
  };
}

export function presentWorkcentersAdmin(payload: unknown): WorkcentersAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const workcenters = Array.isArray(record.workcenters)
    ? record.workcenters.flatMap((item) => {
        const workcenter = presentWorkcenter(item);
        return workcenter ? [workcenter] : [];
      })
    : [];
  const machines = Array.isArray(record.machines)
    ? record.machines.flatMap((item) => {
        const machine = presentMachine(item);
        return machine ? [machine] : [];
      })
    : [];
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.flatMap((item) => {
        const row = asRecord(item);
        const id = asString(row?.id);
        const label = asString(row?.label);
        return id && label ? [{ id, label }] : [];
      })
    : [];
  const coverage = Array.isArray(record.capabilities)
    ? record.capabilities.flatMap((item) => {
        const row = presentCoverage(item);
        return row ? [row] : [];
      })
    : [];
  return {
    canEdit: record.canEdit === true,
    workcenters,
    machines,
    capabilities,
    coverage,
  };
}
