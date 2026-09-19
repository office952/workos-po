import type { ReactNode } from "react";

type PageRegionProps = {
  children: ReactNode;
};

export function PageRegion({ children }: PageRegionProps) {
  return (
    <main id="continut-principal" className="app-shell__main" tabIndex={-1}>
      {children}
    </main>
  );
}
