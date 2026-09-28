import type { ReactNode } from "react";
import { BrandMark } from "../components/BrandMark";
import { navItemCurrent } from "../routing/appRoute";
import { ThemeControl } from "../theme/ThemeControl";
import { AccountArea, type AccountAreaProps } from "./AccountArea";
import { GLOBAL_NAV, HOME_HREF } from "./globalNav";
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
    <div className="app-shell">
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
          {mode === "slice"
            ? GLOBAL_NAV.map((group) => (
                <div key={group.id} className="app-shell__nav-group" role="group" aria-label={group.label}>
                  {group.items.length > 1 ? (
                    <span className="app-shell__nav-kicker">{group.label}</span>
                  ) : null}
                  {group.items.map((item) => {
                    const current = navItemCurrent(path, item.href);
                    return (
                      <a
                        key={item.id}
                        className="app-shell__nav-item"
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              ))
            : PROOF_NAV.map((item) => {
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
              })}
        </nav>
        <div className="app-shell__account">
          <ThemeControl />
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
