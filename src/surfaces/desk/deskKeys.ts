import type { MouseEvent } from "react";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** A click on a link or control inside a row keeps its own meaning and does not select. */
export function clickedControl(event: MouseEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest("a, button, input, select, textarea"));
}

export function rowSelector(id: string): string {
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/"/g, '\\"');
  return `[data-row-id="${escaped}"]`;
}

export function focusRow(id: string): void {
  document.querySelector<HTMLElement>(rowSelector(id))?.focus();
}

/** Arrow keys move between rows of the same register and select the row reached. */
export function moveRowFocus(from: HTMLElement, delta: number, onSelect: (id: string) => void): void {
  const rows = Array.from(from.closest("[data-register]")?.querySelectorAll<HTMLElement>("[data-row-id]") ?? []);
  const next = rows[rows.indexOf(from) + delta];
  if (!next) return;
  next.focus();
  const id = next.dataset.rowId;
  if (id) onSelect(id);
}

export function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value).padStart(2, "0") : "—";
}
