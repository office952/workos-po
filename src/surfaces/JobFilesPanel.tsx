import { useId, useState, type FormEvent } from "react";
import { TransportError, readTransportErrorCode } from "../api/http";
import { loadJobFiles, uploadJobFile } from "../api/jobFiles";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { resourceKeys } from "../data/resourceKeys";
import { writeResource } from "../data/resourceCache";
import { useResource } from "../data/useResource";
import { AuthenticatedDownloadLink } from "../presentation/AuthenticatedDownloadLink";
import { formatTimestamp } from "../presentation/format";
import "../styles/surfaces/task-dossier.css";

const FILE_PURPOSES = [
  { value: "", label: "Fără scop declarat" },
  { value: "WORKING", label: "Fișier de lucru" },
  { value: "EXECUTION_READY", label: "Pregătit pentru execuție" },
  { value: "TECHNICAL_REFERENCE", label: "Referință tehnică" },
  { value: "EVIDENCE", label: "Dovadă" },
  { value: "RECORD", label: "Evidență" },
];

export function JobFilesPanel({ jobId }: { jobId: string }) {
  const archive = useResource(resourceKeys.jobFiles(jobId), () => loadJobFiles(jobId));
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [supersedesArtifactId, setSupersedesArtifactId] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputId = useId();
  const files = archive.data?.files ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    setNotice(null);
    try {
      const next = await uploadJobFile(jobId, file, {
        purpose: purpose || undefined,
        note: note || undefined,
        supersedesArtifactId: supersedesArtifactId || undefined,
      });
      writeResource(resourceKeys.jobFiles(jobId), next);
      setFile(null);
      setPurpose("");
      setNote("");
      setSupersedesArtifactId("");
      setNotice("Fișierul a fost păstrat în lucrare. Starea operațiilor nu s-a schimbat.");
    } catch (error) {
      setActionError(presentFileError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <SurfacePanel title="Fișierele lucrării" label="Fișierele lucrării" busy={archive.status === "loading"}>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        <div
          className="task-dossier__drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files[0];
            if (dropped) {
              setFile(dropped);
            }
          }}
        >
          <label className="field" htmlFor={fileInputId}>
            <span className="field__label">Fișier</span>
            <input
              id={fileInputId}
              className="field__control"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.dxf,.dwg,.cdr,.nc,.tap,.gcode"
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <p className="task-dossier__meta">Poți selecta fișierul sau îl poți trage aici.</p>
        </div>
        {file ? (
          <p className="task-dossier__meta">
            {file.name} · {fileExtension(file.name)} · {formatBytes(file.size)}
          </p>
        ) : null}
        <SelectField
          id={`${fileInputId}-purpose`}
          label="Scop, opțional"
          value={purpose}
          options={FILE_PURPOSES}
          onChange={setPurpose}
        />
        <TextField id={`${fileInputId}-note`} label="Explicație, opțională" value={note} onChange={setNote} />
        {files.length > 0 ? (
          <SelectField
            id={`${fileInputId}-version`}
            label="Versiune nouă pentru, opțional"
            value={supersedesArtifactId}
            options={[
              { value: "", label: "Fișier nou, nu o versiune" },
              ...files.map((item) => ({ value: item.artifactId, label: item.originalFileName })),
            ]}
            onChange={setSupersedesArtifactId}
          />
        ) : null}
        <Button type="submit" disabled={pending || !file}>
          Încarcă fișierul
        </Button>
      </form>
      {archive.status === "error" ? (
        <InlineAlert tone="error" title="Fișierele nu au putut fi citite">
          Dosarul lucrării nu este disponibil.
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert tone="error" title="Fișierul nu a fost păstrat">
          {actionError}
        </InlineAlert>
      ) : null}
      {notice ? <p className="ui-note">{notice}</p> : null}
      {archive.status === "success" && files.length === 0 ? (
        <p>Lucrarea nu are încă fișiere.</p>
      ) : null}
      {files.map((item) => (
        <article key={item.artifactId} className="task-dossier__file">
          <AuthenticatedDownloadLink href={item.downloadHref}>
            {item.originalFileName}
          </AuthenticatedDownloadLink>
          <p className="task-dossier__meta">
            {fileExtension(item.originalFileName)} · {item.sizeLabel}
            {item.purposeLabel ? ` · ${item.purposeLabel}` : ""}
            {item.supersedesArtifactId ? " · Versiune nouă" : ""}
          </p>
          {item.note ? <p>{item.note}</p> : null}
          <p className="task-dossier__meta">
            {item.authorLabel ?? "Cont organizație"} · <time dateTime={item.uploadedAt}>{formatTimestamp(item.uploadedAt)}</time>
          </p>
          {item.preview !== "IMAGE" ? (
            <p className="task-dossier__meta">Descărcare, fără previzualizare pentru acest format.</p>
          ) : null}
        </article>
      ))}
    </SurfacePanel>
  );
}

function presentFileError(error: unknown): string {
  if (!(error instanceof TransportError)) {
    return "Fișierul nu a putut fi păstrat. Încearcă din nou.";
  }
  const code = readTransportErrorCode(error.body);
  switch (code) {
    case "invalid_session":
      return "Identifică operatorul înainte să adaugi în dosar.";
    case "invalid_file":
      return "Formatul nu este permis.";
    case "file_too_large":
      return "Fișierul este prea mare.";
    case "invalid_purpose":
      return "Scopul ales nu este recunoscut.";
    case "invalid_text":
      return "Explicația nu a putut fi păstrată.";
    default:
      return "Fișierul nu a putut fi păstrat. Încearcă din nou.";
  }
}

function fileExtension(name: string): string {
  const extension = name.split(".").pop()?.trim().toLowerCase();
  return extension && extension !== name.toLowerCase() ? extension : "fișier";
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
