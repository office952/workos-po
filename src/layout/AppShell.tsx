import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { BrandMark } from "../components/BrandMark";
import { navItemCurrent } from "../routing/appRoute";
import { AccountArea, type AccountAreaProps } from "./AccountArea";
import { GLOBAL_NAV, HOME_HREF, globalNavItems, type GlobalNavItem } from "./globalNav";
import { SkipLink } from "./SkipLink";
import "../styles/themes/workos-machine.css";
import "../styles/layout/app-shell-v2.css";
import "../styles/layout/app-shell-band.css";

type AppShellProps = {
  contextLabel: string;
  children: ReactNode;
  currentHref?: string;
  mode?: "proof" | "slice";
  account?: AccountAreaProps | null;
};

const PROOF_NAV = [
  { id: "cereri", label: "Cereri", href: "/foundation", current: true },
  { id: "comercial", label: "Comercial" },
  { id: "lucrari", label: "Lucrări" },
  { id: "atelier", label: "Atelier" },
  { id: "more", label: "Mai multe" },
] as const;

const TABLET_QUERY = "(max-width: 1151px)";
const PHONE_QUERY = "(max-width: 767px)";

type NavMode = "desktop" | "tablet" | "phone";

function resolveNavMode(): NavMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "desktop";
  }
  if (window.matchMedia(PHONE_QUERY).matches) {
    return "phone";
  }
  if (window.matchMedia(TABLET_QUERY).matches) {
    return "tablet";
  }
  return "desktop";
}

function useResponsiveNavMode(): NavMode {
  const [mode, setMode] = useState<NavMode>(resolveNavMode);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const tablet = window.matchMedia(TABLET_QUERY);
    const phone = window.matchMedia(PHONE_QUERY);
    const sync = () => setMode(resolveNavMode());
    sync();
    tablet.addEventListener("change", sync);
    phone.addEventListener("change", sync);
    return () => {
      tablet.removeEventListener("change", sync);
      phone.removeEventListener("change", sync);
    };
  }, []);

  return mode;
}

/** Module numbers follow the navigation order; they are not stored anywhere else. */
function moduleIndex(item: GlobalNavItem): string {
  return String(globalNavItems().findIndex((entry) => entry.id === item.id) + 1).padStart(2, "0");
}

function ModuleLink({
  item,
  path,
  className,
  onNavigate,
}: {
  item: GlobalNavItem;
  path: string;
  className: string;
  onNavigate?: () => void;
}) {
  const current = navItemCurrent(path, item.href);
  return (
    <a
      className={className}
      href={item.href}
      aria-current={current ? "page" : undefined}
      onClick={() => {
        onNavigate?.();
      }}
    >
      <span className="app-shell__module-index" aria-hidden="true">
        {moduleIndex(item)}
      </span>
      <span className="app-shell__module-label">{item.label}</span>
    </a>
  );
}

/** Desktop: every module as a numbered plate; groups are separated by a brass rivet. */
function ModuleRail({ path }: { path: string }) {
  return (
    <nav className="app-shell__modules" aria-label="Navigare principală">
      {GLOBAL_NAV.map((group, groupIndex) => (
        <div key={group.id} className="app-shell__module-group" data-first={groupIndex === 0 || undefined}>
          {group.items.map((item) => (
            <ModuleLink key={item.id} item={item} path={path} className="app-shell__module" />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Tablet and phone: the current module opens a sheet with every module, grouped. */
function ModuleSwitcher({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const current = globalNavItems().find((item) => navItemCurrent(path, item.href)) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="app-shell__switcher" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="app-shell__switcher-trigger"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {current ? (
          <>
            <span className="app-shell__module-index" aria-hidden="true">
              {moduleIndex(current)}
            </span>
            <span className="app-shell__module-label">{current.label}</span>
            <span className="u-visually-hidden"> · module</span>
          </>
        ) : (
          <span className="app-shell__module-label">Module</span>
        )}
        <svg className="app-shell__switcher-chevron" aria-hidden="true" viewBox="0 0 20 20">
          <path d="M5.5 8 10 12.5 14.5 8" />
        </svg>
      </button>
      {open ? (
        <nav id={sheetId} className="app-shell__switcher-sheet" aria-label="Navigare principală">
          {GLOBAL_NAV.map((group) => (
            <div key={group.id} className="app-shell__switcher-group">
              <p className="app-shell__switcher-heading">{group.label}</p>
              {group.items.map((item) => (
                <ModuleLink
                  key={item.id}
                  item={item}
                  path={path}
                  className="app-shell__switcher-item"
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function ProofShell({ contextLabel, children, account }: AppShellProps) {
  return (
    <div className="app-shell" data-nav-mode="proof">
      <SkipLink />
      <header className="app-shell__bar">
        <div className="app-shell__utility">
          <a className="app-shell__brand" href="/foundation" aria-label="WorkOS">
            <span className="app-shell__brand-mark">
              <BrandMark />
            </span>
            <span className="app-shell__brand-copy">
              <span className="app-shell__wordmark">WorkOS</span>
            </span>
          </a>
          <div className="app-shell__account">
            {account ? <AccountArea {...account} /> : <p className="app-shell__context">{contextLabel}</p>}
          </div>
        </div>
        <div className="app-shell__command">
          <nav className="app-shell__nav" aria-label="Navigare principală">
            {PROOF_NAV.map((item) => {
              const href = "href" in item ? item.href : undefined;
              const current = href !== undefined && "current" in item && item.current;
              if (!href) {
                return (
                  <span key={item.id} className="app-shell__nav-item" aria-disabled="true">
                    <span className="app-shell__nav-label">{item.label}</span>
                  </span>
                );
              }
              return (
                <a key={item.id} className="app-shell__nav-item" href={href} aria-current={current ? "page" : undefined}>
                  <span className="app-shell__nav-label">{item.label}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const { contextLabel, children, currentHref, mode = "proof", account = null } = props;
  const navMode = useResponsiveNavMode();
  if (mode !== "slice") {
    return <ProofShell {...props} account={account} />;
  }
  const path = currentHref ?? "/";
  const homeCurrent = path === "/" || path === "";

  return (
    <div className="app-shell" data-nav-mode={navMode}>
      <SkipLink />
      <header className="app-shell__bar app-shell__bar--band">
        <div className="app-shell__band">
          <a
            className="app-shell__brand"
            href={HOME_HREF}
            aria-label="WorkOS"
            aria-current={homeCurrent ? "page" : undefined}
          >
            <span className="app-shell__brand-mark">
              <BrandMark />
            </span>
            <span className="app-shell__brand-copy">
              <span className="app-shell__wordmark">WorkOS</span>
              <span className="app-shell__brand-system">Control producție</span>
            </span>
          </a>
          {navMode === "desktop" ? <ModuleRail path={path} /> : <ModuleSwitcher path={path} />}
          <span className="app-shell__spacer" />
          <div className="app-shell__plate">
            <p className="app-shell__channel" title={`Canal activ: ${contextLabel}`}>
              <span className="app-shell__channel-signal" aria-hidden="true" />
              <span className="app-shell__channel-kicker">Live</span>
              <span className="app-shell__channel-name">{contextLabel}</span>
            </p>
            <div className="app-shell__account">
              {account ? <AccountArea {...account} /> : <p className="app-shell__context">{contextLabel}</p>}
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
