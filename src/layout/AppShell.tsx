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
  midWidthOverflowItems,
  midWidthPriorityItems,
  type GlobalNavItem,
} from "./globalNav";
import { SkipLink } from "./SkipLink";

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
}: {
  item: GlobalNavItem;
  path: string;
  className?: string;
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
      {item.label}
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

  return (
    <div className="app-shell" data-nav-mode={compactNav ? "midwidth" : "desktop"}>
      <SkipLink />
      <header className="app-shell__bar">
        <a
          className="app-shell__brand"
          href={homeHref}
          aria-label="WorkOS"
          aria-current={homeCurrent ? "page" : undefined}
        >
          <BrandMark />
          <span className="app-shell__wordmark">WorkOS</span>
        </a>
        {mode === "slice" ? <span className="app-shell__rule" aria-hidden="true" /> : null}
        <nav className="app-shell__nav" aria-label="Navigare principală">
          {mode === "slice" ? (
            compactNav ? (
              <div className="app-shell__nav-compact">
                {priorityItems.map((item) => (
                  <NavLink key={item.id} item={item} path={path} />
                ))}
                {overflowItems.length > 0 ? (
                  <MidWidthMoreMenu path={path} items={overflowItems} />
                ) : null}
              </div>
            ) : (
              <div className="app-shell__nav-desktop">
                {GLOBAL_NAV.map((group) => (
                  <div
                    key={group.id}
                    className="app-shell__nav-group"
                    role="group"
                    aria-label={group.label}
                  >
                    {group.items.length > 1 ? (
                      <span className="app-shell__nav-kicker">{group.label}</span>
                    ) : null}
                    {group.items.map((item) => (
                      <NavLink key={item.id} item={item} path={path} />
                    ))}
                  </div>
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
                    {item.label}
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
                  {item.label}
                </a>
              );
            })
          )}
        </nav>
        <div className="app-shell__account">
          {account ? (
            <AccountArea {...account} />
          ) : (
            <p className="app-shell__context">{contextLabel}</p>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
