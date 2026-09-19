export type ResourceStatus = "idle" | "loading" | "success" | "error";

export type ResourceSnapshot<T> = {
  status: ResourceStatus;
  data: T | undefined;
  error: unknown;
  updatedAt: number | null;
};

export const RESOURCE_STALE_MS = 30_000;

const idleSnapshot: ResourceSnapshot<never> = {
  status: "idle",
  data: undefined,
  error: null,
  updatedAt: null,
};

type CacheEntry = {
  snapshot: ResourceSnapshot<unknown>;
  inflight: Promise<unknown> | null;
  fetcher: (() => Promise<unknown>) | null;
  generation: number;
  listeners: Set<() => void>;
};

const entries = new Map<string, CacheEntry>();

function snapshotOf<T>(entry: CacheEntry | undefined): ResourceSnapshot<T> {
  if (!entry) {
    return idleSnapshot;
  }
  return entry.snapshot as ResourceSnapshot<T>;
}

function ensureEntry(key: string): CacheEntry {
  const existing = entries.get(key);
  if (existing) {
    return existing;
  }
  const created: CacheEntry = {
    snapshot: { ...idleSnapshot },
    inflight: null,
    fetcher: null,
    generation: 0,
    listeners: new Set(),
  };
  entries.set(key, created);
  return created;
}

function notify(entry: CacheEntry): void {
  for (const listener of [...entry.listeners]) {
    listener();
  }
}

function ageMs(entry: CacheEntry): number {
  if (entry.snapshot.updatedAt === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - entry.snapshot.updatedAt;
}

export function readResource<T>(key: string): ResourceSnapshot<T> {
  return snapshotOf<T>(entries.get(key));
}

export function subscribeResource(key: string, listener: () => void): () => void {
  const entry = ensureEntry(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function writeResource<T>(key: string, data: T): void {
  const entry = ensureEntry(key);
  entry.snapshot = {
    status: "success",
    data,
    error: null,
    updatedAt: Date.now(),
  };
  notify(entry);
}

export async function loadResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { staleMs?: number; force?: boolean },
): Promise<T> {
  const staleMs = options?.staleMs ?? RESOURCE_STALE_MS;
  const entry = ensureEntry(key);
  entry.fetcher = fetcher;

  if (options?.force && entry.inflight) {
    entry.generation += 1;
    entry.inflight = null;
  }

  if (entry.inflight && !options?.force) {
    return entry.inflight as Promise<T>;
  }

  if (
    !options?.force &&
    entry.snapshot.status === "success" &&
    ageMs(entry) < staleMs
  ) {
    return entry.snapshot.data as T;
  }

  const generation = entry.generation + 1;
  entry.generation = generation;
  if (entry.snapshot.status !== "success") {
    entry.snapshot = {
      ...entry.snapshot,
      status: "loading",
    };
    notify(entry);
  }

  const request = fetcher()
    .then((data) => {
      if (entry.generation !== generation) {
        return data;
      }
      entry.snapshot = {
        status: "success",
        data,
        error: null,
        updatedAt: Date.now(),
      };
      entry.inflight = null;
      notify(entry);
      return data;
    })
    .catch((error: unknown) => {
      if (entry.generation !== generation) {
        throw error;
      }
      entry.snapshot = {
        status: "error",
        data: entry.snapshot.data,
        error,
        updatedAt: Date.now(),
      };
      entry.inflight = null;
      notify(entry);
      throw error;
    });

  entry.inflight = request;
  return request;
}

function markStale(entry: CacheEntry): void {
  entry.generation += 1;
  entry.inflight = null;
  entry.snapshot = {
    ...entry.snapshot,
    updatedAt: null,
    status:
      entry.snapshot.data !== undefined && entry.snapshot.status === "success"
        ? "success"
        : entry.snapshot.status === "error"
          ? "error"
          : "idle",
  };
}

function refreshIfObserved(key: string, entry: CacheEntry): void {
  if (entry.listeners.size === 0 || !entry.fetcher) {
    notify(entry);
    return;
  }
  void loadResource(key, entry.fetcher, { force: true }).catch(() => {
    // Error remains on the snapshot for subscribers.
  });
}

export function invalidateResources(...keys: string[]): void {
  for (const key of keys) {
    const entry = entries.get(key);
    if (!entry) {
      continue;
    }
    markStale(entry);
    refreshIfObserved(key, entry);
  }
}

export function invalidateResourcePrefix(prefix: string): void {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    markStale(entry);
    refreshIfObserved(key, entry);
  }
}

export function resetResourceCache(): void {
  for (const entry of entries.values()) {
    entry.generation += 1;
    entry.inflight = null;
    entry.fetcher = null;
    entry.listeners.clear();
  }
  entries.clear();
}

export function hasUsableData<T>(snapshot: ResourceSnapshot<T>): boolean {
  return snapshot.data !== undefined;
}

export function isPendingSnapshot<T>(snapshot: ResourceSnapshot<T>): boolean {
  return snapshot.status === "idle" || snapshot.status === "loading";
}
