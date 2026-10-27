import { useState } from "react";
import type { CustomerLogoTransport } from "../../api/types";
import "../../styles/surfaces/client-mark.css";
import { monogram } from "./clientsAgendaModel";

/**
 * N-023 · the client's mark: its logo when it has one that loads, the monogram in every other case
 * (no logo, a logo that fails to load, an image the browser cannot decode). The logo keeps its own
 * proportions and colours inside a neutral plate with a protective margin; it is never cropped or
 * stretched. The client's name stays visible next to the mark, so the mark itself is decorative.
 */
export function ClientMark({ name, logo, size }: { name: string; logo?: CustomerLogoTransport | null; size?: "large" }) {
  // The failure is remembered per image: a new revision gets its own chance to load.
  const [failedHref, setFailedHref] = useState<string | null>(null);
  const href = logo?.contentHref ?? null;
  if (href && failedHref !== href) {
    return (
      <span className="cagenda-mono client-mark" data-size={size} data-logo="" aria-hidden="true">
        <img src={href} alt="" width={logo?.width} height={logo?.height} decoding="async" draggable={false} onError={() => setFailedHref(href)} />
      </span>
    );
  }
  return (
    <span className="cagenda-mono client-mark" data-size={size} aria-hidden="true">
      {monogram(name)}
    </span>
  );
}
