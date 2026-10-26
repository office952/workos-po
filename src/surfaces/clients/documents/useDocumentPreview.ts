import { useEffect, useRef } from "react";
import { usePreviewHistory } from "../../../routing/usePreviewHistory";

export const DOCUMENT_PARAM = "document";

/**
 * The open document of a list (Documente, Lucrări, Istoric): `document=<id>` next to the list's own
 * context, with the product's preview history rule (the first open is a history entry; Back or
 * "Închide" returns to the list as it was; a direct link or a refresh opens the same document).
 * Closing gives the focus back to the control that opened it (`data-document-opener`).
 */
export function useDocumentPreview(search: string, href: (documentId: string | null) => string) {
  const openId = new URLSearchParams(search).get(DOCUMENT_PARAM);
  const preview = usePreviewHistory(href, openId);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (openId) {
      last.current ??= openId;
      return;
    }
    const previous = last.current;
    last.current = null;
    if (previous) document.querySelector<HTMLElement>(`[data-document-opener="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
  }, [openId]);
  return { openId, open: preview.open, close: preview.close };
}
