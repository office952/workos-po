import type { ReactNode } from "react";

/**
 * N-020 · the filter rail shared by Istoric, Lucrări, Fotografii, Documente and Cereri și oferte
 * (Figma page 10): a titled group of options, each with its count at the right. A count the
 * server does not send stays empty, never 0.
 */
export function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dfilters__group">
      <p className="dfilters__title">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}
