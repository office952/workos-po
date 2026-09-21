import { useState } from "react";
import { presentRequestDetail } from "../adapters/requestAdapter";
import { TransportError } from "../api/http";
import { uploadRequestAttachment } from "../api/requests";
import type { RequestAttachmentTransport } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { formatTimestamp } from "../presentation/format";

type RequestAttachmentsSectionProps = {
  requestId: string;
  attachments: readonly RequestAttachmentTransport[];
  canUploadAttachments: boolean;
};

export function RequestAttachmentsSection({
  requestId,
  attachments,
  canUploadAttachments,
}: RequestAttachmentsSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function upload(): Promise<void> {
    if (!file) {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentRequestDetail(await uploadRequestAttachment(requestId, file));
      if (presented) {
        writeResource(resourceKeys.request(requestId), presented);
      }
      invalidateResources(resourceKeys.requests());
      setFile(null);
      setSaveState("idle");
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof TransportError
          ? "Fișierul nu a putut fi încărcat."
          : "Încărcarea a eșuat.",
      );
    }
  }

  return (
    <SurfacePanel title="Atașamente" label="Atașamente">
      {attachments.length === 0 ? (
        <EmptyState title="Nu există atașamente." />
      ) : (
        <ul className="stack">
          {attachments.map((attachment) => (
            <li key={attachment.attachmentId}>
              <p>
                <a className="text-link" href={attachment.downloadHref}>
                  {attachment.originalFileName}
                </a>
              </p>
              <p className="worklist-row__detail">
                {[attachment.sizeLabel, formatTimestamp(attachment.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canUploadAttachments ? (
        <div className="stack">
          <label className="field" htmlFor="request-attachment">
            <span className="field__label">Încarcă fișier</span>
            <input
              id="request-attachment"
              className="field__control"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button disabled={!file || saveState === "pending"} onClick={() => void upload()}>
            Încarcă
          </Button>
        </div>
      ) : (
        <p className="ui-note">Încărcarea nu este permisă pe această cerere.</p>
      )}
      {saveError ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {saveError}
        </InlineAlert>
      ) : null}
    </SurfacePanel>
  );
}
