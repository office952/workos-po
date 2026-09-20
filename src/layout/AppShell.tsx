import type { ReactNode } from "react";
import { BrandMark } from "../components/BrandMark";
import { navItemCurrent } from "../routing/appRoute";
import { AccountArea, type AccountAreaProps } from "./AccountArea";
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

const SLICE_NAV = [
  { id: "clients", label: "Clienți", href: "/clienti" },
  { id: "requests", label: "Cereri", href: "/cereri" },
  { id: "catalog", label: "Catalog", href: "/catalog" },
  { id: "configurator", label: "Configurator", href: "/configurator" },
  { id: "quotes", label: "Oferte", href: "/oferte" },
  { id: "jobs", label: "Lucrări", href: "/lucrari" },
  { id: "atelier", label: "Atelier", href: "/atelier" },
  { id: "resources", label: "Resurse", href: "/admin/resources" },
  { id: "commercial", label: "Comercial", href: "/admin/commercial" },
] as const;

export function AppShell({
  contextLabel,
  children,
  currentHref,
  mode = "proof",
  account = null,
}: AppShellProps) {
  const items = mode === "slice" ? SLICE_NAV : PROOF_NAV;
  const path = currentHref ?? "/";

  return (
    <div className="app-shell">
      <SkipLink />
      <header className="app-shell__bar">
        <a className="app-shell__brand" href={mode === "slice" ? "/clienti" : "/foundation"} aria-label="WorkOS">
          <BrandMark />
          <span className="app-shell__wordmark">WorkOS</span>
        </a>
        {mode === "slice" ? <span className="app-shell__rule" aria-hidden="true" /> : null}
        <nav className="app-shell__nav" aria-label="Navigare principală">
          {items.map((item) => {
            const href = "href" in item ? item.href : undefined;
            const current =
              href !== undefined &&
              (mode === "proof"
                ? "current" in item && item.current
                : navItemCurrent(path, href));
            if (!href) {
              return (
                <span
                  key={item.id}
                  className="app-shell__nav-item"
                  aria-disabled="true"
                >
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
        {account ? (
          <div className="app-shell__account">
            <AccountArea {...account} />
          </div>
        ) : (
          <p className="app-shell__context">{contextLabel}</p>
        )}
      </header>
      {children}
    </div>
  );
}
