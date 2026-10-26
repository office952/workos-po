import type { ReactNode } from "react";
import type { OriginBack } from "../../../routing/originBack";
import "../../../styles/surfaces/client-sites-origin.css";

/** "← Sedii · <site>" with what the list shows, on one row above the title. */
export function SitesOriginBand({ back, siteName, children }: { back: OriginBack; siteName: string | null; children?: ReactNode }) {
  return (
    <div className="dorigin">
      <a className="dorigin__back" href={back.href} onClick={back.onClick}>
        {`← Sedii${siteName ? ` · ${siteName}` : ""}`}
      </a>
      {children}
    </div>
  );
}
