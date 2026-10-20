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
import { laterDocumentVersions } from "../presentation/dossierRevision";
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
type TaskDraft = {
  observation: string;
  instruction: string;
  issueText: string;
  issueReason: string;
  file: File | null;
  filePurpose: string;
  fileNote: string;
  supersedes: string;
};

function emptyTaskDraft(): TaskDraft {
  return {
    observation: "",
    instruction: "",
    issueText: "",
    issueReason: "MATERIAL",
    file: null,
    filePurpose: "",
    fileNote: "",
    supersedes: "",
  };
}

export function TaskDossierPanel({
  taskId,
  taskLabel = "această operație",
  canInstruct,
  operatorIdentified = true,
  canWriteFiles = true,
  sessionScope = "",
}: {
  taskId: string;
  taskLabel?: string;
  canInstruct: boolean;
  operatorIdentified?: boolean;
  canWriteFiles?: boolean;
  sessionScope?: string;
}) {
  const [dossier, setDossier] = useState<TaskDossier | null>(null);
  const [loadError, setLoadError] = useState<"none" | "initial" | "stale" | "session" | "forbidden">("none");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedByTask, setSelectedByTask] = useState<Record<string, string | null>>({});
  const [draftScope, setDraftScope] = useState(sessionScope);
  const [drafts, setDrafts] = useState<Record<string, TaskDraft>>({});
  const [notices, setNotices] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const dossierRef = useRef(dossier);
  const taskIdRef = useRef(taskId);
  useEffect(() => {
    dossierRef.current = dossier;
  }, [dossier]);
  taskIdRef.current = taskId;
  const scopeRef = useRef(sessionScope);
  scopeRef.current = sessionScope;
  const draft = drafts[taskId] ?? emptyTaskDraft();
  const observation = draft.observation;
  const instruction = draft.instruction;
  const issueText = draft.issueText;
  const issueReason = draft.issueReason;
  const file = draft.file;
  const filePurpose = draft.filePurpose;
  const fileNote = draft.fileNote;
  const notice = notices[taskId] ?? null;
  const actionError = errors[taskId] ?? null;
  const selectedArtifactId = selectedByTask[taskId] ?? null;
  function patchDraft(task: string, patch: Partial<TaskDraft>): void {
    setDrafts((current) => ({
      ...current,
      [task]: { ...(current[task] ?? emptyTaskDraft()), ...patch },
    }));
  }
  const [composer, setComposer] = useState<Composer>(null);
  if (draftScope !== sessionScope) {
    setDraftScope(sessionScope);
    setDrafts({});
    setNotices({});
    setErrors({});
    setSelectedByTask({});
    setComposer(null);
  }
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const pending = pendingTaskId === taskId;
  const fileInputId = useId();

  useEffect(() => {
    let cancelled = false;
    void loadTaskDossier(taskId)
      .then((next) => {
        if (!cancelled && next.taskId === taskId) {
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
        setLoadError(dossierRef.current?.taskId === taskId ? "stale" : "initial");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey, sessionScope]);

  const current = dossier?.taskId === taskId ? dossier : null;
  const previewFile =
    current?.files.find((item) => item.artifactId === selectedArtifactId) ??
    current?.planFiles.find((item) => item.artifactId === selectedArtifactId) ??
    null;
  const laterVersions = laterDocumentVersions(selectedArtifactId, [
    ...(current?.files ?? []),
    ...(current?.planFiles ?? []),
  ]);
  async function run(action: () => Promise<TaskDossier>, success: string): Promise<boolean> {
    const started = taskId;
    const startedScope = sessionScope;
    setPendingTaskId(started);
    setErrors((existing) => ({ ...existing, [started]: null }));
    setNotices((existing) => ({ ...existing, [started]: null }));
    try {
      const next = await action();
      const accepted = next.taskId === started;
      if (accepted && taskIdRef.current === started && scopeRef.current === startedScope) {
        setDossier(next);
        setNotices((existing) => ({ ...existing, [started]: success }));
        setComposer(null);
      }
      return accepted && scopeRef.current === startedScope;
    } catch (error) {
      if (taskIdRef.current === started && scopeRef.current === startedScope) {
        setErrors((existing) => ({ ...existing, [started]: presentDossierError(error) }));
      }
      return false;
    } finally {
      setPendingTaskId((active) => (active === started ? null : active));
    }
  }

  function openComposer(next: Composer) {
    setComposer(next);
    setErrors((existing) => ({ ...existing, [taskId]: null }));
    setNotices((existing) => ({ ...existing, [taskId]: null }));
  }

  return (
    <aside className="task-dossier" aria-label="Dosar tehnic">
      <section className="task-dossier__messages" aria-label="Mesaje pentru această operație">
      <p className="task-dossier__eyebrow">Dosarul operației</p>
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
          className="task-dossier__problem"
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
            const started = taskId;
            void run(() => addTaskObservation(started, observation), "Observația a fost adăugată.").then(
              (saved) => {
                if (saved) {
                  patchDraft(started, { observation: "" });
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
            onChange={(value) => patchDraft(taskId, { observation: value })}
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
            const started = taskId;
            void run(
              () => addTaskInstruction(started, instruction),
              "Instrucțiunea a fost publicată.",
            ).then((saved) => {
              if (saved) {
                patchDraft(started, { instruction: "" });
              }
            });
          }}
        >
          <TextField
            id={`${fileInputId}-instruction`}
            label="Instrucțiune tehnică"
            value={instruction}
            onChange={(value) => patchDraft(taskId, { instruction: value })}
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
            const started = taskId;
            const reason = issueReason;
            void run(
              () => reportTaskIssue(started, reason, issueText),
              "Problema a fost semnalată. Starea operației nu s-a schimbat.",
            ).then((saved) => {
              if (saved) {
                patchDraft(started, { issueText: "" });
              }
            });
          }}
        >
          <SelectField
            id={`${fileInputId}-reason`}
            label="Motiv"
            value={issueReason}
            options={ISSUE_REASONS}
            onChange={(value) => patchDraft(taskId, { issueReason: value })}
          />
          <TextField
            id={`${fileInputId}-issue`}
            label="Descriere"
            value={issueText}
            onChange={(value) => patchDraft(taskId, { issueText: value })}
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
            const started = taskId;
            const selected = file;
            const purpose = filePurpose;
            const note = fileNote;
            void run(
              () => uploadTaskArtifact(started, selected, { purpose, note, supersedesArtifactId: draft.supersedes || undefined }),
              "Fișierul a fost păstrat în dosar. Starea operației nu s-a schimbat.",
            ).then((saved) => {
              if (saved) {
                patchDraft(started, { file: null, filePurpose: "", fileNote: "", supersedes: "" });
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
                patchDraft(taskId, { file: dropped });
              }
            }}
          >
            <label className="field" htmlFor={fileInputId}>
              <span className="field__label">Fișier</span>
              <input
                key={taskId}
                id={fileInputId}
                className="field__control"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.dxf,.dwg,.cdr,.nc,.tap,.gcode"
                onChange={(event) => patchDraft(taskId, { file: event.currentTarget.files?.[0] ?? null })}
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
            onChange={(value) => patchDraft(taskId, { filePurpose: value })}
          />
          <SelectField
            id={`${fileInputId}-supersedes`}
            label="Versiune nouă pentru, opțional"
            value={draft.supersedes}
            options={[{ value: "", label: "Fișier nou" }, ...Array.from(new Map([...(current?.files ?? []), ...(current?.planFiles ?? [])].map(item => [item.artifactId, item])).values()).map(item => ({ value: item.artifactId, label: item.originalFileName }))]}
            onChange={(supersedes) => patchDraft(taskId, { supersedes })}
          />
          <TextField
            id={`${fileInputId}-note`}
            label="Explicație, opțională"
            value={fileNote}
            onChange={(value) => patchDraft(taskId, { fileNote: value })}
          />
          <Button type="submit" disabled={pending || !file}>
            Încarcă fișierul
          </Button>
        </form>
      ) : null}
      {current ? (
        <div className="task-dossier__body">
          <DossierSection title="Instrucțiuni" empty={null}>
            {current.instructions.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} />
            ))}
          </DossierSection>
          <DossierSection title="Fișierele operației" empty="Nu sunt fișiere asociate acestei operații.">
            {current.files.map((item) => (
              <FileRow
                key={item.artifactId}
                file={item}
                pending={pending}
                canWrite={canWriteFiles}
                selected={item.artifactId === selectedArtifactId}
                onSelect={() => setSelectedByTask((existing) => ({ ...existing, [taskId]: item.artifactId }))}
                onMarkUsed={() =>
                  void run(
                    () => markTaskArtifactUsed(taskId, item.artifactId),
                    "Fișierul a fost marcat ca utilizat la execuție.",
                  )
                }
              />
            ))}
          </DossierSection>
          {previewFile ? <JobArtifactPreview file={previewFile} /> : null}
          {current.planFiles.some((item) => !item.linkedToTask) ? (
            <DossierSection title="Fișierele generale ale lucrării" empty={null}>
              {current.planFiles
                .filter((item) => !item.linkedToTask)
                .map((item) => (
                  <div key={item.artifactId}>
                    <FileRow
                      file={item}
                      selected={item.artifactId === selectedArtifactId}
                      onSelect={() =>
                        setSelectedByTask((existing) => ({ ...existing, [taskId]: item.artifactId }))
                      }
                    />
                    <Button
                      variant="ghost"
                      disabled={pending || !canWriteFiles}
                      onClick={() =>
                        void run(
                          () => linkTaskArtifact(taskId, item.artifactId),
                          "Fișierul a fost asociat acestei operații.",
                        )
                      }
                    >
                      Asociază operației
                    </Button>
                    {!canWriteFiles ? <p className="ui-note">{fileAccessExplanation(false)}</p> : null}
                  </div>
                ))}
            </DossierSection>
          ) : null}
          <DossierSection title="Observații" empty={null}>
            {current.observations.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} />
            ))}
          </DossierSection>
          <DossierSection title="Probleme semnalate" empty={null}>
            {current.issues.map((entry) => (
              <DossierNote key={entry.entryId} entry={entry} problem />
            ))}
          </DossierSection>
          <details className="task-dossier__archive" aria-label="Istoricul operației">
            <summary>Istoricul operației</summary>
            {current.history.length === 0 ? (
              <p className="task-dossier__meta">Nu există evenimente în dosarul acestei operații.</p>
            ) : (
              current.history.map((event) => (
                <p key={event.eventId} className="task-dossier__history">
                  <span>{historyLabel(event.kind)}</span>
                  <span>{event.actorLabel ?? "Cont organizație"}</span>
                  <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
                </p>
              ))
            )}
          </details>
          {laterVersions.length > 0 ? (
            <p className="job-workbench__revision">
              Există o versiune ulterioară a documentului selectat:{" "}
              {laterVersions.map((item) => item.originalFileName).join(", ")}. Asocierea și
              utilizarea rămân la documentul deschis.{" "}
              {laterVersions.map((item) => (
                <span key={item.artifactId}>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      setSelectedByTask((existing) => ({ ...existing, [taskId]: item.artifactId }))
                    }
                  >
                    Deschide {item.originalFileName}
                  </button>{" "}
                </span>
              ))}
            </p>
          ) : null}
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
  canWrite = true,
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
  canWrite?: boolean;
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
        <>
          <Button variant="ghost" disabled={pending || !canWrite} onClick={onMarkUsed}>
            Marchează utilizat la execuție
          </Button>
          {!canWrite ? <p className="ui-note">{fileAccessExplanation(false)}</p> : null}
        </>
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
