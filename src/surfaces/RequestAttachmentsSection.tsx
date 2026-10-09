import { useId, useRef, useState } from "react";
import { presentRequestDetail } from "../adapters/requestAdapter";
import { TransportError } from "../api/http";
import { uploadRequestAttachment } from "../api/requests";
import type { RequestAttachmentTransport } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { SurfacePanel } from "../components/SurfacePanel";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { invalidateCustomerProjections } from "../data/invalidation";
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
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
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
      invalidateCustomerProjections();
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
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
    <SurfacePanel title="Fișiere și dovezi" label="Fișiere și dovezi">
      {attachments.length === 0 ? (
        <EmptyState title="Nu există fișiere atașate." />
      ) : (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.attachmentId} className="attachment-list__row">
              <a className="text-link" href={attachment.downloadHref}>
                {attachment.originalFileName}
              </a>
              <span className="attachment-list__meta">
                {[attachment.sizeLabel, formatTimestamp(attachment.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUploadAttachments ? (
        <div className="file-picker">
          <input
            ref={inputRef}
            id={inputId}
            className="file-picker__input"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div className="file-picker__controls">
            <label className="button button--secondary file-picker__choose" htmlFor={inputId}>
              Alege fișier
            </label>
            <span className="file-picker__name" aria-live="polite">
              {file ? file.name : "Niciun fișier selectat"}
            </span>
            <Button disabled={!file || saveState === "pending"} onClick={() => void upload()}>
              Încarcă
            </Button>
          </div>
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
