import { loadTaskDossier } from "../api/taskDossier";
import { loadJobFiles } from "../api/jobFiles";
import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { AuthenticatedDownloadLink } from "../presentation/AuthenticatedDownloadLink";
import { laterDocumentVersions } from "../presentation/dossierRevision";
import { jobHref } from "../routing/appRoute";

export function JobOperationFiles({ jobId, plan, task, onSelect }: {
  jobId: string;
  plan: ExecutionPlanTransport;
  task: ExecutionTaskTransport | null;
  onSelect: (id: string) => void;
}) {
  const resource = useResource(task ? resourceKeys.taskDossier(task.taskId) : null, () => loadTaskDossier(task?.taskId ?? ""));
  const archive = useResource(resourceKeys.jobFiles(jobId), () => loadJobFiles(jobId));
  const dossier = resource.data?.taskId === task?.taskId ? resource.data : undefined;
  return <SurfacePanel title="Fișierele operației" label="Fișierele operației">
    <div className="job-sheet__file-toolbar">
      <SelectField id="job-files-operation" label="Operație" value={task?.taskId ?? ""} onChange={onSelect} options={plan.tasks.map(item => ({ value: item.taskId, label: `${item.seqLabel} · ${item.processLabel} · ${item.scopeLabel}` }))} />
      {task ? <a className="job-sheet__link-button" href={jobHref(jobId, { taskId: task.taskId, section: "operatii" })}>Deschide dosarul operației</a> : null}
    </div>
    {!task ? <EmptyState title={plan.tasks.length ? "Alege o operație validă din listă." : "Planul nu conține operații."} /> : null}
    {task && !dossier && resource.status !== "error" ? <LoadingFloor variant="facts" label="Se citesc fișierele operației" rows={2} /> : null}
    {resource.status === "error" ? <InlineAlert tone="error" title="Fișierele nu au putut fi actualizate">{dossier ? "Ultima citire rămâne afișată." : "Deschide dosarul operației pentru reîncercare."}</InlineAlert> : null}
    {archive.status === "error" ? <p className="job-sheet__warning">Versiunile din biblioteca lucrării nu au putut fi verificate.</p> : null}
    {dossier?.files.length === 0 ? <EmptyState title="Operația nu are încă fișiere asociate." /> : null}
    {dossier?.files.map(file => <article className="job-sheet__file" key={file.artifactId}>
      <div><strong>{file.purposeLabel ?? file.originalFileName}</strong><p className="job-sheet__secondary">{file.purposeLabel ? `${file.originalFileName} · ` : ""}{file.sizeLabel} · Operația {task?.seqLabel}</p>{file.note ? <p>{file.note}</p> : null}
        {laterDocumentVersions(file.artifactId, [...(dossier.files ?? []), ...(dossier.planFiles ?? []), ...(archive.data?.files ?? [])]).length ? <p className="job-sheet__warning">Există o versiune mai nouă. Fișierul asociat operației rămâne cel afișat. Consultă reviziile în dosarul operației.</p> : null}
      </div>
      <div className="job-sheet__file-action"><AuthenticatedDownloadLink className="job-sheet__link-button" href={file.downloadHref}>Descarcă fișierul</AuthenticatedDownloadLink></div>
    </article>)}
  </SurfacePanel>;
}
