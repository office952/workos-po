import { useEffect, useState } from "react";

export type DocumentFile =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "missing" }
  | { status: "error" };

/**
 * The file of a document for the in-page preview (PDF in the browser's own viewer, an image):
 * read once from the server's content route, so loading, a missing or damaged file (410 / 409)
 * and a failed read have their own state and a retry. Download keeps the server's link, with the
 * original file name. Nothing is cached beyond the open preview.
 */
export function useDocumentFile(viewHref: string | null): { file: DocumentFile; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = viewHref ? `${viewHref}#${attempt}` : null;
  // The answer for one read (href + attempt); any other read is still loading.
  const [answer, setAnswer] = useState<{ key: string; file: DocumentFile } | null>(null);
  useEffect(() => {
    if (!viewHref || !key) return;
    let url: string | null = null;
    let live = true;
    const settle = (file: DocumentFile) => live && setAnswer({ key, file });
    fetch(viewHref, { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 410 || response.status === 409) return settle({ status: "missing" });
        if (!response.ok) return settle({ status: "error" });
        const blob = await response.blob();
        if (!live) return;
        url = URL.createObjectURL(blob);
        settle({ status: "ready", url });
      })
      .catch(() => settle({ status: "error" }));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewHref, key]);
  const file: DocumentFile = answer && answer.key === key ? answer.file : { status: "loading" };
  return { file, retry: () => setAttempt((value) => value + 1) };
}
