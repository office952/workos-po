import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  loadResource,
  readResource,
  subscribeResource,
  type ResourceSnapshot,
} from "./resourceCache";

const idleSnapshot: ResourceSnapshot<never> = {
  status: "idle",
  data: undefined,
  error: null,
  updatedAt: null,
};

export function useResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: { staleMs?: number },
): ResourceSnapshot<T> {
  const fetcherRef = useRef(fetcher);
  const staleMs = options?.staleMs;

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!key) {
        return () => {};
      }
      return subscribeResource(key, onStoreChange);
    },
    [key],
  );

  const getSnapshot = useCallback(
    () => (key ? readResource<T>(key) : idleSnapshot),
    [key],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => idleSnapshot);

  useEffect(() => {
    if (!key) {
      return;
    }
    void loadResource(key, () => fetcherRef.current(), { staleMs }).catch(() => {
      // Snapshot already carries the error.
    });
  }, [key, staleMs]);

  return snapshot;
}
