import { useEffect, useState } from "react";
import { fetchDownload } from "../api/http";
import type { DossierFile } from "../api/taskDossier";
import { AuthenticatedDownloadLink } from "../presentation/AuthenticatedDownloadLink";

const PREVIEW_MAX_BYTES = 16 * 1024 * 1024;
const TEXT_MAX_BYTES = 256 * 1024;
type Preview =
  | { id: string; kind: "pdf"; url: string }
  | { id: string; kind: "image"; url: string }
  | { id: string; kind: "text"; text: string; truncated: boolean }
  | { id: string; kind: "error"; message: string };

export type ArtifactPreviewSource = Pick<
  DossierFile,
  "artifactId" | "originalFileName" | "sizeLabel" | "downloadHref" | "preview"
>;

/**
 * `embedded`: shown inside a viewer that already names the file and offers the one download of
 * the consulted version (N-018), so the preview drops its own header and download links; error
 * messages and the PDF fallback stay, pointing to that action. Default: unchanged standalone view.
 */
export function JobArtifactPreview({ file, embedded = false }: { file: ArtifactPreviewSource | null; embedded?: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [retry, setRetry] = useState(0);
  const id = file?.artifactId ?? "";
  const href = file?.downloadHref ?? "";
  const extension =
    file?.originalFileName.split(".").pop()?.toLowerCase() ?? "";
  const declaredPreview = file?.preview;
  const supported =
    extension === "pdf" || extension === "txt" || declaredPreview === "IMAGE";
  useEffect(() => {
    if (!id || !supported) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchDownload(href)
      .then(async (result) => {
        if (!result.ok)
          throw new Error(
            "Documentul nu a putut fi citit. Poți reîncerca sau descărca fișierul.",
          );
        const blob = result.blob;
        if (blob.size > PREVIEW_MAX_BYTES)
          throw new Error(
            "Documentul este prea mare pentru previzualizare. Descarcă fișierul pentru a-l consulta.",
          );
        const mime = blob.type.split(";")[0].trim().toLowerCase();
        let next: Preview;
        if (extension === "txt" && mime === "text/plain") {
          next = {
            id,
            kind: "text",
            text: await blob.slice(0, TEXT_MAX_BYTES).text(),
            truncated: blob.size > TEXT_MAX_BYTES,
          };
        } else if (
          extension === "pdf" &&
          mime === "application/pdf" &&
          (await blob.slice(0, 5).text()) === "%PDF-"
        ) {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          next = { id, kind: "pdf", url: objectUrl };
        } else if (
          declaredPreview === "IMAGE" &&
          ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)
        ) {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          next = { id, kind: "image", url: objectUrl };
        } else {
          throw new Error(
            "Previzualizarea acestui format nu este disponibilă. Descarcă fișierul original.",
          );
        }
        if (!cancelled) setPreview(next);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPreview({
            id,
            kind: "error",
            message:
              error instanceof Error &&
              error.message !== "session_context_changed"
                ? error.message
                : "Sesiunea s-a schimbat. Redeschide documentul.",
          });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, href, extension, declaredPreview, supported, retry]);
  if (!file)
    return (
      <div className="job-document__empty">
        <span aria-hidden="true">▱</span>
        <h3>Loc pentru documentele operației.</h3>
        <p>Alege sau adaugă un fișier în dosar.</p>
      </div>
    );
  const current = preview?.id === id ? preview : null;
  return (
    <section className="job-document" aria-label="Documentul selectat" data-embedded={embedded || undefined}>
      {embedded ? null : <header>
        <div>
          <span className="job-workbench__eyebrow">
            {extension.toUpperCase()} · {file.sizeLabel}
          </span>
          <h3>{file.originalFileName}</h3>
        </div>
        <AuthenticatedDownloadLink href={file.downloadHref}>
          Descarcă fișierul ↗
        </AuthenticatedDownloadLink>
      </header>}
      <div className="job-document__body" aria-busy={supported && !current}>
        {!supported ? (
          <div className="job-document__empty">
            <span className="job-document__format">
              {extension.toUpperCase()}
            </span>
            <h4>Fișier de lucru</h4>
            <p>
              Previzualizarea nativă nu este disponibilă. Descarcă fișierul
              pentru a-l deschide în aplicația potrivită.
            </p>
          </div>
        ) : !current ? (
          <p className="job-document__notice" role="status">
            Se citește documentul…
          </p>
        ) : current.kind === "error" ? (
          <div className="job-document__notice" role="status">
            <p>{current.message}</p>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setPreview(null);
                setRetry((value) => value + 1);
              }}
            >
              Reîncearcă previzualizarea
            </button>
          </div>
        ) : current.kind === "pdf" ? (
          <iframe
            title={file.originalFileName}
            src={`${current.url}#view=FitH`}
          />
        ) : current.kind === "image" ? (
          <img src={current.url} alt={file.originalFileName} />
        ) : (
          <div className="job-document__text">
            <pre>{current.text}</pre>
            {current.truncated ? (
              <p>
                Afișate primele 256 KB. Descarcă fișierul pentru conținutul
                complet.
              </p>
            ) : null}
          </div>
        )}
      </div>
      {current?.kind === "pdf" ? (
        embedded ? (
          <p className="job-document__fallback">Dacă browserul nu afișează PDF-ul, folosește „Descarcă această versiune”.</p>
        ) : (
          <p className="job-document__fallback">
            Dacă browserul nu afișează PDF-ul,{" "}
            <AuthenticatedDownloadLink href={file.downloadHref}>
              descarcă documentul
            </AuthenticatedDownloadLink>
            .
          </p>
        )
      ) : null}
    </section>
  );
}
