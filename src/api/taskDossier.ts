import { getJson, postForm, postJson } from "./http";

export type DossierEntry = {
  entryId: string;
  kind: string;
  body: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  authorLabel: string | null;
  createdAt: string;
};

export type DossierFile = {
  artifactId: string;
  originalFileName: string;
  mimeType: string;
  sizeLabel: string;
  category: string;
  preview: string;
  uploadedAt: string;
  downloadHref: string;
  linkedToTask: boolean;
  authorLabel?: string | null;
};

export type DossierHistoryEvent = {
  eventId: string;
  kind: string;
  actorLabel: string | null;
  occurredAt: string;
  detail: Record<string, string | null>;
};

export type TaskDossier = {
  taskId: string;
  instructions: DossierEntry[];
  observations: DossierEntry[];
  issues: DossierEntry[];
  files: DossierFile[];
  planFiles: DossierFile[];
  history: DossierHistoryEvent[];
};

export async function loadTaskDossier(taskId: string): Promise<TaskDossier> {
  const body = (await getJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/dossier`)) as {
    dossier: TaskDossier;
  };
  return body.dossier;
}

export async function addTaskObservation(taskId: string, text: string): Promise<TaskDossier> {
  const body = (await postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/observations`, {
    text,
  })) as { dossier: TaskDossier };
  return body.dossier;
}

export async function addTaskInstruction(taskId: string, text: string): Promise<TaskDossier> {
  const body = (await postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/instructions`, {
    text,
  })) as { dossier: TaskDossier };
  return body.dossier;
}

export async function reportTaskIssue(
  taskId: string,
  reason: string,
  text: string,
): Promise<TaskDossier> {
  const body = (await postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/issues`, {
    reason,
    text,
  })) as { dossier: TaskDossier };
  return body.dossier;
}

export async function uploadTaskArtifact(taskId: string, file: File): Promise<TaskDossier> {
  const form = new FormData();
  form.set("file", file);
  const body = (await postForm(
    `/api/execution-tasks/${encodeURIComponent(taskId)}/artifacts`,
    form,
  )) as { dossier: TaskDossier };
  return body.dossier;
}

export async function linkTaskArtifact(taskId: string, artifactId: string): Promise<TaskDossier> {
  const body = (await postJson(
    `/api/execution-tasks/${encodeURIComponent(taskId)}/artifact-links`,
    { artifactId },
  )) as { dossier: TaskDossier };
  return body.dossier;
}
