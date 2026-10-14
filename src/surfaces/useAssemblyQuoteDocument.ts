import { useState } from "react";
import { readTransportReasons } from "../api/http";
import { fetchAssemblyQuoteDocument } from "../api/quote";
import { triggerBrowserDownload } from "../presentation/download";

/** Downloads the server-rendered PDF of one frozen assembly quote. */
export function useAssemblyQuoteDocument(quoteSnapshotId: string | null) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(): Promise<void> {
    if (!quoteSnapshotId || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await fetchAssemblyQuoteDocument(quoteSnapshotId);
    setPending(false);
    if (!result.ok) {
      setError(readTransportReasons(result.body)[0] ?? "Documentul ofertei nu este disponibil.");
      return;
    }
    triggerBrowserDownload(result.blob, result.filename ?? "oferta.pdf");
  }

  return { pending, error, download };
}
