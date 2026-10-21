import type { JobRecord } from '../api/jobRecord';

export const jobRecordFixture: JobRecord = {
  jobId: 'job-1',
  files: [
    { artifactId: 'file-old', originalFileName: 'litere.dxf', mimeType: 'application/dxf', sizeLabel: '1 KB', purpose: 'WORKING', purposeLabel: 'Fișier de lucru', note: null, preview: 'DOWNLOAD', supersedesArtifactId: null, authorLabel: 'Elena', uploadedAt: '2026-10-20T07:00:00Z', downloadHref: '/api/execution-artifacts/file-old/download',
      usages: [{ taskId: 'task-1', taskLabel: '01 · Lipire', linkedAt: '2026-10-20T07:10:00Z', usedAt: '2026-10-20T08:00:00Z', usedByLabel: 'Maria' }] },
    { artifactId: 'file-new', originalFileName: 'litere.dxf', mimeType: 'application/dxf', sizeLabel: '2 KB', purpose: 'WORKING', purposeLabel: 'Fișier de lucru', note: null, preview: 'DOWNLOAD', supersedesArtifactId: 'file-old', authorLabel: 'Elena', uploadedAt: '2026-10-21T07:00:00Z', downloadHref: '/api/execution-artifacts/file-new/download',
      usages: [{ taskId: 'task-2', taskLabel: '02 · Control', linkedAt: '2026-10-21T07:10:00Z', usedAt: null, usedByLabel: null }] },
  ],
  hours: { asOf: '2026-10-21T10:00:00Z', totalLabel: '1 h 15 min', complete: false, completeTasks: 1, applicableTasks: 2, coverageLabel: 'Evidența orelor: parțială', activeSessionCount: 0, provisionalTaskCount: 0, undocumentedTaskCount: 1, idleTaskCount: 0, startedAt: '2026-10-20T08:00:00Z', completedAt: '2026-10-21T09:00:00Z', elapsedLabel: '25 h', activeTimeLabel: '1 h', machineTimeLabel: 'Neînregistrat', machineActive: false,
    people: [{ personId: 'maria', label: 'Maria', timeLabel: '35 min', active: false }, { personId: 'ion', label: 'Ion', timeLabel: '40 min', active: false }],
    tasks: [
      { taskId: 'task-1', processLabel: 'Lipire', scopeLabel: 'Litere', seqLabel: '01', status: 'COMPLETED', statusLabel: 'Finalizat', completedQuantityLabel: 'Realizat: 4 buc', varianceLabel: 'Conform planului', providerLabel: null, externalProviderLabel: null, actualConsumption: [], startedAt: '2026-10-20T08:00:00Z', completedAt: '2026-10-20T09:10:00Z', timeLabel: '1 h 15 min', complete: true, coverageLabel: 'Complet', activeSessionCount: 0, provisional: false, undocumented: false, evidenceGap: null, evidenceGapLabel: null, declaredDurationLabel: null, machineTimeLabel: null,
        people: [{ personId: 'maria', label: 'Maria', timeLabel: '35 min', active: false }, { personId: 'ion', label: 'Ion', timeLabel: '40 min', active: false }],
        sessions: [{ sessionId: 'session-1', personId: 'maria', personLabel: 'Maria', startedAt: '2026-10-20T08:00:00Z', endedAt: '2026-10-20T08:35:00Z', timeLabel: '35 min', endKind: 'LEFT' }, { sessionId: 'session-2', personId: 'ion', personLabel: 'Ion', startedAt: '2026-10-20T08:30:00Z', endedAt: '2026-10-20T09:10:00Z', timeLabel: '40 min', endKind: 'COMPLETED' }] },
      { taskId: 'task-2', processLabel: 'Control', scopeLabel: 'Ansamblu', seqLabel: '02', status: 'COMPLETED', statusLabel: 'Finalizat', completedQuantityLabel: null, varianceLabel: null, providerLabel: null, externalProviderLabel: null, actualConsumption: [], startedAt: '2026-10-21T08:00:00Z', completedAt: '2026-10-21T09:00:00Z', timeLabel: 'Neînregistrat', complete: false, coverageLabel: 'Parțial · timp nedocumentat', activeSessionCount: 0, provisional: false, undocumented: true, evidenceGap: 'NO_INDIVIDUAL_SESSIONS', evidenceGapLabel: 'Operația are pornire sau finalizare înregistrată, dar nicio sesiune individuală.', declaredDurationLabel: '42 min', machineTimeLabel: null, people: [], sessions: [] },
    ],
  },
  timeline: [{ eventId: 'event-1', kind: 'WORK_LEFT', label: 'A ieșit din operație', actorLabel: 'Maria', occurredAt: '2026-10-20T08:35:00Z', taskId: 'task-1', taskLabel: '01 · Lipire', detail: null }],
};
