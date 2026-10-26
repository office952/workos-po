import type { DossierDocument, HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import { orderedPhotos } from "../historyModel";

/** What a card opened: a photo in the viewer (with the entry it belongs to) or a file preview. */
export type Opened = { kind: "photo"; photos: DossierDocument[]; startId: string; context: string } | { kind: "file"; document: DossierDocument } | null;

/** `photos`: the set the viewer browses (the request's own photos, or one work's); by default the entry's. */
export function openDocument(entry: HistoryEntry, document: DossierDocument, onOpen: (opened: Opened) => void, photos?: readonly DossierDocument[]) {
  if (document.kind === "PHOTO" && document.preview === "IMAGE") {
    onOpen({ kind: "photo", photos: orderedPhotos(photos ?? entry.documents), startId: document.documentId, context: entry.title });
  } else {
    onOpen({ kind: "file", document });
  }
}
