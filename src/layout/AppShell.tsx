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
import {
  GLOBAL_NAV,
  HOME_HREF,
  globalNavItems,
  midWidthOverflowItems,
  midWidthPriorityItems,
  type GlobalNavItem,
} from "./globalNav";
import { SkipLink } from "./SkipLink";
import "../styles/layout/app-shell-v2.css";

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

const MIDWIDTH_QUERY = "(max-width: 1024px)";

function useMidWidthNav(): boolean {
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(MIDWIDTH_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(MIDWIDTH_QUERY);
    const sync = () => {
      setCompact(media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  return compact;
}

function NavLink({
  item,
  path,
  className = "app-shell__nav-item",
  onNavigate,
  index,
}: {
  item: GlobalNavItem;
  path: string;
  className?: string;
  onNavigate?: () => void;
  index?: number;
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
      {typeof index === "number" ? (
        <span className="app-shell__nav-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      ) : null}
      <span className="app-shell__nav-label">{item.label}</span>
    </a>
  );
}

function MidWidthMoreMenu({
  path,
  items,
}: {
  path: string;
  items: readonly GlobalNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const overflowCurrent = items.some((item) => navItemCurrent(path, item.href));

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
    <div className="app-shell__more" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="app-shell__nav-item app-shell__more-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        data-active={overflowCurrent || undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={onButtonKeyDown}
      >
        Mai multe
      </button>
      {open ? (
        <div
          id={menuId}
          className="app-shell__more-menu"
          role="menu"
          aria-label="Destinații suplimentare"
        >
          {items.map((item) => (
            <a
              key={item.id}
              className="app-shell__more-item"
              role="menuitem"
              href={item.href}
              aria-current={navItemCurrent(path, item.href) ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  contextLabel,
  children,
  currentHref,
  mode = "proof",
  account = null,
}: AppShellProps) {
  const path = currentHref ?? "/";
  const homeHref = mode === "slice" ? HOME_HREF : "/foundation";
  const homeCurrent = mode === "slice" && (path === "/" || path === "");
  const compactNav = useMidWidthNav();
  const priorityItems = midWidthPriorityItems();
  const overflowItems = midWidthOverflowItems();

  const flatItems = globalNavItems();

  return (
    <div className="app-shell" data-nav-mode={compactNav ? "midwidth" : "desktop"}>
      <SkipLink />
      <header className="app-shell__bar">
        <div className="app-shell__utility">
          <a
            className="app-shell__brand"
            href={homeHref}
            aria-label="WorkOS"
            aria-current={homeCurrent ? "page" : undefined}
          >
            <span className="app-shell__brand-mark">
              <BrandMark />
            </span>
            <span className="app-shell__brand-copy">
              <span className="app-shell__wordmark">WorkOS</span>
              <span className="app-shell__brand-system">production control system</span>
            </span>
          </a>

          <div className="app-shell__route">
            <span className="app-shell__route-signal" aria-hidden="true" />
            <span className="app-shell__route-kicker">Canal activ</span>
            <strong className="app-shell__route-name">{contextLabel}</strong>
          </div>

          <div className="app-shell__account">
            {account ? (
              <AccountArea {...account} />
            ) : (
              <p className="app-shell__context">{contextLabel}</p>
            )}
          </div>
        </div>

        <div className="app-shell__command">
          <nav className="app-shell__nav" aria-label="Navigare principală">
            {mode === "slice" ? (
              compactNav ? (
                <div className="app-shell__nav-compact">
                  {priorityItems.map((item, index) => (
                    <NavLink key={item.id} item={item} path={path} index={index} />
                  ))}
                  {overflowItems.length > 0 ? (
                    <MidWidthMoreMenu path={path} items={overflowItems} />
                  ) : null}
                </div>
              ) : (
                <div className="app-shell__nav-desktop">
                  {flatItems.map((item, index) => (
                    <NavLink key={item.id} item={item} path={path} index={index} />
                  ))}
                </div>
              )
            ) : (
              PROOF_NAV.map((item) => {
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
                  <a
                    key={item.id}
                    className="app-shell__nav-item"
                    href={href}
                    aria-current={current ? "page" : undefined}
                  >
                    <span className="app-shell__nav-label">{item.label}</span>
                  </a>
                );
              })
            )}
          </nav>
          <div className="app-shell__system-state" aria-label="Stare sistem">
            <span className="app-shell__system-dot" aria-hidden="true" />
            <span>WORKOS / LIVE</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
