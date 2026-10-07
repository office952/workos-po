const STORAGE_KEY = "workos-po.clients-registry.v1";

export type ClientsRegistryMemory = {
  query: string;
  statusChip: string;
  selectedId: string | null;
};

const empty: ClientsRegistryMemory = {
  query: "",
  statusChip: "all",
  selectedId: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function readClientsRegistryMemory(): ClientsRegistryMemory {
  if (typeof sessionStorage === "undefined") {
    return empty;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return empty;
    }
    const record = asRecord(JSON.parse(raw));
    if (!record) {
      return empty;
    }
    return {
      query: typeof record.query === "string" ? record.query : "",
      statusChip: ["all", "attention", "ACTIVE", "RETIRED"].includes(String(record.statusChip))
        ? String(record.statusChip)
        : "all",
      selectedId: typeof record.selectedId === "string" && record.selectedId !== "" ? record.selectedId : null,
    };
  } catch {
    return empty;
  }
}

export function writeClientsRegistryMemory(next: ClientsRegistryMemory): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Registry preferences must not prevent reading customers.
  }
}

export function clearClientsRegistryMemory(): void {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Session isolation does not depend on preference storage being available.
    }
  }
}
