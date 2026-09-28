import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { BrandMark } from "../components/BrandMark";
import { navItemCurrent } from "../routing/appRoute";
import { AccountArea, type AccountAreaProps } from "./AccountArea";
import {
  globalNavItems,
  HOME_HREF,
  PRIMARY_NAV_GAP_PX,
  PRIMARY_NAV_MAX_ROWS,
  primaryNavVisibleCount,
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
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const menuId = useId();
  const overflowCurrent = items.some((item) => navItemCurrent(path, item.href));

  function focusItem(index: number): void {
    const nodes = itemRefs.current.filter((node): node is HTMLAnchorElement => node != null);
    if (nodes.length === 0) {
      return;
    }
    const next = (index + nodes.length) % nodes.length;
    nodes[next]?.focus();
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    focusItem(0);
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
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) {
        focusItem(0);
      } else {
        setOpen(true);
      }
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const nodes = itemRefs.current.filter((node): node is HTMLAnchorElement => node != null);
    const current = nodes.findIndex((node) => node === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(current < 0 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current < 0 ? nodes.length - 1 : current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(nodes.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
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
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <a
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
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

function useFittedNavCount(itemCount: number): {
  rowRef: RefObject<HTMLDivElement | null>;
  visibleCount: number;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }

    const measure = () => {
      const probes = [...row.querySelectorAll<HTMLElement>("[data-nav-probe]")];
      const moreProbe = row.querySelector<HTMLElement>("[data-nav-more-probe]");
      const columnGap = Number.parseFloat(getComputedStyle(row).columnGap);
      const count = primaryNavVisibleCount({
        containerWidth: row.clientWidth,
        itemWidths: probes.map((probe) => probe.offsetWidth),
        moreWidth: moreProbe?.offsetWidth ?? 0,
        gap: Number.isFinite(columnGap) ? columnGap : PRIMARY_NAV_GAP_PX,
        maxRows: PRIMARY_NAV_MAX_ROWS,
      });
      setVisibleCount(count);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(row);
    return () => {
      observer.disconnect();
    };
  }, [itemCount]);

  return { rowRef, visibleCount };
}

function PrimaryNav({ path }: { path: string }) {
  const items = globalNavItems();
  const { rowRef, visibleCount } = useFittedNavCount(items.length);
  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);

  return (
    <div className="app-shell__nav-row" ref={rowRef}>
      <div className="app-shell__nav-measure" aria-hidden="true">
        {items.map((item) => (
          <span key={item.id} className="app-shell__nav-item" data-nav-probe="">
            {item.label}
          </span>
        ))}
        <span className="app-shell__nav-item" data-nav-more-probe="">
          Mai multe
        </span>
      </div>
      <div className="app-shell__nav-links">
        {visible.map((item) => (
          <NavLink key={item.id} item={item} path={path} />
        ))}
        {overflow.length > 0 ? <MidWidthMoreMenu path={path} items={overflow} /> : null}
      </div>
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

  return (
    <div className="app-shell" data-nav-mode="wrap">
      <SkipLink />
      <header className="app-shell__bar" data-shell-contract="fixed-height-multirow">
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
            <PrimaryNav path={path} />
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
