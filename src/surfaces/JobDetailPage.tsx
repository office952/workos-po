import { useEffect, useRef, useState, type ReactNode } from 'react';
import { presentJobProduction } from '../adapters/jobAdapter';
import { loadJobRecord } from '../api/jobRecord';
import { patchJobPlanning, postJobProduction } from '../api/jobs';
import { TransportError, readTransportReasons } from '../api/http';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { LoadingFloor } from '../components/LoadingFloor';
import { SelectField } from '../components/SelectField';
import { resourceKeys } from '../data/resourceKeys';
import { invalidateAfterCreateExecutionPlan, invalidateAfterProductionRelease } from '../data/invalidation';
import { invalidateResources } from '../data/resourceCache';
import { loadExecutionPlan, loadJobDetail, loadOperatorSession } from '../data/routeLoaders';
import { useResource } from '../data/useResource';
import { PageRegion } from '../layout/PageRegion';
import { canPublishInstructions } from '../presentation/dossierAccess';
import { presentJobSheetTitle, presentJobSheetSecondary, presentJobSheetStage } from '../presentation/jobSheetIdentity';
import { atelierHref, canonicalJobSection, jobHref, quoteHref, type JobSheetSection, type JobSheetSectionInput } from '../routing/appRoute';
import { navigate } from '../routing/navigate';
import { currentEntryKey } from '../routing/navigationMemory';
import { originBack } from '../routing/originBack';
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard';
import { useCloudSession } from '../session/CloudSessionContext';
import { readCloudBoundaryVersion } from '../session/sessionExpiryBridge';
import { JobRecordDates } from './jobRecord/JobRecordDates';
import { JobDeadlineField } from './jobRecord/JobDeadlineField';
import { JobFileViewer } from './jobRecord/JobFileViewer';
import { JobContextTrail } from './jobRecord/JobContextTrail';
import { JobRecordFiles } from './jobRecord/JobRecordFiles';
import { associatedVersion, fileVersions } from './jobRecord/fileVersions';
import { JobSheetNav } from './jobRecord/JobSheetNav';
import { JobRecordView } from './JobRecordView';
import { TaskDossierPanel } from './TaskDossierPanel';
import '../styles/surfaces/job-sheet.css';

type Props = { jobId: string; taskId?: string | null; section?: JobSheetSectionInput; fileId?: string | null };

function activeSection(section: JobSheetSectionInput | undefined, taskId: string | null): JobSheetSection {
  if (section) return canonicalJobSection(section);
  return taskId ? 'operatii' : 'situatie';
}

export function JobDetailPage({ jobId, taskId = null, section, fileId = null }: Props) {
  const cloud = useCloudSession();
  const owner = canPublishInstructions(cloud);
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const jobResource = useResource(resourceKeys.job(jobId), () => loadJobDetail(jobId));
  const job = jobResource.data?.job ?? null;
  const planId = jobResource.data?.planId ?? null;
  const planResource = useResource(planId ? resourceKeys.executionPlan(planId) : null, () => loadExecutionPlan(planId ?? ''));
  const report = useResource(job ? resourceKeys.jobRecord(jobId) : null, () => loadJobRecord(jobId));
  const selectedTask = planResource.data?.tasks.find(task => task.taskId === taskId) ?? null;
  const [memory, setMemory] = useState<{ jobId: string; taskId: string | null }>({ jobId, taskId: null });
  if (memory.jobId !== jobId) setMemory({ jobId, taskId: selectedTask?.taskId ?? null });
  else if (selectedTask && memory.taskId !== selectedTask.taskId) setMemory({ jobId, taskId: selectedTask.taskId });
  const pinned = planResource.data?.tasks.find(task => task.taskId === memory.taskId) ?? null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  // N-022 · a half-typed date in the calendar control: never saved, never read as "no deadline".
  const [targetIncomplete, setTargetIncomplete] = useState(false);
  const [draftScope, setDraftScope] = useState(jobId);
  if (draftScope !== jobId) { setDraftScope(jobId); setPriorityDraft(null); setTargetDraft(null); setTargetIncomplete(false); setError(null); setNotice(null); setPlanningError(null); }
  const priority = priorityDraft ?? job?.priority ?? 'STANDARD';
  const targetDate = targetDraft ?? job?.targetDate ?? '';
  const sourceHref = job?.kind === 'ASSEMBLY' ? jobResource.data?.quoteHref : jobResource.data?.quoteSnapshotId
    ? quoteHref(job?.productCode ?? '', jobResource.data.quoteSnapshotId) : null;
  const secondary = job ? presentJobSheetSecondary(job) : null;
  const finished = job?.stage === 'EXECUTION_COMPLETED';
  const active = activeSection(section, taskId);
  const sessionScope = [planId, cloud.user?.email, cloud.organization?.organizationId, readCloudBoundaryVersion(), session.data?.personId].join('|');
  const dossier: ReactNode = pinned ? <TaskDossierPanel key={sessionScope} taskId={pinned.taskId} taskLabel={`${pinned.seqLabel} ${pinned.processLabel}`} canInstruct={owner} operatorIdentified={Boolean(session.data)} canWriteFiles={owner || Boolean(session.data)} sessionScope={sessionScope} recordMode openFileId={fileId} onOpenFile={openFile} /> : null;
  async function sendToProduction() {
    if (!job || pending || finished) return;
    setPending(true); setError(null);
    try {
      if (!presentJobProduction(await postJobProduction(jobId))) throw new Error('production_not_confirmed');
      invalidateAfterCreateExecutionPlan(jobId); invalidateResources(resourceKeys.jobRecord(jobId)); navigate(jobHref(jobId));
    } catch (reason) { setError(reason instanceof TransportError ? readTransportReasons(reason.body).join(' ') || 'Lucrarea nu a putut fi trimisă în producție.' : 'Lucrarea nu a putut fi trimisă în producție.'); }
    finally { setPending(false); }
  }
  async function savePlanning(): Promise<boolean> {
    if (!job?.planningEditable || pending || finished || targetIncomplete) return false;
    setPending(true); setPlanningError(null); setNotice(null);
    try {
      await patchJobPlanning(jobId, { priority, targetDate: targetDate.trim() || null });
      setPriorityDraft(null); setTargetDraft(null); setTargetIncomplete(false); setNotice('Prioritatea și termenul au fost salvate.'); invalidateAfterProductionRelease(jobId);
      return true;
    } catch { setPlanningError('Prioritatea și termenul nu au putut fi salvate.'); return false; }
    finally { setPending(false); }
  }
  // N-018 · drafts that differ from the saved planning hold navigation behind one question.
  const planningDirty = Boolean(job?.planningEditable && !finished && ((priorityDraft !== null && priorityDraft !== job.priority) || (targetDraft !== null && targetDraft.trim() !== (job.targetDate ?? '')) || targetIncomplete));
  function discardPlanning() { setPriorityDraft(null); setTargetDraft(null); setTargetIncomplete(false); setPlanningError(null); }
  const unsavedGuard = useUnsavedChangesGuard({ dirty: planningDirty, subject: 'Prioritatea și termenul', save: savePlanning, onDiscard: discardPlanning });
  // N-018 · an operation opened from the register pushes one entry; switching replaces it and
  // closing goes back to that entry (or replaces it after a direct link or a refresh).
  const taskEntry = useRef<string | null>(null);
  function openTask(id: string) {
    const first = !selectedTask;
    navigate(jobHref(jobId, { taskId: id, section: 'operatii' }), first ? 'push' : 'replace');
    if (first) taskEntry.current = currentEntryKey();
  }
  function closeTask() {
    // Back only when the reader is still on the entry the operation pushed.
    if (taskEntry.current && taskEntry.current === currentEntryKey()) {
      taskEntry.current = null;
      window.history.back();
      return;
    }
    taskEntry.current = null;
    navigate(jobHref(jobId, { section: 'operatii' }), 'replace');
  }
  const operationOpen = active === 'operatii' && Boolean(selectedTask);
  // N-018 · the way back names the real origin and returns to that exact entry (with its scroll);
  // after a direct link it is the job list.
  const back = originBack({ href: '/lucrari', label: 'Lucrări' });
  // N-018 · the viewer: the first file opened pushes one entry, another version or file replaces
  // it, closing goes back (or replaces after a direct link or a refresh). Expanding is local.
  const headerRef = useRef<HTMLElement>(null);
  const fileEntry = useRef<string | null>(null);
  const fileOpener = useRef<HTMLElement | null>(null);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  // When the viewer closes (button, Esc or browser Back), focus returns to the control that
  // opened it; after a direct link or a refresh there is none, so it goes to the operation title.
  const shownFile = useRef(fileId);
  useEffect(() => {
    const previous = shownFile.current;
    shownFile.current = fileId;
    if (!previous || fileId) return;
    setViewerExpanded(false);
    const opener = fileOpener.current;
    fileOpener.current = null;
    if (opener?.isConnected) {
      opener.focus();
      if (document.activeElement === opener) return;
    }
    document.querySelector<HTMLElement>('.job-record__operation-detail h3')?.focus();
  }, [fileId]);
  function openFile(id: string) {
    const first = !fileId;
    if (first && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) fileOpener.current = document.activeElement;
    navigate(jobHref(jobId, { section: active, taskId: active === 'operatii' ? selectedTask?.taskId : null, fileId: id }), first ? 'push' : 'replace');
    if (first) fileEntry.current = currentEntryKey();
  }
  function closeFile() {
    setViewerExpanded(false);
    if (fileEntry.current && fileEntry.current === currentEntryKey()) {
      fileEntry.current = null;
      window.history.back();
      return;
    }
    fileEntry.current = null;
    navigate(jobHref(jobId, { section: active, taskId: active === 'operatii' ? selectedTask?.taskId : null }), 'replace');
  }
  const recordFiles = report.data?.files ?? [];
  const chain = fileId ? fileVersions(recordFiles, fileId) : [];
  const anchor = associatedVersion(chain, selectedTask?.taskId ?? null)?.artifactId ?? fileId;
  const viewer = fileId && report.data && operationOpen && selectedTask ? <JobFileViewer
    files={recordFiles}
    fileId={fileId}
    anchorId={anchor ?? fileId}
    contextLabel={`Pentru operația ${selectedTask.seqLabel}`}
    expanded={viewerExpanded}
    onSwitch={openFile}
    onToggleExpand={() => setViewerExpanded((value) => !value)}
    onClose={closeFile}
  /> : null;
  const planningPanel = job?.planningEditable && !finished ? <section className="job-planning" data-dirty={planningDirty || undefined} aria-labelledby="job-planning-title">
    <header><h3 id="job-planning-title">Prioritatea și termenul</h3>{planningDirty ? <span className="job-planning__dirty">Modificări nesalvate</span> : null}</header>
    <form onSubmit={event => { event.preventDefault(); void savePlanning(); }}>
      <SelectField id="job-priority" label="Prioritate" value={priority} options={[{ value: 'STANDARD', label: 'Standard' }, { value: 'HIGH', label: 'Ridicată' }, { value: 'URGENT', label: 'Urgentă' }]} onChange={setPriorityDraft}/>
      <JobDeadlineField id="job-target" value={targetDate} incomplete={targetIncomplete} savedLabel={job.targetDateLabel} disabled={pending} onChange={(value, incomplete) => { setTargetDraft(value); setTargetIncomplete(incomplete); }}/>
      <div className="job-planning__actions">
        <Button type="submit" disabled={pending || !planningDirty || targetIncomplete}>{pending ? 'Se salvează…' : 'Salvează'}</Button>
        <Button variant="secondary" disabled={pending || !planningDirty} onClick={discardPlanning}>Renunță la modificări</Button>
      </div>
    </form>
    <p className="job-planning__hint">Cât timp există modificări nesalvate, secțiunile, revenirea și Atelierul cer confirmarea plecării.</p>
    {planningError ? <InlineAlert tone="error" title="Salvarea a eșuat">{planningError}<Button variant="secondary" disabled={pending} onClick={() => void savePlanning()}>Reîncearcă salvarea</Button></InlineAlert> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section> : null;
  const operationHref = (id: string) => jobHref(jobId, { taskId: id, section: 'operatii' });
  // N-018 · Atelier offers the way back to this sheet, on the same section and operation.
  const sheetReturn = jobHref(jobId, { section: active, taskId: selectedTask?.taskId });
  return <PageRegion><div className="job-sheet" data-surface="job-detail" data-section={active}>
    <header className="job-sheet__header" ref={headerRef}><div className="job-sheet__context"><a className="job-sheet__back" href={back.href} onClick={back.onClick}>{back.text}</a>{job ? <JobContextTrail job={job} requestId={jobResource.data?.requestId ?? job.requestId ?? null} quoteSnapshotId={jobResource.data?.quoteSnapshotId ?? null} sourceHref={sourceHref ?? null} operationLabel={operationOpen && selectedTask ? `Operația ${selectedTask.seqLabel}` : null} /> : null}</div>
      <div className="job-sheet__identity-row"><div className="job-sheet__identity"><p className="job-sheet__eyebrow">Fișa lucrării</p><h1>{job ? presentJobSheetTitle(job) : 'Lucrare'}</h1><p>{job?.customerDisplayName ?? 'Se citește lucrarea.'}{secondary ? ' · ' + secondary : ''}</p></div>
        <div className="job-sheet__header-action"><Button variant="secondary" onClick={() => window.print()}>Tipărește fișa</Button>{planId && !finished && !operationOpen ? <a className="job-sheet__link-button" href={atelierHref({ jobId, planId, returnTo: sheetReturn })}>Deschide lucrarea în Atelier</a> : null}</div></div>
      {job ? <div className="job-sheet__planning"><strong className="job-sheet__state">{presentJobSheetStage(job)}</strong><span>Prioritate: {job.priorityLabel}</span><span>Termen: {job.targetDateLabel}</span><span>{job.progressLabel}</span>
        {job.planningEditable && !finished && active !== 'date' ? <a className="job-sheet__planning-link" href={jobHref(jobId, { section: 'date' })}>Modifică în Date lucrare</a> : null}</div> : null}
      {finished ? <p className="job-sheet__completion-note">Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p> : null}
      {job && !planId && owner && !finished ? <Button disabled={pending} onClick={() => void sendToProduction()}>{pending ? 'Se pregătește producția…' : 'Trimite în producție'}</Button> : null}
      {error ? <InlineAlert tone="error" title="Acțiunea nu a fost finalizată">{error}</InlineAlert> : null}
    </header>
    <JobSheetNav jobId={jobId} taskId={taskId} active={active} headerRef={headerRef} identity={job ? [presentJobSheetTitle(job), presentJobSheetStage(job), operationOpen && selectedTask ? `Operația ${selectedTask.seqLabel}` : null].filter(Boolean).join(' · ') : null} />
    <div className="job-sheet__body job-record-body">
      {jobResource.status === 'error' ? <InlineAlert tone="error" title="Lucrarea nu a putut fi citită">Reîncearcă deschiderea fișei.</InlineAlert> : null}
      {!job && jobResource.status !== 'error' ? <LoadingFloor variant="traveler" label="Se citește lucrarea"/> : null}
      {report.status === 'error' ? <InlineAlert tone="error" title="Dosarul nu a putut fi actualizat">{report.data ? 'Ultima citire rămâne afișată.' : 'Fișierele, orele și istoricul sunt indisponibile.'}<Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(jobId))}>Reîncearcă</Button></InlineAlert> : null}
      {job && report.status !== 'error' && !report.data ? <LoadingFloor variant="facts" label="Se citesc fișierele, orele și istoricul"/> : null}
      <JobRecordView
        section={active}
        record={report.data ?? null}
        productionFinished={finished}
        summaryContext={job ? { statusLabel: presentJobSheetStage(job), progressLabel: job.progressLabel, attentionLabel: finished ? null : job.attentionLabel } : undefined}
        canWriteFiles={owner || Boolean(session.data)}
        operationHref={operationHref}
        selectedTaskId={selectedTask?.taskId ?? null}
        selectedLabel={selectedTask ? `${selectedTask.seqLabel} · ${selectedTask.processLabel}` : null}
        invalidTask={Boolean(taskId) && planResource.status === 'success' && !selectedTask}
        planUnavailable={planResource.status === 'error'}
        workspaceHref={selectedTask && planId && !finished ? atelierHref({ jobId, planId, taskId: selectedTask.taskId, returnTo: sheetReturn }) : null}
        onOpenTask={openTask}
        onCloseTask={closeTask}
        dossier={dossier}
        viewer={viewer}
        viewerExpanded={viewerExpanded}
        files={report.data ? <JobRecordFiles record={report.data} canWriteFiles={owner || Boolean(session.data)} operationHref={operationHref} openFileId={active === 'fisiere' ? fileId : null} onOpenFile={openFile} onCloseFile={closeFile} /> : null}
        dates={job ? <JobRecordDates planning={planningPanel} jobId={jobId} returnTo={jobHref(jobId, { section: 'date', taskId })} consultation={finished} site={jobResource.data?.siteInstallation ?? null} sourceHref={sourceHref ?? null} sourceLabel={job.kind === 'ASSEMBLY' ? 'Deschide ansamblul sursă' : 'Deschide oferta sursă'} /> : null}
      />
    </div>
  </div>{unsavedGuard}</PageRegion>;
}
