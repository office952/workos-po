import { useEffect, useLayoutEffect, useRef } from "react";
import { clientHref, type ClientHubSection } from "../../../../routing/appRoute";
import { navigate } from "../../../../routing/navigate";

export type EntryAction = "incarca" | "adauga" | "modifica";

/** "Alte acțiuni" opens a section with its own action already started (`&actiune=…`). */
export function clientActionHref(customerId: string, section: ClientHubSection, action: EntryAction): string {
  const href = clientHref(customerId, section);
  return `${href}${href.includes("?") ? "&" : "?"}actiune=${action}`;
}

/**
 * The section starts the requested action once it knows it is allowed (the server permission),
 * then drops `actiune` from the address: a refresh or Back never reopens the form by itself.
 */
export function useEntryAction(search: string, action: EntryAction, allowed: boolean, run: () => void): void {
  const requested = new URLSearchParams(search).get("actiune") === action;
  const runRef = useRef(run);
  useLayoutEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    if (!requested || !allowed) return;
    runRef.current();
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("actiune")) return;
    url.searchParams.delete("actiune");
    navigate(`${url.pathname}${url.search}${url.hash}`, "replace");
  }, [requested, allowed]);
}
