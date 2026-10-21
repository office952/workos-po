import { getJson } from './http';

export type WorkPerson = { personId: string; label: string; timeLabel: string; active: boolean };
export type WorkSession = { sessionId: string; personId: string; personLabel: string; startedAt: string; endedAt: string | null; timeLabel: string; endKind: string | null };
export type WorkHoursTask = { taskId: string; processLabel: string; scopeLabel: string; seqLabel: string; status: string;
  startedAt: string | null; completedAt: string | null; timeLabel: string; complete: boolean; coverageLabel: string;
  qualityLabel?: string | null; statusLabel: string; completedQuantityLabel: string | null; varianceLabel: string | null; providerLabel: string | null; externalProviderLabel: string | null;
  plannedQuantity?: { value: number; unit: string } | null; plannedConsumption?: { resourceLabel: string; quantity: number; unit: string }[];
  actualConsumption: { resourceLabel: string; actualQuantity: number; unit: string }[];
  declaredDurationLabel: string | null; machineTimeLabel: string | null; people: WorkPerson[]; sessions: WorkSession[];
  /** Additive evidence projection; absent on older servers. Open sessions and canonical gaps are independent. */
  activeSessionCount?: number; provisional?: boolean; undocumented?: boolean;
  evidenceGap?: 'UNTRACKED_START' | 'NO_INDIVIDUAL_SESSIONS' | null; evidenceGapLabel?: string | null };
export type JobRecordFile = { artifactId: string; originalFileName: string; mimeType: string; sizeLabel: string;
  purpose: string | null; purposeLabel: string | null; note: string | null; preview: string; supersedesArtifactId: string | null;
  authorLabel: string | null; uploadedAt: string; downloadHref: string;
  usages: { taskId: string; taskLabel: string; linkedAt: string; usedAt: string | null; usedByLabel: string | null }[] };
export type JobRecord = { jobId: string; files: JobRecordFile[];
  hours: { asOf: string; totalLabel: string; complete: boolean; completeTasks: number; applicableTasks: number;
    coverageLabel: string; startedAt: string | null; completedAt: string | null; elapsedLabel: string;
    activeTimeLabel: string; machineTimeLabel: string; machineActive: boolean; people: WorkPerson[]; tasks: WorkHoursTask[];
    activeSessionCount?: number; provisionalTaskCount?: number; undocumentedTaskCount?: number; idleTaskCount?: number } | null;
  timeline: { eventId: string; kind: string; label: string; actorLabel: string | null; occurredAt: string;
    taskId: string | null; taskLabel: string | null; detail: string | null }[] };

export async function loadJobRecord(jobId: string): Promise<JobRecord | null> {
  const body = await getJson('/api/jobs/' + encodeURIComponent(jobId) + '/record') as { record?: JobRecord };
  if (body.record?.jobId !== jobId) throw new Error('invalid_job_record');
  return body.record;
}
