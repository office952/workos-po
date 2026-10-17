import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TransportError, readTransportErrorCode } from "../api/http";
import {
  addTaskInstruction,
  addTaskObservation,
  linkTaskArtifact,
  loadTaskDossier,
  markTaskArtifactUsed,
  reportTaskIssue,
  uploadTaskArtifact,
  type TaskDossier,
} from "../api/taskDossier";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import { AuthenticatedDownloadLink } from "../presentation/AuthenticatedDownloadLink";
import {
  fileAccessExplanation,
  instructionAccessExplanation,
  observationAccessExplanation,
} from "../presentation/dossierAccess";
import { formatTimestamp } from "../presentation/format";
import { JobArtifactPreview } from "./JobArtifactPreview";

const ISSUE_REASONS = [
  { value: "MATERIAL", label: "Material" },
  { value: "MACHINE", label: "Utilaj" },
  { value: "DRAWING", label: "Desen / fișier" },
  { value: "QUALITY", label: "Calitate" },
  { value: "OTHER", label: "Altceva" },
];

const FILE_PURPOSES = [
  { value: "", label: "Fără scop declarat" },
  { value: "WORKING", label: "Fișier de lucru" },
  { value: "EXECUTION_READY", label: "Pregătit pentru execuție" },
  { value: "TECHNICAL_REFERENCE", label: "Referință tehnică" },
  { value: "EVIDENCE", label: "Dovadă" },
  { value: "RECORD", label: "Evidență" },
];

type Composer = "observation" | "file" | "issue" | "instruction" | null;

export function TaskDossierPanel({
  taskId,
  taskLabel = "această operație",
  canInstruct,
  operatorIdentified = true,
  canWriteFiles = true,
}: {
  taskId: string;
  taskLabel?: string;
  canInstruct: boolean;
  operatorIdentified?: boolean;
  canWriteFiles?: boolean;
}) {
  const [dossier, setDossier] = useState<TaskDossier | null>(null);
  const [loadError, setLoadError] = useState<"none" | "initial" | "stale" | "session" | "forbidden">("none");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const dossierRef = useRef(dossier);
  useEffect(() => {
    dossierRef.current = dossier;
  }, [dossier]);
  const [composer, setComposer] = useState<Composer>(null);
  const [observation, setObservation] = useState("");
  const [instruction, setInstruction] = useState("");
  const [issueText, setIssueText] = useState("");
  const [issueReason, setIssueReason] = useState("MATERIAL");
  const [file, setFile] = useState<File | null>(null);
  const [filePurpose, setFilePurpose] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputId = useId();

  useEffect(() => {
    let cancelled = false;
    void loadTaskDossier(taskId)
      .then((next) => {
        if (!cancelled) {
          setDossier(next);
          setLoadError("none");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const code = error instanceof TransportError ? readTransportErrorCode(error.body) : null;
        if (code === "invalid_session") {
          setLoadError("session");
          return;
        }
        if (code === "forbidden") {
          setLoadError("forbidden");
          return;
        }
        setLoadError(dossierRef.current ? "stale" : "initial");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  const hasContent = Boolean(
    dossier &&
      (dossier.instructions.length > 0 ||
        dossier.observations.length > 0 ||
        dossier.issues.length > 0 ||
        dossier.files.length > 0 ||
        dossier.planFiles.some((item) => !item.linkedToTask) ||
        dossier.history.length > 0),
  );

  async function run(action: () => Promise<TaskDossier>, success: string): Promise<boolean> {
    setPending(true);
    setActionError(null);
    setNotice(null);
    try {
      const next = await action();
      setDossier(next);
      setNotice(success);
      setComposer(null);
      setPending(false);
      return true;
    } catch (error) {
      setPending(false);
      setActionError(presentDossierError(error));
      return false;
    }
  }

  function openComposer(next: Composer) {
    setComposer(next);
    setActionError(null);
    setNotice(null);
  }

  return (
    <aside className="task-dossier" aria-label="Dosar tehnic">
      <section className="task-dossier__messages" aria-label="Mesaje pentru această operație">
      <h3>Mesaje pentru {taskLabel}</h3>
      <div className="task-dossier__actions">
        <Button
          variant="secondary"
          disabled={pending || !operatorIdentified}
          onClick={() => openComposer("observation")}
        >
          Adaugă observație
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !operatorIdentified}
          onClick={() => openComposer("issue")}
        >
          Semnalează problemă
        </Button>
        <Button
          variant="ghost"
          disabled={pending || !canInstruct}
          onClick={() => openComposer("instruction")}
        >
          Adaugă instrucțiune
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !canWriteFiles}
          onClick={() => openComposer("file")}
        >
          Adaugă fișier
        </Button>
      </div>
      {!operatorIdentified ? <p className="ui-note">{observationAccessExplanation()}</p> : null}
      {!canInstruct ? <p className="ui-note">{instructionAccessExplanation()}</p> : null}
      {!canWriteFiles ? <p className="ui-note">{fileAccessExplanation(false)}</p> : null}
      </section>
      {notice ? (
        <InlineAlert tone="success" title="Salvat">
          {notice}
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert tone="error" title="Nu s-a salvat">
          {actionError}
        </InlineAlert>
      ) : null}
      {loadError === "initial" ? (
        <InlineAlert tone="error" title="Dosarul nu a putut fi citit">
          <button type="button" className="text-link" onClick={() => setReloadKey((value) => value + 1)}>
            Reîncearcă citirea
          </button>
        </InlineAlert>
      ) : null}
      {loadError === "stale" ? (
        <InlineAlert tone="error" title="Actualizarea dosarului a eșuat">
          Ultima citire rămâne afișată.{" "}
          <button type="button" className="text-link" onClick={() => setReloadKey((value) => value + 1)}>
            Reîncearcă
          </button>
        </InlineAlert>
      ) : null}
      {loadError === "session" ? (
        <InlineAlert tone="error" title="Sesiune expirată">
          Identifică din nou operatorul în Atelier. Dosarul afișat nu a fost rescris.
        </InlineAlert>
      ) : null}
      {loadError === "forbidden" ? (
        <InlineAlert tone="error" title="Lipsă permisiuni">
          Nu ai dreptul să citești acest dosar. Nu se afișează date vechi drept actualizate.
        </InlineAlert>
      ) : null}
      {composer === "observation" ? (
        <form
          className="task-dossier__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => addTaskObservation(taskId, observation), "Observația a fost adăugată.").then(
              (saved) => {
                if (saved) {
                  setObservation("");
                }
              },
            );
          }}
        >
          <p className="ui-note">Mesaj pentru {taskLabel}.</p>
          <TextField
            id={`${fileInputId}-observation`}
            label="Observație"
            value={observation}
            onChange={setObservation}
          />
          <Button type="submit" disabled={pending || observation.trim().length === 0}>
            Salvează observația
          </Button>
        </form>
      ) : null}
      {composer === "instruction" ? (
        <form
          className="task-dossier__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => addTaskInstruction(taskId, instruction),
              "Instrucțiunea a fost publicată.",
            ).then((saved) => {
              if (saved) {
                setInstruction("");
              }
            });
          }}
        >
          <TextField
            id={`${fileInputId}-instruction`}
            label="Instrucțiune tehnică"
            value={instruction}
            onChange={setInstruction}
          />
          <Button type="submit" disabled={pending || instruction.trim().length === 0}>
            Publică instrucțiunea
          </Button>
        </form>
      ) : null}
      {composer === "issue" ? (
        <form
          className="task-dossier__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => reportTaskIssue(taskId, issueReason, issueText),
              "Problema a fost semnalată. Starea operației nu s-a schimbat.",
            ).then((saved) => {
              if (saved) {
                setIssueText("");
              }
            });
          }}
        >
          <SelectField
            id={`${fileInputId}-reason`}
            label="Motiv"
            value={issueReason}
            options={ISSUE_REASONS}
            onChange={setIssueReason}
          />
          <TextField
            id={`${fileInputId}-issue`}
            label="Descriere"
            value={issueText}
            onChange={setIssueText}
          />
          <Button type="submit" disabled={pending || issueText.trim().length === 0}>
            Semnalează
          </Button>
        </form>
      ) : null}
      {composer === "file" ? (
        <form
          className="task-dossier__composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!file) {
              return;
            }
            const selected = file;
            const purpose = filePurpose;
            const note = fileNote;
            void run(
              () => uploadTaskArtifact(taskId, selected, { purpose, note }),
              "Fișierul a fost păstrat în dosar. Starea operației nu s-a schimbat.",
            ).then((saved) => {
              if (saved) {
                setFile(null);
                setFilePurpose("");
                setFileNote("");
              }
            });
          }}
        >
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
            value={filePurpose}
            options={FILE_PURPOSES}
            onChange={setFilePurpose}
          />
          <TextField
            id={`${fileInputId}-note`}
            label="Explicație, opțională"
            value={fileNote}
            onChange={setFileNote}
          />
          <Button type="submit" disabled={pending || !file}>
            Încarcă fișierul
          </Button>
        </form>
      ) : null}
      {hasContent && dossier ? (
        <div className="task-dossier__body">
          <DossierSection title="Instrucțiuni" empty={null}>
            {dossier.instructions.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} />
            ))}
          </DossierSection>
          <DossierSection title="Fișierele operației" empty={null}>
            {dossier.files.map((item) => (
              <FileRow
                key={item.artifactId}
                file={item}
                pending={pending}
                selected={item.artifactId === selectedArtifactId}
                onSelect={() => setSelectedArtifactId(item.artifactId)}
                onMarkUsed={() =>
                  void run(
                    () => markTaskArtifactUsed(taskId, item.artifactId),
                    "Fișierul a fost marcat ca utilizat la execuție.",
                  )
                }
              />
            ))}
          </DossierSection>
          {dossier.planFiles.some((item) => !item.linkedToTask) ? (
            <DossierSection title="Fișierele generale ale lucrării" empty={null}>
              {dossier.planFiles
                .filter((item) => !item.linkedToTask)
                .map((item) => (
                  <div key={item.artifactId} className="task-dossier__file">
                    <FileRow file={item} />
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        void run(
                          () => linkTaskArtifact(taskId, item.artifactId),
                          "Fișierul a fost asociat acestei operații.",
                        )
                      }
                    >
                      Asociază operației
                    </Button>
                  </div>
                ))}
            </DossierSection>
          ) : null}
          <DossierSection title="Observații" empty={null}>
            {dossier.observations.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} />
            ))}
          </DossierSection>
          <DossierSection title="Probleme semnalate" empty={null}>
            {dossier.issues.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} problem />
            ))}
          </DossierSection>
          <section aria-label="Istoricul operației">
            <h3>Istoricul operației</h3>
            {dossier.history.length === 0 ? (
              <p className="task-dossier__meta">Nu există evenimente în dosarul acestei operații.</p>
            ) : (
              dossier.history.map((event) => (
                <p key={event.eventId} className="task-dossier__history">
                  <span>{historyLabel(event.kind)}</span>
                  <span>{event.actorLabel ?? "Cont organizație"}</span>
                  <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
                </p>
              ))
            )}
          </section>
          <JobArtifactPreview
            file={dossier.files.find((item) => item.artifactId === selectedArtifactId) ?? null}
          />
        </div>
      ) : null}
    </aside>
  );
}

function DossierSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string | null;
  children: ReactNode;
}) {
  const list = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (list.length === 0) {
    return empty ? (
      <section>
        <h3>{title}</h3>
        <p>{empty}</p>
      </section>
    ) : null;
  }
  return (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DossierNote({
  entry,
  problem = false,
}: {
  entry: { body: string; authorLabel: string | null; createdAt: string; reasonLabel: string | null };
  problem?: boolean;
}) {
  return (
    <article className={problem ? "task-dossier__note task-dossier__note--problem" : "task-dossier__note"}>
      {problem && entry.reasonLabel ? <p className="task-dossier__reason">{entry.reasonLabel}</p> : null}
      <p>{entry.body}</p>
      <p className="task-dossier__meta">
        {entry.authorLabel ?? "Cont organizație"} · {formatTimestamp(entry.createdAt)}
      </p>
    </article>
  );
}

function FileRow({
  file,
  pending = false,
  selected = false,
  onSelect,
  onMarkUsed,
}: {
  file: {
    originalFileName: string;
    sizeLabel: string;
    preview: string;
    downloadHref: string;
    mimeType: string;
    purposeLabel: string | null;
    note: string | null;
    usedAt: string | null;
  };
  pending?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onMarkUsed?: () => void;
}) {
  const extension = fileExtension(file.originalFileName);
  return (
    <article className="task-dossier__file">
      <button type="button" className="text-link" aria-pressed={selected} onClick={onSelect}>
        {file.originalFileName}
      </button>
      <AuthenticatedDownloadLink href={file.downloadHref}>
        Descarcă originalul
      </AuthenticatedDownloadLink>
      <p className="task-dossier__meta">
        {extension} · {file.sizeLabel}
        {file.purposeLabel ? ` · ${file.purposeLabel}` : ""}
        {file.usedAt ? " · Utilizat la execuție" : ""}
      </p>
      {file.note ? <p>{file.note}</p> : null}
      {file.preview !== "IMAGE" && extension !== "pdf" && extension !== "txt" ? (
        <p className="task-dossier__meta">Previzualizarea nativă nu este disponibilă. Descarcă originalul.</p>
      ) : null}
      {onMarkUsed && !file.usedAt ? (
        <Button variant="ghost" disabled={pending} onClick={onMarkUsed}>
          Marchează utilizat la execuție
        </Button>
      ) : null}
    </article>
  );
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

function historyLabel(kind: string): string {
  switch (kind) {
    case "INSTRUCTION_ADDED":
      return "Instrucțiune";
    case "OBSERVATION_ADDED":
      return "Observație";
    case "ISSUE_REPORTED":
      return "Problemă semnalată";
    case "ARTIFACT_UPLOADED":
      return "Fișier încărcat";
    case "ARTIFACT_LINKED":
      return "Fișier asociat";
    case "ARTIFACT_MARKED_USED":
      return "Fișier marcat utilizat";
    case "PROVIDER_AUTO_BOUND":
      return "Utilaj asociat automat";
    default:
      return "Eveniment";
  }
}

function presentDossierError(error: unknown): string {
  const code = error instanceof TransportError ? readTransportErrorCode(error.body) : null;
  switch (code) {
    case "invalid_session":
      return "Sesiunea de operator a expirat sau lipsește. Ultima citire rămâne afișată.";
    case "invalid_file":
      return "Fișierul nu este într-un format permis.";
    case "file_too_large":
      return "Fișierul depășește limita permisă.";
    case "invalid_text":
      return "Textul este gol sau prea lung.";
    case "forbidden":
      return "Nu ai dreptul pentru această acțiune. Ultima citire rămâne afișată.";
    default:
      return "Actualizarea a eșuat. Ultima citire rămâne afișată, iar textul introdus a rămas aici.";
  }
}
