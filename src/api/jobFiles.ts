import { getJson, postForm } from "./http";

export type JobFile = {
  artifactId: string;
  originalFileName: string;
  sizeLabel: string;
  purpose: string | null;
  purposeLabel: string | null;
  note: string | null;
  preview: string;
  supersedesArtifactId: string | null;
  authorLabel: string | null;
  uploadedAt: string;
  downloadHref: string;
};

export type JobFileArchive = {
  jobId: string;
  files: JobFile[];
  history: Array<{
    eventId: string;
    kind: string;
    actorLabel: string | null;
    occurredAt: string;
  }>;
};

export async function loadJobFiles(jobId: string): Promise<JobFileArchive> {
  const body = (await getJson(`/api/jobs/${encodeURIComponent(jobId)}/files`)) as {
    archive: JobFileArchive;
  };
  return body.archive;
}

export async function uploadJobFile(
  jobId: string,
  file: File,
  options?: { purpose?: string; note?: string; supersedesArtifactId?: string },
): Promise<JobFileArchive> {
  const form = new FormData();
  form.set("file", file);
  if (options?.purpose) {
    form.set("purpose", options.purpose);
  }
  if (options?.note) {
    form.set("note", options.note);
  }
  if (options?.supersedesArtifactId) {
    form.set("supersedesArtifactId", options.supersedesArtifactId);
  }
  const body = (await postForm(`/api/jobs/${encodeURIComponent(jobId)}/files`, form)) as {
    archive: JobFileArchive;
  };
  return body.archive;
}
