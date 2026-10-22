import { useEffect, useRef } from "react";
import { navigate } from "../../routing/navigate";
import { focusRow, isTypingTarget, rowSelector } from "./deskKeys";
import type { DeskLayout } from "./useDeskLayout";

type Options = {
  layout: DeskLayout;
  selectedId: string | null;
  /** Builds the register URL for a selection (null = no selection). */
  href: (id: string | null) => string;
  /** Ids in visible order, for previous/next. */
  order: readonly string[];
  searchRef: { current: HTMLInputElement | null };
  /**
   * Brings a row back into the rendered register (for example by turning to its page) and
   * says whether the row still exists in the data. Registers without pages can omit it.
   */
  reveal?: (id: string) => boolean;
};

/**
 * Selection lives in the URL. Docked, a row click replaces the entry (no history noise);
 * on tablet and phone the first open pushes, so Back closes the dossier. Closing restores
 * the context of the element that opened the dossier, then returns focus to it; if it left
 * the data, focus goes to the last selected row, the first row, or the search.
 */
export function useDeskSelection({ layout, selectedId, href, order, searchRef, reveal }: Options) {
  const pushedRef = useRef(false);
  const openerRef = useRef<string | null>(null);
  const previous = useRef(selectedId);
  const revealRef = useRef(reveal);
  const pendingFocus = useRef<string | null>(null);
  const dialogOpen = layout !== "docked" && selectedId !== null;

  useEffect(() => {
    revealRef.current = reveal;
  });

  useEffect(() => {
    const before = previous.current;
    previous.current = selectedId;
    if (selectedId) {
      pendingFocus.current = null;
      return;
    }
    pushedRef.current = false;
    if (!before || layout === "docked") return;
    const opener = openerRef.current ?? before;
    openerRef.current = null;
    const present = (id: string) => revealRef.current?.(id) ?? true;
    const target = [opener, before].find(present) ?? null;
    if (target) {
      pendingFocus.current = target;
      return;
    }
    const first = document.querySelector<HTMLElement>("[data-register] [data-row-id]");
    if (first) first.focus();
    else searchRef.current?.focus();
  }, [selectedId, layout, searchRef]);

  // Focus waits for the commit that renders the restored row (for example its page).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    if (document.querySelector(rowSelector(target))) {
      pendingFocus.current = null;
      focusRow(target);
    }
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || dialogOpen) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, searchRef]);

  const index = selectedId ? order.indexOf(selectedId) : -1;

  return {
    dialogOpen,
    index,
    select(id: string) {
      navigate(href(id), "replace");
    },
    open(id: string) {
      openerRef.current = id;
      if (!selectedId) {
        pushedRef.current = true;
        navigate(href(id), "push");
      } else {
        navigate(href(id), "replace");
      }
    },
    close() {
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      } else {
        navigate(href(null), "replace");
      }
    },
    clear() {
      navigate(href(null), "replace");
    },
    move(delta: number) {
      const next = order[index + delta];
      if (!next) return;
      navigate(href(next), "replace");
      if (layout === "docked" && document.activeElement?.closest("[data-register]")) focusRow(next);
    },
  };
}
