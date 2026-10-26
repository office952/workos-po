import { useSyncExternalStore } from "react";

/**
 * What the current section has in view, for the folded phone header ("Istoric · 2021", Figma
 * 580:4114). The section writes it while it scrolls; the header only reads it. One value per
 * client, cleared when the section unmounts, so a client switch never shows another client's year.
 */
let current: { customerId: string; value: string } | null = null;
const listeners = new Set<() => void>();

export function setSectionDetail(customerId: string, value: string | null): void {
  const next = value ? { customerId, value } : null;
  if (current?.customerId === next?.customerId && current?.value === next?.value) return;
  if (!next && current && current.customerId !== customerId) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSectionDetail(customerId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (current?.customerId === customerId ? current.value : null),
    () => null,
  );
}
