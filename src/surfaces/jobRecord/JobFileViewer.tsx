import { useEffect, useRef } from "react";
import type { JobRecordFile } from "../../api/jobRecord";
import { Button } from "../../components/Button";
import { AuthenticatedDownloadLink } from "../../presentation/AuthenticatedDownloadLink";
import { JobArtifactPreview } from "../JobArtifactPreview";
import { fileVersions } from "./fileVersions";
import "../../styles/surfaces/job-file-viewer.css";

/**
 * N-018 · vizorul: one file of the job, next to the operation (or the file list), with its
 * revisions. Consulting another revision changes only what is shown: the operation's association
 * and the declared use stay as recorded. The document itself is shown by the existing preview
 * (the browser's own PDF viewer); page and zoom controls of our own are a separate decision (P2).
 */
export function JobFileViewer({
  files,
  fileId,
  anchorId,
  contextLabel,
  expanded,
  onSwitch,
  onToggleExpand,
  onClose,
}: {
  files: readonly JobRecordFile[];
  fileId: string;
  /** The version the operation is associated with (or the one opened); the banner compares to it. */
  anchorId: string;
  /** "Pentru operația 02" or "Fișierele lucrării". */
  contextLabel: string;
  expanded: boolean;
  onSwitch: (artifactId: string) => void;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const versions = fileVersions(files, fileId);
  const file = files.find((item) => item.artifactId === fileId) ?? null;
  const shownIndex = versions.findIndex((item) => item.artifactId === fileId);
  const anchorIndex = versions.findIndex((item) => item.artifactId === anchorId);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc closes the viewer only — not the operation, and not while another dialog is open
  // (for example the unsaved-changes question), which handles its own Esc.
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) return;
      event.preventDefault();
      closeHandler.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!file) {
    return (
      <aside className="job-viewer" aria-label="Vizor fișier">
        <header className="job-viewer__head">
          <p className="job-viewer__context">{contextLabel}</p>
          <Button ref={closeRef} variant="secondary" onClick={onClose}>Închide ×</Button>
        </header>
        <p className="job-viewer__missing">Fișierul cerut nu există în această lucrare.</p>
      </aside>
    );
  }

  const consultingOther = anchorIndex >= 0 && shownIndex !== anchorIndex;
  return (
    <aside className="job-viewer" data-expanded={expanded || undefined} aria-label={`Vizor fișier ${file.originalFileName}`}>
      <header className="job-viewer__head">
        <div>
          <p className="job-viewer__context">{contextLabel}</p>
          <h3 className="job-viewer__name">{file.originalFileName}</h3>
        </div>
        <div className="job-viewer__versions" role="group" aria-label="Versiuni">
          {versions.length > 1
            ? versions.map((item, index) => (
                <button
                  key={item.artifactId}
                  type="button"
                  aria-pressed={item.artifactId === fileId}
                  onClick={() => onSwitch(item.artifactId)}
                >
                  {`v${index + 1}${index === anchorIndex ? " · asociată" : anchorIndex >= 0 && index > anchorIndex ? " · ulterioară" : anchorIndex >= 0 && index < anchorIndex ? " · anterioară" : ""}`}
                </button>
              ))
            : null}
          <Button ref={closeRef} variant="secondary" onClick={onClose}>Închide ×</Button>
        </div>
      </header>
      {consultingOther ? (
        <p className="job-viewer__banner" role="status">
          <span>
            {`Consulți v${shownIndex + 1} (${shownIndex > anchorIndex ? "ulterioară" : "anterioară"}). Asocierea rămâne la v${anchorIndex + 1}; utilizarea declarată nu se schimbă.`}
          </span>
          <button type="button" onClick={() => onSwitch(anchorId)}>{`Revino la v${anchorIndex + 1}`}</button>
        </p>
      ) : null}
      <div className="job-viewer__tools">
        <Button variant="secondary" className="job-viewer__expand" aria-pressed={expanded} onClick={onToggleExpand}>{expanded ? "Restrânge vizorul" : "Extinde vizorul"}</Button>
        <AuthenticatedDownloadLink href={file.downloadHref}>Descarcă această versiune</AuthenticatedDownloadLink>
      </div>
      <div className="job-viewer__document">
        <JobArtifactPreview key={file.artifactId} file={file} embedded />
      </div>
    </aside>
  );
}
