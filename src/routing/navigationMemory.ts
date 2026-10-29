/**
 * Per-entry navigation memory. Every history entry carries a key; the window scroll and the
 * scroll of regions marked `data-scroll-memory` are remembered for that key while the user
 * reads. Back/Forward and refresh restore them, with focus on the control that led away; a push
 * to another page starts at the top with focus on the page title (and brings the element marked
 * `data-arrival-target` into view); a change of section on the same page starts at that section,
 * whether it pushed or replaced the entry.
 */

type Snapshot = { y: number; areas: Record<string, number>; focus?: string };
type Arrival =
  | { kind: "pop"; key: string }
  | { kind: "push"; pathChanged: boolean; sectionChanged: boolean }
  | { kind: "replace"; sectionChanged: boolean };

const STORAGE_KEY = "workos.navigation.scroll.v1";
const MAX_ENTRIES = 60;
const RESTORE_WINDOW_MS = 1500;

let snapshots: Map<string, Snapshot> | null = null;
let arrival: Arrival | null = null;
let tracking = false;

function store(): Map<string, Snapshot> {
  if (snapshots) return snapshots;
  snapshots = new Map();
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (Array.isArray(entry) && typeof entry[0] === "string" && entry[1] && typeof entry[1].y === "number") {
          const focus = typeof entry[1].focus === "string" ? entry[1].focus : undefined;
          snapshots.set(entry[0], { y: entry[1].y, areas: { ...(entry[1].areas ?? {}) }, ...(focus ? { focus } : {}) });
        }
      }
    }
  } catch {
    // A damaged memory only loses positions; navigation keeps working.
  }
  return snapshots;
}

function persist(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const entries = [...store().entries()].slice(-MAX_ENTRIES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: positions stay in memory for this tab.
  }
}

function newKey(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function stateKey(state: unknown): string | null {
  if (state && typeof state === "object" && typeof (state as { workosKey?: unknown }).workosKey === "string") {
    return (state as { workosKey: string }).workosKey;
  }
  return null;
}

/** The key of the current entry; an entry without one (first load, external link) gets one. */
export function currentEntryKey(): string {
  const existing = stateKey(window.history.state);
  if (existing) return existing;
  const key = newKey();
  const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
  window.history.replaceState({ ...state, workosKey: key, workosIndex: entryIndex(state) ?? 0 }, "");
  return key;
}

/**
 * The position of an entry among those this tab created (first entry 0, each push +1). It lets
 * a held Back/Forward be undone and repeated exactly; entries without it return null.
 */
export function entryIndex(state: unknown): number | null {
  if (state && typeof state === "object" && typeof (state as { workosIndex?: unknown }).workosIndex === "number") {
    return (state as { workosIndex: number }).workosIndex;
  }
  return null;
}

function currentIndex(): number {
  currentEntryKey();
  return entryIndex(window.history.state) ?? 0;
}

function readAreas(): Record<string, number> {
  const areas: Record<string, number> = {};
  document.querySelectorAll<HTMLElement>("[data-scroll-memory]").forEach((element) => {
    const name = element.dataset.scrollMemory;
    if (name) areas[name] = element.scrollTop;
  });
  return areas;
}

/**
 * A selector for the control that has focus, when it can be found again after a re-render: a
 * register row by its id, a link by its href. Anything else is not remembered.
 */
function focusDescriptor(): string | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return undefined;
  const row = active.dataset.rowId;
  if (row) return `[data-row-id="${CSS.escape(row)}"]`;
  const href = active instanceof HTMLAnchorElement ? active.getAttribute("href") : null;
  if (href) return `a[href="${CSS.escape(href)}"]`;
  return undefined;
}

/** Saves the position of the entry the user is leaving or reading; leaving also saves focus. */
export function rememberCurrentEntry(leaving = false): void {
  const key = currentEntryKey();
  const focus = leaving ? focusDescriptor() : store().get(key)?.focus;
  store().set(key, { y: window.scrollY, areas: readAreas(), ...(focus ? { focus } : {}) });
  persist();
}

function sectionOf(search: string): string | null {
  return new URLSearchParams(search).get("sectiune");
}

/** Called by `navigate` before the URL changes. */
export function prepareNavigation(next: string, mode: "push" | "replace"): Record<string, unknown> {
  rememberCurrentEntry(mode === "push");
  if (mode === "replace") {
    arrival = { kind: "replace", sectionChanged: sectionOf(new URL(next, window.location.origin).search) !== sectionOf(window.location.search) };
    const state = window.history.state as Record<string, unknown> | null;
    const origin = typeof state?.workosFrom === "string" && new URL(next, window.location.origin).pathname === window.location.pathname
      ? { workosFrom: state.workosFrom, workosFromIndex: state.workosFromIndex }
      : {};
    return { workosKey: currentEntryKey(), workosIndex: currentIndex(), ...origin };
  }
  const target = new URL(next, window.location.origin);
  arrival = {
    kind: "push",
    pathChanged: target.pathname !== window.location.pathname,
    sectionChanged: sectionOf(target.search) !== sectionOf(window.location.search),
  };
  // N-018 · where the reader came from: kept across pushes inside the same page (sections,
  // previews), so a page can offer "← <origin>" and return to that exact entry.
  const state = window.history.state as Record<string, unknown> | null;
  const samePage = target.pathname === window.location.pathname;
  const origin = samePage && typeof state?.workosFrom === "string"
    ? { workosFrom: state.workosFrom, workosFromIndex: state.workosFromIndex }
    : { workosFrom: `${window.location.pathname}${window.location.search}`, workosFromIndex: currentIndex() };
  return { workosKey: newKey(), workosIndex: currentIndex() + 1, ...origin };
}

/** Only a path of this application: one leading slash, same origin, no scheme, host or backslash. */
export function isInternalHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return false;
  try {
    return new URL(href, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** The in-app entry this page was opened from, with how many steps back it is; null after a direct link. */
export function entryOrigin(): { href: string; steps: number } | null {
  const state = window.history.state as Record<string, unknown> | null;
  const index = entryIndex(state);
  if (!state || typeof state.workosFrom !== "string" || typeof state.workosFromIndex !== "number" || index === null) return null;
  if (!isInternalHref(state.workosFrom)) return null;
  const steps = index - state.workosFromIndex;
  return steps > 0 && steps < window.history.length ? { href: state.workosFrom, steps } : null;
}

/** Called for browser Back/Forward (a real popstate, not the one `navigate` dispatches). */
export function notePopNavigation(): void {
  arrival = { kind: "pop", key: currentEntryKey() };
}

export function isNavigateDispatch(event: PopStateEvent): boolean {
  return (event as PopStateEvent & { workosNavigate?: boolean }).workosNavigate === true;
}

function focusPageTitle(): void {
  const main = document.getElementById("continut-principal");
  const title = main?.querySelector<HTMLElement>("h1") ?? main ?? null;
  if (!title) return;
  if (title !== main && !title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
}

function focusRemembered(selector: string | undefined): boolean {
  if (!selector) return true;
  let target: HTMLElement | null;
  try {
    target = document.querySelector<HTMLElement>(`#continut-principal ${selector}`) ?? document.querySelector<HTMLElement>(selector);
  } catch {
    return true;
  }
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

function restore(snapshot: Snapshot): void {
  const started = Date.now();
  let focused = false;
  const step = () => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(snapshot.y, maxY));
    let pending = snapshot.y > maxY;
    for (const [name, top] of Object.entries(snapshot.areas)) {
      const element = document.querySelector<HTMLElement>(`[data-scroll-memory="${CSS.escape(name)}"]`);
      if (!element) {
        pending = true;
        continue;
      }
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.min(top, maxTop);
      if (top > maxTop) pending = true;
    }
    if (!focused) focused = focusRemembered(snapshot.focus);
    // Content that is still loading cannot hold the old position (or the control) yet: retry briefly.
    if ((pending || !focused) && Date.now() - started < RESTORE_WINDOW_MS) window.requestAnimationFrame(step);
    else if (!focused) focusPageTitle();
  };
  step();
}

/**
 * After a push, a page may name the one element the reader expects to see (the selected row of a
 * register opened from elsewhere). It is brought into view once it has rendered; focus stays on
 * the title.
 */
function revealArrivalTarget(): void {
  const started = Date.now();
  const step = () => {
    const target = document.querySelector<HTMLElement>("[data-arrival-target]");
    if (target) {
      target.scrollIntoView?.({ block: "center", inline: "nearest" });
      return;
    }
    if (Date.now() - started < RESTORE_WINDOW_MS) window.requestAnimationFrame(step);
  };
  step();
}

/**
 * A sticky bar placed immediately after the section entry covers `top` pixels of the viewport
 * (the client band sticks below the application bar). A bar that sticks at 0, as on the job
 * sheet, adds nothing. The entry itself must not be the sticky bar: once stuck, its visual top
 * is the stick line and no longer the place the section starts.
 */
function stickyInsetAfter(anchor: HTMLElement): number {
  const next = anchor.nextElementSibling;
  if (!(next instanceof HTMLElement)) return 0;
  const style = getComputedStyle(next);
  if (style.position !== "sticky" && style.position !== "fixed") return 0;
  const inset = Number.parseFloat(style.top);
  return Number.isFinite(inset) && inset > 0 ? inset : 0;
}

function settleSection(): void {
  const anchor = document.querySelector<HTMLElement>("[data-section-top]");
  const top = anchor ? Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - stickyInsetAfter(anchor)) : 0;
  if (window.scrollY > top) window.scrollTo(0, top);
  document.querySelectorAll<HTMLElement>("[data-scroll-memory]").forEach((element) => {
    if (element.dataset.scrollMemory?.startsWith("sectiune")) element.scrollTop = 0;
  });
}

/**
 * Applies the arrival rule after the new location rendered. Pop: restore. Push to another
 * page: top and title focus. Push to another section of the same page: that section's top,
 * below a sticky bar that follows the entry.
 */
export function settleArrival(): void {
  const current = arrival;
  arrival = null;
  if (!current) {
    // First render or refresh: the browser kept the entry key; restore if we know it. A refresh
    // keeps the reader where they were; focus stays where the page puts it.
    const snapshot = store().get(currentEntryKey());
    if (snapshot) restore({ y: snapshot.y, areas: snapshot.areas });
    else revealArrivalTarget();
    return;
  }
  if (current.kind === "pop") {
    const snapshot = store().get(current.key);
    if (snapshot) restore(snapshot);
    else window.scrollTo(0, 0);
    return;
  }
  if (current.kind === "push" && current.pathChanged) {
    window.scrollTo(0, 0);
    focusPageTitle();
    revealArrivalTarget();
    return;
  }
  if (current.sectionChanged) settleSection();
}

/** Keeps the position of the entry being read up to date, so Back always has it. */
export function trackScrollPositions(): () => void {
  if (tracking) return () => undefined;
  tracking = true;
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      rememberCurrentEntry();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  return () => {
    tracking = false;
    window.removeEventListener("scroll", onScroll, { capture: true });
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/** Test seam: forget everything. */
export function resetNavigationMemory(): void {
  snapshots = new Map();
  arrival = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
