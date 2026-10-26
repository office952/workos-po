import { useEffect, useState } from "react";

/**
 * The short confirmation after a document change (705:23746 „Datele documentului au fost salvate.”):
 * said once, politely, where the reader is (the list or the open document), then gone. It confirms
 * what the server answered; it is never shown for a save that did not happen.
 */
type Notice = { documentId: string; text: string; at: number };

const EVENT = "workos:document-notice";

export function announceDocument(documentId: string, text: string): void {
  window.dispatchEvent(new CustomEvent<Notice>(EVENT, { detail: { documentId, text, at: Date.now() } }));
}

export function announceDocumentSaved(documentId: string): void {
  announceDocument(documentId, "Datele documentului au fost salvate.");
}

export function useDocumentNotice(): Notice | null {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    const onNotice = (event: Event) => setNotice((event as CustomEvent<Notice>).detail);
    window.addEventListener(EVENT, onNotice);
    return () => window.removeEventListener(EVENT, onNotice);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return notice;
}
