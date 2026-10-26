import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clientHref } from "../../../routing/appRoute";
import { navigate } from "../../../routing/navigate";
import { readRegistryMemory, writeRegistryMemory } from "../../../session/registryMemory";
import { CLIENT_DOCUMENTS_MEMORY_KEY, CLIENT_HISTORY_MEMORY_KEY, CLIENT_PHOTOS_MEMORY_KEY, CLIENT_REQUESTS_MEMORY_KEY, CLIENT_WORKS_MEMORY_KEY } from "../../../session/registryMemoryKeys";

/**
 * N-020 · the search context of a client list section (Istoric, Lucrări, Fotografii, Documente,
 * Cereri și oferte): text, kind, year, site, state, provenance, photo stage, attachment, selection,
 * attention only and page. The URL carries it (`?sectiune=…&q=…&tip=…&an=…&sediu=…&stare=…&
 * provenienta=…&etapa=…&legat=…&selectie=…&atentie=…&pagina=…`), so a
 * direct link, a refresh and Back/Forward read it back. The per-tab register memory keeps the last
 * context of each client and section, so leaving the section and coming back (through its tab or a
 * link without parameters) restores it. Changes replace the current history entry, like the tabs.
 */
export type ListSection = "istoric" | "lucrari" | "fotografii" | "documente" | "cereri";
export type ListContext = { q: string; kind: string; year: string; site: string; state: string; provenance: string; stage: string; linked: string; selection: string; attention: string; page: number };

export const EMPTY_LIST_CONTEXT: ListContext = { q: "", kind: "", year: "", site: "", state: "", provenance: "", stage: "", linked: "", selection: "", attention: "", page: 1 };

/** The entry shown expanded in Istoric; kept in the URL so Back and refresh reopen it. */
export const EXPANDED_PARAM = "deschis";

const PARAMS = { q: "q", kind: "tip", year: "an", site: "sediu", state: "stare", provenance: "provenienta", stage: "etapa", linked: "legat", selection: "selectie", attention: "atentie", page: "pagina" } as const;
const MEMORY_KEYS: Record<ListSection, string> = {
  istoric: CLIENT_HISTORY_MEMORY_KEY,
  lucrari: CLIENT_WORKS_MEMORY_KEY,
  fotografii: CLIENT_PHOTOS_MEMORY_KEY,
  documente: CLIENT_DOCUMENTS_MEMORY_KEY,
  cereri: CLIENT_REQUESTS_MEMORY_KEY,
};

function clean(context: Partial<ListContext>): ListContext {
  const page = Number(context.page);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    q: text(context.q).slice(0, 120),
    kind: text(context.kind),
    year: text(context.year),
    site: text(context.site),
    state: text(context.state),
    provenance: text(context.provenance),
    stage: text(context.stage),
    linked: text(context.linked),
    selection: text(context.selection),
    attention: text(context.attention),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function isEmptyListContext(context: ListContext): boolean {
  return !context.q && !context.kind && !context.year && !context.site && !context.state && !context.provenance && !context.stage && !context.linked && !context.selection && !context.attention && context.page === 1;
}

/** The context written in the URL, or null when the URL names none of its parameters. */
export function readListContextFromSearch(search: string): ListContext | null {
  const params = new URLSearchParams(search);
  // An expanded entry (`deschis=…`) is part of an explicit context too: never replaced by memory.
  if (!Object.values(PARAMS).some((name) => params.has(name)) && !params.has(EXPANDED_PARAM)) return null;
  return clean({
    q: params.get(PARAMS.q) ?? "",
    kind: params.get(PARAMS.kind) ?? "",
    year: params.get(PARAMS.year) ?? "",
    site: params.get(PARAMS.site) ?? "",
    state: params.get(PARAMS.state) ?? "",
    provenance: params.get(PARAMS.provenance) ?? "",
    stage: params.get(PARAMS.stage) ?? "",
    linked: params.get(PARAMS.linked) ?? "",
    selection: params.get(PARAMS.selection) ?? "",
    attention: params.get(PARAMS.attention) ?? "",
    page: Number(params.get(PARAMS.page) ?? "1"),
  });
}

export function clientListHref(customerId: string, section: ListSection, context: ListContext, extra: Record<string, string> = {}): string {
  const base = clientHref(customerId, section);
  const params = new URLSearchParams();
  if (context.q) params.set(PARAMS.q, context.q);
  if (context.kind) params.set(PARAMS.kind, context.kind);
  if (context.year) params.set(PARAMS.year, context.year);
  if (context.site) params.set(PARAMS.site, context.site);
  if (context.state) params.set(PARAMS.state, context.state);
  if (context.provenance) params.set(PARAMS.provenance, context.provenance);
  if (context.stage) params.set(PARAMS.stage, context.stage);
  if (context.linked) params.set(PARAMS.linked, context.linked);
  if (context.selection) params.set(PARAMS.selection, context.selection);
  if (context.attention) params.set(PARAMS.attention, context.attention);
  if (context.page > 1) params.set(PARAMS.page, String(context.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
}

export function readClientListMemory(customerId: string, section: ListSection): ListContext {
  const all = readRegistryMemory<Record<string, unknown>>(MEMORY_KEYS[section], {}, (value) => value);
  const own = all[customerId];
  return own && typeof own === "object" ? clean(own as Partial<ListContext>) : EMPTY_LIST_CONTEXT;
}

export function writeClientListMemory(customerId: string, section: ListSection, context: ListContext): void {
  const all = readRegistryMemory<Record<string, unknown>>(MEMORY_KEYS[section], {}, (value) => value);
  const next = { ...all };
  if (isEmptyListContext(context)) delete next[customerId];
  else next[customerId] = context;
  writeRegistryMemory(MEMORY_KEYS[section], next);
}

/** The href of a section tab: the list section reopens with this client's last context. */
export function clientSectionHref(customerId: string, section: ListSection): string {
  return clientListHref(customerId, section, readClientListMemory(customerId, section));
}

/**
 * One list context for a section: read from the URL (or restored from memory), with a debounced
 * text field. `apply` is a manual change (back to page 1 unless the patch names a page).
 */
export function useClientListContext(customerId: string, section: ListSection, search: string) {
  // A record opened from the list (`lucrare=…`, a request previewed over Cereri și oferte with
  // `cerere=…`, a document open in the viewer with `document=…`) carries the list context in its
  // URL; it never restores or overwrites the remembered context — a direct link to a document
  // opens that document, whatever the list remembered.
  const params = new URLSearchParams(search);
  const detail = params.has("lucrare") || params.has("cerere") || params.has("document") || params.has("fotografie");
  const fromUrl = readListContextFromSearch(search) ?? (detail ? EMPTY_LIST_CONTEXT : null);
  const remembered = fromUrl ? null : readClientListMemory(customerId, section);
  const context: ListContext = fromUrl ?? remembered ?? EMPTY_LIST_CONTEXT;
  const [text, setText] = useState(context.q);

  const contextKey = JSON.stringify(context);
  const restore = !fromUrl && remembered !== null && !isEmptyListContext(remembered);
  useEffect(() => {
    if (detail) return;
    const current = JSON.parse(contextKey) as ListContext;
    writeClientListMemory(customerId, section, current);
    // Restoring writes the remembered context back into the URL (replace: no extra history entry,
    // and the page stays as it was).
    if (restore) navigate(clientListHref(customerId, section, current), "replace");
  }, [customerId, section, contextKey, restore, detail]);

  // Back/Forward or a link can change the text from outside the field.
  const [syncedQ, setSyncedQ] = useState(context.q);
  if (syncedQ !== context.q) {
    setSyncedQ(context.q);
    setText(context.q);
  }

  // A manual change is the new context, not a return to the section: it is remembered before the
  // URL changes, so a reset to "no filters" (a URL without parameters) is not taken for a return
  // and the previous filters are not restored.
  const apply = (patch: Partial<ListContext>) => {
    const next = clean({ ...context, page: 1, ...patch });
    if (!detail) writeClientListMemory(customerId, section, next);
    navigate(clientListHref(customerId, section, next), "replace");
  };
  const applyRef = useRef(apply);
  useLayoutEffect(() => {
    applyRef.current = apply;
  });

  // The text filter waits for a pause in typing; the other filters apply at once.
  useEffect(() => {
    if (text === context.q) return;
    const timer = window.setTimeout(() => applyRef.current({ q: text }), 250);
    return () => window.clearTimeout(timer);
  }, [text, context.q]);

  const filtered = Boolean(context.q || context.kind || context.year || context.site || context.state || context.provenance || context.stage || context.linked || context.selection || context.attention);
  return { context, text, setText, apply, filtered };
}
