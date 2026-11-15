import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PageRegion } from "../layout/PageRegion";
import {
  administrationDomainOf,
  administrationDomains,
  type AdministrationNavItem,
  type AdministrationRailId,
} from "../layout/administrationNav";
import "../styles/surfaces/admin.css";

/**
 * R3 · Administration shell, variant B (WorkOS-N „13 · Administrare”).
 *
 * The global header stays the application's. Under it one bar: the way back to the hub, the domain
 * selector (a panel on desktop and tablet, a sheet on a phone), the tabs of the pages that share the
 * domain (desktop only) and the search over destinations. No permanent side menu.
 */
type AdminLayoutProps = {
  /** The destination this page is; null on the hub. */
  current: AdministrationRailId | null;
  title: string;
  lead?: string;
  /** One quiet line: active version and source, or who may change the values. */
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  /** Replaces „Administrare /” when the page was opened from another workspace (Catalog, Configurator). */
  returnLink?: { href: string; label: string };
  /** The unsaved-changes bar; kept at the bottom of the viewport while it exists. */
  changeBar?: ReactNode;
  children: ReactNode;
};

export function AdminLayout({
  current,
  title,
  lead,
  meta,
  status,
  action,
  returnLink,
  changeBar,
  children,
}: AdminLayoutProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const condensed = useHeadingOutOfView(headingRef);
  return (
    <PageRegion>
      <div className="adm" data-floorplan="admin-settings" data-admin-page={current ?? "hub"} data-has-change-bar={changeBar ? "true" : undefined}>
        <AdminBar current={current} title={title} condensed={condensed} returnLink={returnLink} />
        <div className="adm__page">
          <header className="adm-head">
            <div className="adm-head__copy">
              <h1 ref={headingRef} className="adm-head__title">{title}</h1>
              {lead ? <p className="adm-head__lead">{lead}</p> : null}
              {meta ? <p className="adm-head__meta">{meta}</p> : null}
            </div>
            {status != null || action != null ? (
              <div className="adm-head__aside">
                {status != null ? <div className="adm-head__status">{status}</div> : null}
                {action != null ? <div className="adm-head__action">{action}</div> : null}
              </div>
            ) : null}
          </header>
          <div className="adm__body">{children}</div>
        </div>
        {changeBar ? <div className="adm-change-dock">{changeBar}</div> : null}
      </div>
    </PageRegion>
  );
}

/** True once the page title has scrolled above the bar (the phone selector then names the page). */
function useHeadingOutOfView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOut(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return out;
}

type AdminBarProps = {
  current: AdministrationRailId | null;
  title: string;
  condensed: boolean;
  returnLink?: { href: string; label: string };
};

function AdminBar({ current, title, condensed, returnLink }: AdminBarProps) {
  const domain = current ? administrationDomainOf(current) : null;
  const tabs = domain ? domain.items.filter((item) => !item.external) : [];
  const [open, setOpen] = useState<null | "selector" | "search">(null);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function close(): void {
    const opener = open === "search" ? searchRef.current : selectorRef.current;
    setOpen(null);
    (opener ?? searchRef.current)?.focus();
  }

  return (
    <div className="adm-bar">
      <nav className="adm-bar__inner" aria-label="Administrare">
        {returnLink ? (
          <a className="adm-bar__crumb adm-bar__crumb--return" href={returnLink.href}>
            <span aria-hidden="true">← </span>
            {returnLink.label}
          </a>
        ) : current ? (
          <span className="adm-bar__trail">
            <a className="adm-bar__crumb" href="/admin">
              Administrare
            </a>
            <span className="adm-bar__slash" aria-hidden="true">
              /
            </span>
          </span>
        ) : (
          <span className="adm-bar__crumb adm-bar__crumb--here" aria-current="page">
            Administrare
          </span>
        )}
        {domain ? (
          <button
            ref={selectorRef}
            type="button"
            className="adm-selector"
            aria-haspopup="dialog"
            aria-expanded={open === "selector"}
            aria-controls={open ? panelId : undefined}
            aria-label={`Domeniu: ${domain.label}, pagina ${title}. Schimbă secțiunea`}
            onClick={() => setOpen(open === "selector" ? null : "selector")}
          >
            <span className="adm-selector__over">
              <span className="adm-selector__kicker">{condensed ? domain.label : "Domeniu"}</span>
              <span className="adm-selector__value">{condensed ? title : domain.label}</span>
            </span>
            <span className="adm-selector__change">Schimbă</span>
            <svg className="adm-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        ) : null}
        {tabs.length > 0 ? (
          <ul className="adm-tabs" aria-label={domain?.label}>
            {tabs.map((item) => (
              <li key={item.id}>
                <a
                  className="adm-tabs__tab"
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          ref={searchRef}
          type="button"
          className="adm-search"
          aria-haspopup="dialog"
          aria-expanded={open === "search"}
          aria-label="Caută o secțiune a administrării"
          onClick={() => setOpen(open === "search" ? null : "search")}
        >
          <svg className="adm-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="adm-search__label">Caută o secțiune</span>
        </button>
      </nav>
      {open ? (
        <AdminNavigatorPanel
          id={panelId}
          current={current}
          focusSearch={open === "search"}
          onClose={close}
          onNavigate={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("ro-RO");
}

type PanelProps = {
  id: string;
  current: AdministrationRailId | null;
  focusSearch: boolean;
  onClose: () => void;
  /** A destination was chosen: close without moving focus (the page changes or a guard asks). */
  onNavigate: () => void;
};

/**
 * The full map on demand: every destination, grouped by domain, with a filter. A dialog: Esc and the
 * close button return focus to the control that opened it; Tab stays inside.
 */
function AdminNavigatorPanel({ id, current, focusSearch, onClose, onNavigate }: PanelProps) {
  const [query, setQuery] = useState("");
  const [atEnd, setAtEnd] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const domains = useMemo(() => {
    const needle = normalize(query.trim());
    return administrationDomains(current)
      .map((domain) => ({
        ...domain,
        items: needle
          ? domain.items.filter((item) =>
              normalize(`${item.label} ${item.purpose} ${domain.label}`).includes(needle),
            )
          : domain.items,
      }))
      .filter((domain) => domain.items.length > 0);
  }, [current, query]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (focusSearch) {
      searchRef.current?.focus();
      return;
    }
    const here = panel.querySelector<HTMLElement>("[aria-current='page']");
    (here ?? searchRef.current)?.focus();
  }, [focusSearch]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setAtEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 4);
    measure();
    list.addEventListener("scroll", measure, { passive: true });
    return () => list.removeEventListener("scroll", measure);
  }, [domains]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled)") ?? []),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className="adm-nav-veil" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        id={id}
        className="adm-nav-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a[href]")) onNavigate();
        }}
      >
        <div className="adm-nav-panel__head">
          <span className="adm-nav-panel__grip" aria-hidden="true" />
          <h2 id={titleId} className="adm-nav-panel__title">
            Secțiunile administrării
          </h2>
          <button type="button" className="adm-nav-panel__close" aria-label="Închide" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        <div className="adm-nav-panel__search">
          <label className="adm-visually-hidden" htmlFor={`${id}-q`}>
            Caută o secțiune sau o setare
          </label>
          <input
            ref={searchRef}
            id={`${id}-q`}
            type="search"
            className="adm-input"
            placeholder="Caută o secțiune sau o setare"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div ref={listRef} className="adm-nav-panel__list" data-more={atEnd ? undefined : "true"}>
          {domains.length === 0 ? (
            <p className="adm-nav-panel__empty">Nicio secțiune nu corespunde căutării.</p>
          ) : null}
          {current !== null ? (
            <a className="adm-nav-panel__link adm-nav-panel__link--hub" href="/admin">
              Prezentarea administrării
            </a>
          ) : null}
          {domains.map((domain) => (
            <section key={domain.id} className="adm-nav-panel__group" aria-label={domain.label}>
              <h3 className="adm-nav-panel__group-title">{domain.label}</h3>
              <ul>
                {domain.items.map((item) => (
                  <li key={item.id}>
                    <NavigatorLink item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="adm-nav-panel__hint" aria-hidden="true">
          derulează pentru restul
        </p>
        <p className="adm-nav-panel__foot">Esc închide · modificările nesalvate rămân</p>
      </div>
    </>
  );
}

function NavigatorLink({ item }: { item: AdministrationNavItem }) {
  return (
    <a
      className="adm-nav-panel__link"
      href={item.href}
      aria-current={item.current ? "page" : undefined}
    >
      {item.label}
      {item.external ? <ExternalMark /> : null}
    </a>
  );
}

export function ExternalMark() {
  return (
    <svg className="adm-icon adm-icon--external" width="13" height="13" viewBox="0 0 16 16" role="img" aria-label="spațiu de lucru separat">
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
