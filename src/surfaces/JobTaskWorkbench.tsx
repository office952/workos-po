import { useEffect, useId, useRef, useState } from "react";
import { TransportError, readTransportErrorCode } from "../api/http";
import { loadJobFiles } from "../api/jobFiles";
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
import type { ExecutionPlanTransport } from "../api/types";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import {
  invalidateResources,
  loadResource,
  readResource,
  writeResource,
} from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOperatorSession } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { formatTimestamp } from "../presentation/format";
import { atelierHref, executionHref } from "../routing/appRoute";
import { useCloudSession } from "../session/CloudSessionContext";
import { readCloudBoundaryVersion } from "../session/sessionExpiryBridge";
import { JobArtifactPreview } from "./JobArtifactPreview";
import "../styles/surfaces/job-task-workbench.css";

type Kind = "observation" | "issue" | "instruction" | "file";
type Composer = { taskId: string; kind: Kind };
type Draft = {
  text: string;
  reason: string;
  file: File | null;
  purpose: string;
  note: string;
  supersedes: string;
  existing: string;
};
const emptyDraft = (): Draft => ({
  text: "",
  reason: "OTHER",
  file: null,
  purpose: "",
  note: "",
  supersedes: "",
  existing: "",
});
const reasons = [
  { value: "MATERIAL", label: "Material" },
  { value: "MACHINE", label: "Utilaj" },
  { value: "DRAWING", label: "Desen / fișier" },
  { value: "QUALITY", label: "Calitate" },
  { value: "OTHER", label: "Altceva" },
];
const purposes = [
  { value: "", label: "Fără scop declarat" },
  { value: "WORKING", label: "Fișier de lucru" },
  { value: "EXECUTION_READY", label: "Pregătit pentru execuție" },
  { value: "TECHNICAL_REFERENCE", label: "Referință tehnică" },
  { value: "EVIDENCE", label: "Dovadă" },
  { value: "RECORD", label: "Evidență" },
];
type Props = {
  jobId: string;
  plan: ExecutionPlanTransport;
  taskId: string | null;
  onSelect: (id: string) => void;
};

export function JobTaskWorkbench(props: Props) {
  const cloud = useCloudSession();
  const operator = useResource(
    resourceKeys.operatorSession(),
    loadOperatorSession,
  );
  const identified = operator.status === "success" && operator.data != null;
  const owner =
    cloud.ready &&
    !cloud.unavailable &&
    (cloud.mode === "single_plane" ||
      cloud.organization?.membershipRole === "owner");
  const scope = JSON.stringify([
    props.jobId,
    cloud.user?.email,
    cloud.organization?.organizationId,
    operator.data?.personId,
    readCloudBoundaryVersion(),
  ]);
  return (
    <JobTaskWorkbenchBody
      key={scope}
      {...props}
      identified={identified}
      canInstruct={owner}
      canWriteFiles={owner || identified}
    />
  );
}

function JobTaskWorkbenchBody({
  jobId,
  plan,
  taskId,
  onSelect,
  identified,
  canInstruct,
  canWriteFiles,
}: Props & {
  identified: boolean;
  canInstruct: boolean;
  canWriteFiles: boolean;
}) {
  const [query, setQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>(
    {},
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [composer, setComposer] = useState<Composer | null>(null);
  const [allFiles, setAllFiles] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    taskId: string;
    error: boolean;
    text: string;
  } | null>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const task = plan.tasks.find((item) => item.taskId === taskId) ?? null;
  const dossierResource = useResource(
    task ? resourceKeys.taskDossier(task.taskId) : null,
    () => loadTaskDossier(task?.taskId ?? ""),
    { staleMs: 0 },
  );
  const dossier =
    dossierResource.data?.taskId === task?.taskId
      ? dossierResource.data
      : undefined;
  const archive = useResource(resourceKeys.jobFiles(jobId), () =>
    loadJobFiles(jobId),
  );
  const files = dossier?.files ?? [];
  const selectedFile =
    files.find((file) => file.artifactId === selectedFiles[taskId ?? ""]) ??
    files[0] ??
    null;
  const shelf = files.slice(0, 3);
  if (
    selectedFile &&
    !shelf.some((file) => file.artifactId === selectedFile.artifactId)
  )
    shelf[shelf.length - 1] = selectedFile;
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("ro-RO");
  const visible = plan.tasks.filter((item) =>
    normalize(
      `${item.seqLabel} ${item.processLabel} ${item.scopeLabel} ${item.assignmentLabel} ${item.executorLabel ?? ""}`,
    ).includes(normalize(query)),
  );
  const groups = new Map<string, typeof visible>();
  for (const item of visible) {
    const scope = item.scopeLabel || "Operații generale";
    groups.set(scope, [...(groups.get(scope) ?? []), item]);
  }
  const currentFeedback = feedback?.taskId === taskId ? feedback : null;
  const captured = plan.tasks.find((item) => item.taskId === composer?.taskId);
  const draftKey = composer ? `${composer.taskId}:${composer.kind}` : "";
  const draft = drafts[draftKey] ?? emptyDraft();
  const notes = [
    ...(dossier?.instructions ?? []),
    ...(dossier?.observations ?? []),
    ...(dossier?.issues ?? []),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const newerVersions =
    archive.data?.files.filter(
      (file) =>
        selectedFile && file.supersedesArtifactId === selectedFile.artifactId,
    ) ?? [];
  const availableFiles =
    archive.data?.files.filter(
      (file) => !files.some((linked) => linked.artifactId === file.artifactId),
    ) ?? [];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        expanded &&
        !document.querySelector("dialog[open]")
      ) {
        setExpanded(false);
        focusButton.current?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [expanded]);

  function chooseTask(next: string) {
    onSelect(next);
    if (window.matchMedia?.("(max-width: 880px)").matches)
      taskHeading.current?.scrollIntoView({ block: "start" });
  }
  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [draftKey]: { ...(current[draftKey] ?? emptyDraft()), ...patch },
    }));
  }
  function openComposer(kind: Kind) {
    if (task) {
      setComposer({ taskId: task.taskId, kind });
      setFeedback(null);
    }
  }
  function chooseFile(next: string) {
    if (taskId) setSelectedFiles((current) => ({ ...current, [taskId]: next }));
    setAllFiles(false);
  }

  async function run(
    boundTaskId: string,
    action: () => Promise<TaskDossier>,
    success: string,
    savedFileId?: string,
    selectUploaded = false,
  ) {
    if (pendingRef.current) return false;
    const previousIds = new Set(
      readResource<TaskDossier>(
        resourceKeys.taskDossier(boundTaskId),
      ).data?.files.map((file) => file.artifactId) ?? [],
    );
    pendingRef.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const next = await action();
      if (!mounted.current) return false;
      invalidateResources(resourceKeys.taskDossier(boundTaskId));
      writeResource(resourceKeys.taskDossier(boundTaskId), next);
      const uploaded = selectUploaded
        ? next.files.filter((file) => !previousIds.has(file.artifactId))
        : [];
      if (uploaded.length === 1)
        setSelectedFiles((current) => ({
          ...current,
          [boundTaskId]: uploaded[0].artifactId,
        }));
      if (savedFileId)
        setSelectedFiles((current) => ({
          ...current,
          [boundTaskId]: savedFileId,
        }));
      invalidateResources(resourceKeys.jobFiles(jobId));
      setFeedback({ taskId: boundTaskId, error: false, text: success });
      return true;
    } catch (error) {
      if (mounted.current)
        setFeedback({
          taskId: boundTaskId,
          error: true,
          text: dossierError(error),
        });
      return false;
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function saveMessage() {
    if (!composer || !captured) return;
    const context = composer,
      text = draft.text.trim(),
      savedKey = draftKey;
    if (!text || text.length > 2000) {
      setFeedback({
        taskId: context.taskId,
        error: true,
        text: "Scrie un mesaj de cel mult 2000 de caractere.",
      });
      return;
    }
    const save =
      context.kind === "issue"
        ? () => reportTaskIssue(context.taskId, draft.reason, text)
        : context.kind === "instruction"
          ? () => addTaskInstruction(context.taskId, text)
          : () => addTaskObservation(context.taskId, text);
    if (
      await run(
        context.taskId,
        save,
        context.kind === "issue"
          ? "Problema a fost semnalată. Starea operației nu s-a schimbat."
          : "Mesajul a fost păstrat în dosarul operației.",
      )
    ) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[savedKey];
        return next;
      });
      setComposer(null);
    }
  }
  async function saveFile() {
    if (!composer || !draft.file) return;
    const context = composer,
      savedKey = draftKey,
      file = draft.file;
    if (!file.size || file.size > 50 * 1024 * 1024) {
      setFeedback({
        taskId: context.taskId,
        error: true,
        text: "Alege un fișier nevid de cel mult 50 MB.",
      });
      return;
    }
    if (
      await run(
        context.taskId,
        () =>
          uploadTaskArtifact(context.taskId, file, {
            purpose: draft.purpose,
            note: draft.note,
            supersedesArtifactId: draft.supersedes,
          }),
        "Fișierul a fost adăugat la operație. Utilizarea se consemnează separat.",
        undefined,
        true,
      )
    ) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[savedKey];
        return next;
      });
      setComposer(null);
    }
  }

  return (
    <section
      className={`job-task-workbench${expanded ? " is-expanded" : ""}`}
      aria-label="Operații și dosarul selectat"
    >
      <section className="job-task-navigator" aria-label="Lista operațiilor">
        <header>
          <div>
            <h2>Operații</h2>
            <span>{plan.tasks.length}</span>
          </div>
          <label className="u-visually-hidden" htmlFor={`${id}-search`}>
            Caută operație sau responsabil
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder="Caută operație sau responsabil…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </header>
        <div className="job-task-navigator__list">
          {[...groups].map(([scope, operations]) => (
            <section key={scope} aria-label={scope}>
              <h3>
                {scope}
                <span>{operations.length}</span>
              </h3>
              {operations.map((item) => {
                const known = readResource<TaskDossier>(
                  resourceKeys.taskDossier(item.taskId),
                ).data;
                return (
                  <button
                    type="button"
                    className="job-task-row"
                    key={item.taskId}
                    aria-pressed={item.taskId === taskId}
                    aria-label={`${item.seqLabel} ${item.processLabel} · ${item.statusLabel} · ${item.assignmentLabel}`}
                    aria-controls={`${id}-context`}
                    onClick={() => chooseTask(item.taskId)}
                  >
                    <span className="job-task-row__seq">{item.seqLabel}</span>
                    <span className="job-task-row__copy">
                      <strong>{item.processLabel}</strong>
                      <small>
                        {item.executorLabel ?? item.assignmentLabel}
                      </small>
                      <span className="job-task-row__state">
                        {item.statusLabel}
                      </span>
                      {known?.taskId === item.taskId ? (
                        <span className="job-task-row__counts">
                          <span>{known.files.length} fișiere</span>
                          {known.observations.length ? (
                            <span>{known.observations.length} observații</span>
                          ) : null}
                          {known.issues.length ? (
                            <span className="job-task-row__issues">
                              ⚑ {known.issues.length} probleme semnalate
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="job-task-row__unknown">
                          Dosar la selectare
                        </span>
                      )}
                    </span>
                    <span className="job-task-row__arrow" aria-hidden="true">
                      ↗
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
          {!visible.length ? (
            <div className="job-workbench__empty">
              <p>Nicio operație pentru căutarea curentă.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => setQuery("")}
              >
                Șterge căutarea
              </button>
            </div>
          ) : null}
        </div>
        <footer>Selecția păstrează căutarea și documentul ales.</footer>
      </section>
      <section
        className="job-task-context"
        id={`${id}-context`}
        aria-label="Operația selectată"
      >
        <div className="job-task-context__kicker">
          <span>Banc de lucru</span>
          <button
            type="button"
            ref={focusButton}
            className="text-link"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Revino la operații ↙" : "Extinde zona ⤢"}
          </button>
        </div>
        {!task ? (
          <div className="job-workbench__empty">
            <h2>Planul nu are operații afișabile.</h2>
            <p>Documentele generale rămân disponibile în fișierele lucrării.</p>
          </div>
        ) : (
          <>
            <header className="job-task-context__header">
              <div>
                <span className="job-workbench__eyebrow">
                  Operația {task.seqLabel} / {task.scopeLabel}
                </span>
                <h2 ref={taskHeading} tabIndex={-1}>
                  {task.processLabel}
                </h2>
                <p>
                  {task.statusLabel} · {task.assignmentLabel}
                  {task.executorLabel ? ` · ${task.executorLabel}` : ""}
                </p>
              </div>
              <div className="job-task-context__actions">
                <a
                  className="job-workbench__primary"
                  href={executionHref(plan.planId, {
                    jobId,
                    taskId: task.taskId,
                  })}
                >
                  Deschide Execuția ↗
                </a>
                <div>
                  <button
                    type="button"
                    className="text-link"
                    disabled={!identified}
                    onClick={() => openComposer("observation")}
                  >
                    Adaugă observație
                  </button>
                  <button
                    type="button"
                    className="text-link job-workbench__issue"
                    disabled={!identified}
                    onClick={() => openComposer("issue")}
                  >
                    Semnalează problemă
                  </button>
                </div>
              </div>
            </header>
            {!identified ? (
              <p className="job-workbench__access">
                Pentru observații și probleme,{" "}
                <a href={atelierHref({ jobId })}>
                  identifică operatorul în Atelier
                </a>
                .
              </p>
            ) : null}
            {!visible.some((item) => item.taskId === taskId) && query ? (
              <p className="job-workbench__notice">
                Operația selectată rămâne deschisă în afara căutării.{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setQuery("")}
                >
                  Arată toate operațiile
                </button>
              </p>
            ) : null}
            {[
              task.startBlockReason,
              task.materialBlockLabel,
              task.externalBlockLabel,
              task.qualityBlockLabel,
            ].filter(Boolean).length ? (
              <div className="job-workbench__warnings">
                {[
                  ...new Set(
                    [
                      task.startBlockReason,
                      task.materialBlockLabel,
                      task.externalBlockLabel,
                      task.qualityBlockLabel,
                    ].filter(Boolean),
                  ),
                ].map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            ) : null}
            {task.waitingFor.length ? (
              <p className="job-workbench__dependencies">
                Așteaptă: {task.waitingFor.join(" · ")}
              </p>
            ) : null}
            {currentFeedback && !composer ? (
              <InlineAlert
                tone={currentFeedback.error ? "error" : "success"}
                title={currentFeedback.error ? "Nu s-a salvat" : "Salvat"}
              >
                {currentFeedback.text}
              </InlineAlert>
            ) : null}
            {dossierResource.status === "error" ? (
              <InlineAlert tone="error" title="Dosarul nu a putut fi citit">
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    void loadResource(
                      resourceKeys.taskDossier(task.taskId),
                      () => loadTaskDossier(task.taskId),
                      { force: true },
                    ).catch(() => {})
                  }
                >
                  Reîncearcă citirea dosarului
                </button>
              </InlineAlert>
            ) : null}
            {!dossier ? (
              <p className="job-workbench__notice" role="status">
                {dossierResource.status === "error"
                  ? "Conținutul dosarului nu este disponibil."
                  : "Se citește dosarul operației…"}
              </p>
            ) : (
              <>
                <details className="job-task-notes">
                  <summary>
                    Observații și probleme{" "}
                    <span>
                      {dossier.observations.length} observații ·{" "}
                      {dossier.issues.length} probleme semnalate
                    </span>
                  </summary>
                  <div>
                    {canInstruct ? (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => openComposer("instruction")}
                      >
                        Adaugă instrucțiune
                      </button>
                    ) : null}
                    {!notes.length ? (
                      <p>Niciun mesaj în dosarul acestei operații.</p>
                    ) : (
                      notes.map((entry) => (
                        <article
                          key={entry.entryId}
                          className="job-task-note"
                          data-issue={entry.kind === "ISSUE_REPORT"}
                        >
                          <header>
                            <strong>
                              {entry.kind === "INSTRUCTION"
                                ? "Instrucțiune"
                                : entry.kind === "ISSUE_REPORT"
                                  ? `Problemă semnalată${entry.reasonLabel ? ` · ${entry.reasonLabel}` : ""}`
                                  : "Observație"}
                            </strong>
                            <span>
                              {entry.authorLabel ?? "Cont organizație"} ·{" "}
                              <time dateTime={entry.createdAt}>
                                {formatTimestamp(entry.createdAt)}
                              </time>
                            </span>
                          </header>
                          <p>{entry.body}</p>
                        </article>
                      ))
                    )}
                  </div>
                </details>
                <section
                  className="job-file-shelf"
                  aria-label="Fișierele operației"
                >
                  <header>
                    <h3>
                      Fișierele operației <span>{files.length}</span>
                    </h3>
                    <div>
                      {files.length > 3 ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => {
                            setFileQuery("");
                            setAllFiles(true);
                          }}
                        >
                          Toate fișierele · {files.length}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-link"
                        disabled={!canWriteFiles}
                        onClick={() => openComposer("file")}
                      >
                        Adaugă fișier +
                      </button>
                    </div>
                  </header>
                  <div className="job-file-shelf__choices">
                    {shelf.map((file) => (
                      <button
                        type="button"
                        key={file.artifactId}
                        aria-pressed={
                          file.artifactId === selectedFile?.artifactId
                        }
                        onClick={() => chooseFile(file.artifactId)}
                      >
                        <span className="job-file-shelf__format">
                          {file.originalFileName
                            .split(".")
                            .pop()
                            ?.toUpperCase()}
                        </span>
                        <span>
                          <strong>{file.originalFileName}</strong>
                          <small>
                            {file.purposeLabel ?? "Fișier de lucru"}
                            {file.usedAt ? " · Utilizare consemnată" : ""}
                          </small>
                        </span>
                      </button>
                    ))}
                    {!files.length ? (
                      <p>
                        Niciun fișier asociat. Poți adăuga un fișier nou sau
                        unul existent la lucrare.
                      </p>
                    ) : null}
                  </div>
                </section>
                {newerVersions.length ? (
                  <p className="job-workbench__revision">
                    Există o versiune ulterioară a documentului selectat:{" "}
                    {newerVersions
                      .map((file) => file.originalFileName)
                      .join(", ")}
                    . Asocierea operației nu se schimbă automat.{" "}
                    <button
                      type="button"
                      className="text-link"
                      disabled={!canWriteFiles}
                      onClick={() => openComposer("file")}
                    >
                      Vezi fișierele disponibile
                    </button>
                  </p>
                ) : null}
                <JobArtifactPreview file={selectedFile} />
                {selectedFile ? (
                  <details className="job-file-details">
                    <summary>Detalii, utilizare și istoric</summary>
                    <dl>
                      <div>
                        <dt>Adăugat</dt>
                        <dd>{formatTimestamp(selectedFile.uploadedAt)}</dd>
                      </div>
                      <div>
                        <dt>Scop declarat</dt>
                        <dd>{selectedFile.purposeLabel ?? "Nespecificat"}</dd>
                      </div>
                      {selectedFile.note ? (
                        <div>
                          <dt>Explicație</dt>
                          <dd>{selectedFile.note}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Utilizare în această operație</dt>
                        <dd>
                          {selectedFile.usedAt
                            ? formatTimestamp(selectedFile.usedAt)
                            : "Neconsemnată"}
                        </dd>
                      </div>
                    </dl>
                    {!selectedFile.usedAt ? (
                      <Button
                        variant="secondary"
                        disabled={!canWriteFiles || pending}
                        onClick={() =>
                          void run(
                            task.taskId,
                            () =>
                              markTaskArtifactUsed(
                                task.taskId,
                                selectedFile.artifactId,
                              ),
                            "Utilizare consemnată pentru această operație.",
                          )
                        }
                      >
                        Am folosit acest fișier
                      </Button>
                    ) : null}
                    <p>
                      Utilizarea este opțională și distinctă de aprobarea
                      tehnică.
                    </p>
                    <ul>
                      {dossier.history.map((event) => (
                        <li key={event.eventId}>
                          {historyLabel(event.kind)} ·{" "}
                          {event.actorLabel ?? "Cont organizație"} ·{" "}
                          {formatTimestamp(event.occurredAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
      {allFiles ? (
        <CreationDialog
          title="Fișierele operației"
          onDismiss={() => setAllFiles(false)}
        >
          <div className="job-workbench-dialog">
            <TextField
              id={`${id}-file-search`}
              label="Caută fișier"
              value={fileQuery}
              onChange={setFileQuery}
            />
            {files
              .filter((file) =>
                normalize(file.originalFileName).includes(normalize(fileQuery)),
              )
              .map((file) => (
                <button
                  type="button"
                  className="job-workbench-dialog__file"
                  key={file.artifactId}
                  onClick={() => chooseFile(file.artifactId)}
                >
                  <strong>{file.originalFileName}</strong>
                  <span>{file.purposeLabel ?? file.sizeLabel}</span>
                </button>
              ))}
          </div>
        </CreationDialog>
      ) : null}
      {composer && captured ? (
        <CreationDialog
          title={
            composer.kind === "file"
              ? "Adaugă fișier la operație"
              : composer.kind === "instruction"
                ? "Adaugă instrucțiune"
                : composer.kind === "issue"
                  ? "Semnalează problemă"
                  : "Adaugă observație"
          }
          busy={pending}
          onDismiss={() => setComposer(null)}
        >
          <div className="job-workbench-dialog">
            <p className="job-workbench-dialog__context">
              {captured.seqLabel} · {captured.processLabel} /{" "}
              {captured.scopeLabel}
            </p>
            {feedback?.taskId === composer.taskId ? (
              <InlineAlert
                tone={feedback.error ? "error" : "success"}
                title={feedback.error ? "Nu s-a salvat" : "Salvat"}
              >
                {feedback.text}
              </InlineAlert>
            ) : null}
            {composer.kind === "file" ? (
              <>
                {availableFiles.length ? (
                  <div className="job-workbench-dialog__section">
                    <SelectField
                      id={`${id}-existing`}
                      label="Fișier existent la lucrare"
                      value={draft.existing}
                      onChange={(existing) => updateDraft({ existing })}
                      options={[
                        { value: "", label: "Alege fișierul" },
                        ...availableFiles.map((file) => ({
                          value: file.artifactId,
                          label: file.originalFileName,
                        })),
                      ]}
                    />
                    <Button
                      variant="secondary"
                      disabled={pending || !draft.existing}
                      onClick={() =>
                        void run(
                          composer.taskId,
                          () =>
                            linkTaskArtifact(composer.taskId, draft.existing),
                          "Fișier asociat. Utilizarea se consemnează separat.",
                          draft.existing,
                        ).then((saved) => {
                          if (saved) setComposer(null);
                        })
                      }
                    >
                      Asociază cu operația
                    </Button>
                  </div>
                ) : null}
                {archive.status === "error" ? (
                  <p role="status">
                    Fișierele generale nu au putut fi citite. Poți reîncerca din
                    arhiva lucrării.
                  </p>
                ) : null}
                <form
                  className="job-workbench-dialog__section"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveFile();
                  }}
                >
                  <label htmlFor={`${id}-upload`}>
                    Fișier nou · cel mult 50 MB
                  </label>
                  <input
                    id={`${id}-upload`}
                    type="file"
                    disabled={pending}
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.dxf,.dwg,.cdr,.nc,.tap,.gcode"
                    onChange={(event) =>
                      updateDraft({ file: event.target.files?.[0] ?? null })
                    }
                  />
                  {draft.file ? <p>{draft.file.name}</p> : null}
                  <SelectField
                    id={`${id}-purpose`}
                    label="Scop, opțional"
                    value={draft.purpose}
                    options={purposes}
                    onChange={(purpose) => updateDraft({ purpose })}
                  />
                  <p>Scopul declarat nu constituie o aprobare tehnică.</p>
                  <TextField
                    id={`${id}-file-note`}
                    label="Explicație, opțională"
                    value={draft.note}
                    onChange={(note) => updateDraft({ note })}
                  />
                  <SelectField
                    id={`${id}-supersedes`}
                    label="Versiune nouă pentru, opțional"
                    value={draft.supersedes}
                    options={[
                      { value: "", label: "Fișier nou, nu o versiune" },
                      ...(archive.data?.files ?? []).map((file) => ({
                        value: file.artifactId,
                        label: file.originalFileName,
                      })),
                    ]}
                    onChange={(supersedes) => updateDraft({ supersedes })}
                  />
                  <Button type="submit" disabled={pending || !draft.file}>
                    Încarcă fișierul
                  </Button>
                </form>
              </>
            ) : (
              <form
                className="job-workbench-dialog__section"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveMessage();
                }}
              >
                {composer.kind === "issue" ? (
                  <SelectField
                    id={`${id}-reason`}
                    label="Motiv"
                    value={draft.reason}
                    options={reasons}
                    onChange={(reason) => updateDraft({ reason })}
                  />
                ) : null}
                <label htmlFor={`${id}-message`}>
                  {composer.kind === "instruction"
                    ? "Instrucțiune"
                    : composer.kind === "issue"
                      ? "Descrierea problemei"
                      : "Observație"}
                </label>
                <textarea
                  id={`${id}-message`}
                  value={draft.text}
                  maxLength={2000}
                  disabled={pending}
                  onChange={(event) =>
                    updateDraft({ text: event.target.value })
                  }
                />
                {composer.kind === "issue" ? (
                  <p>Semnalarea nu schimbă automat starea operației.</p>
                ) : null}
                <Button type="submit" disabled={pending || !draft.text.trim()}>
                  Salvează mesajul
                </Button>
              </form>
            )}
            <p className="job-workbench-dialog__draft">
              Ciorna se păstrează pentru această operație până părăsești fișa
              sau schimbi sesiunea.
            </p>
          </div>
        </CreationDialog>
      ) : null}
    </section>
  );
}

function dossierError(error: unknown): string {
  if (!(error instanceof TransportError))
    return "Salvarea nu a fost confirmată. Ciorna este păstrată. Verifică dosarul înainte de a retrimite.";
  const code = readTransportErrorCode(error.body);
  if (code === "invalid_session")
    return "Identifică operatorul în Atelier înainte de a salva mesajul.";
  if (code === "forbidden")
    return "Nu ai dreptul să efectuezi această acțiune.";
  if (code === "invalid_text")
    return "Textul trebuie să aibă între 1 și 2000 de caractere.";
  if (code === "invalid_file") return "Formatul fișierului nu este permis.";
  if (code === "file_too_large") return "Fișierul depășește limita de 50 MB.";
  if (code === "artifact_scope")
    return "Fișierul nu aparține acestei lucrări sau operații.";
  return "Dosarul nu a putut fi actualizat. Ciorna este păstrată.";
}
function historyLabel(kind: string): string {
  const labels: Record<string, string> = {
    INSTRUCTION_ADDED: "Instrucțiune adăugată",
    OBSERVATION_ADDED: "Observație adăugată",
    ISSUE_REPORTED: "Problemă semnalată",
    ARTIFACT_ADDED: "Fișier adăugat",
    ARTIFACT_UPLOADED: "Fișier încărcat",
    ARTIFACT_LINKED: "Fișier asociat",
    ARTIFACT_MARKED_USED: "Utilizare consemnată",
  };
  return labels[kind] ?? "Actualizare dosar";
}
