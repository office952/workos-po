import { useEffect, useState, useRef } from 'react';
import { presentJobProduction } from '../adapters/jobAdapter';
import { loadJobRecord } from '../api/jobRecord';
import { patchJobPlanning, postJobProduction } from '../api/jobs';
import { TransportError, readTransportReasons } from '../api/http';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { LoadingFloor } from '../components/LoadingFloor';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { resourceKeys } from '../data/resourceKeys';
import { invalidateAfterCreateExecutionPlan, invalidateAfterProductionRelease } from '../data/invalidation';
import { invalidateResources } from '../data/resourceCache';
import { loadExecutionPlan, loadJobDetail, loadOperatorSession } from '../data/routeLoaders';
import { useResource } from '../data/useResource';
import { PageRegion } from '../layout/PageRegion';
import { canPublishInstructions } from '../presentation/dossierAccess';
import { presentJobSheetTitle, presentJobSheetSecondary } from '../presentation/jobSheetIdentity';
import { atelierHref, canonicalJobSection, jobHref, quoteHref, type JobSheetSectionInput } from '../routing/appRoute';
import { navigate } from '../routing/navigate';
import { useCloudSession } from '../session/CloudSessionContext';
import { readCloudBoundaryVersion } from '../session/sessionExpiryBridge';
import { JobRecordView } from './JobRecordView';
import { JobMaterialPreparation } from './JobMaterialPreparation';
import { SiteInstallationContextPanel } from './SiteInstallationContextPanel';
import { TaskDossierPanel } from './TaskDossierPanel';
import '../styles/surfaces/job-sheet.css';

type Props = { jobId: string; taskId?: string | null; section?: JobSheetSectionInput };
export function JobDetailPage({ jobId, taskId = null, section }: Props) {
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const cloud = useCloudSession();
  const owner = canPublishInstructions(cloud);
  const session = useResource(resourceKeys.operatorSession(), loadOperatorSession);
  const jobResource = useResource(resourceKeys.job(jobId), () => loadJobDetail(jobId));
  const job = jobResource.data?.job ?? null;
  const planId = jobResource.data?.planId ?? null;
  const planResource = useResource(planId ? resourceKeys.executionPlan(planId) : null, () => loadExecutionPlan(planId ?? ''));
  const report = useResource(job ? resourceKeys.jobRecord(jobId) : null, () => loadJobRecord(jobId));
  const selectedTask = planResource.data?.tasks.find(t => t.taskId === taskId) ?? null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [priorityDraft, setPriorityDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState(jobId);
  if (draftScope !== jobId) { setDraftScope(jobId); setPriorityDraft(null); setTargetDraft(null); setError(null); setNotice(null); }
  const priority = priorityDraft ?? job?.priority ?? 'STANDARD';
  const targetDate = targetDraft ?? job?.targetDate ?? '';
  const sourceHref = job?.kind === 'ASSEMBLY' ? jobResource.data?.quoteHref : jobResource.data?.quoteSnapshotId
    ? quoteHref(job?.productCode ?? '', jobResource.data.quoteSnapshotId) : null;
  const secondary = job ? presentJobSheetSecondary(job) : null;
  const finished = job?.stage === 'EXECUTION_COMPLETED';
  useEffect(() => {
    if (!report.data || !section || taskId) return;
    const value = canonicalJobSection(section);
    const id = value === 'documente' ? 'fisiere' : value === 'operatii' ? 'ore' : value === 'rezultate' ? 'rezultate' : null;
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
  }, [report.data, section, taskId]);
  const selectedTaskId = selectedTask?.taskId;
  useEffect(() => {
    if (!selectedTaskId) return;
    selectedHeading.current?.scrollIntoView?.({ block: 'start' });
    selectedHeading.current?.focus({ preventScroll: true });
  }, [selectedTaskId]);
  async function sendToProduction() {
    if (!job || pending) return;
    setPending(true); setError(null);
    try {
      if (!presentJobProduction(await postJobProduction(jobId))) throw new Error('production_not_confirmed');
      invalidateAfterCreateExecutionPlan(jobId); invalidateResources(resourceKeys.jobRecord(jobId)); navigate(jobHref(jobId));
    } catch (e) { setError(e instanceof TransportError ? readTransportReasons(e.body).join(' ') || 'Lucrarea nu a putut fi trimisă în producție.' : 'Lucrarea nu a putut fi trimisă în producție.'); }
    finally { setPending(false); }
  }
  async function savePlanning() {
    if (!job?.planningEditable || pending) return;
    setPending(true); setError(null); setNotice(null);
    try {
      await patchJobPlanning(jobId, { priority, targetDate: targetDate.trim() || null });
      setPriorityDraft(null); setTargetDraft(null); setNotice('Prioritatea și termenul au fost salvate.'); invalidateAfterProductionRelease(jobId);
    } catch { setError('Prioritatea și termenul nu au putut fi salvate.'); }
    finally { setPending(false); }
  }
  const operationHref = (id: string) => jobHref(jobId, { taskId: id, section: 'operatii' });
  const operationDetail = selectedTask ? <section className="job-sheet__selected-operation" aria-label="Dosarul operației selectate"><h2 ref={selectedHeading} tabIndex={-1}>{selectedTask.seqLabel} · {selectedTask.processLabel}</h2><p>{selectedTask.scopeLabel} · {selectedTask.statusLabel}</p><a className="job-sheet__link-button" href={atelierHref({ jobId, planId, taskId: selectedTask.taskId })}>Deschide operația în Atelier</a><TaskDossierPanel taskId={selectedTask.taskId} taskLabel={selectedTask.seqLabel + ' ' + selectedTask.processLabel} canInstruct={owner} operatorIdentified={Boolean(session.data)} canWriteFiles={owner || Boolean(session.data)} sessionScope={[planId, cloud.user?.email, cloud.organization?.organizationId, readCloudBoundaryVersion(), session.data?.personId].join('|')}/></section> : null;
  return <PageRegion><div className="job-sheet" data-surface="job-detail">
    <header className="job-sheet__header"><a className="job-sheet__back" href="/lucrari">← Lucrări</a>
      <div className="job-sheet__identity-row"><div className="job-sheet__identity"><p className="job-sheet__eyebrow">Fișa lucrării</p><h1>{job ? presentJobSheetTitle(job) : 'Lucrare'}</h1><p>{job?.customerDisplayName ?? 'Se citește lucrarea.'}{secondary ? ' · ' + secondary : ''}</p></div>
        <div className="job-sheet__header-action">{job ? <strong>{finished ? 'Producție finalizată' : job.stageLabel}</strong> : null}<Button variant="secondary" onClick={() => window.print()}>Tipărește fișa</Button>{planId && !finished ? <a className="job-sheet__link-button" href={atelierHref({ jobId, planId, taskId })}>Deschide în Atelier</a> : null}</div></div>
      {job ? <div className="job-sheet__planning"><span>Prioritate: {job.priorityLabel}</span><span>Termen: {job.targetDateLabel}</span><span>{job.progressLabel}</span>
        {job.planningEditable ? <details className="job-sheet__planning-editor"><summary>Modifică prioritatea și termenul</summary><form onSubmit={e => { e.preventDefault(); void savePlanning(); }}><SelectField id="job-priority" label="Prioritate" value={priority} options={[{ value: "STANDARD", label: "Standard" }, { value: "HIGH", label: "Ridicată" }, { value: "URGENT", label: "Urgentă" }]} onChange={setPriorityDraft}/><TextField id="job-target" label="Termen" value={targetDate} onChange={setTargetDraft}/><Button type="submit" disabled={pending}>Salvează</Button></form></details> : null}</div> : null}
      {finished ? <p>Producția este finalizată. Livrarea și montajul nu sunt confirmate de această stare.</p> : null}
      {job?.attentionLabel ? <p className="job-sheet__warning">{job.attentionLabel}</p> : null}
      {job && !planId && owner ? <Button disabled={pending} onClick={() => void sendToProduction()}>{pending ? 'Se pregătește producția…' : 'Trimite în producție'}</Button> : null}
      {error ? <InlineAlert tone="error" title="Acțiunea nu a fost finalizată">{error}</InlineAlert> : null}{notice ? <p role="status">{notice}</p> : null}
    </header>
    <div className="job-sheet__body job-record-body">
      {jobResource.status === 'error' ? <InlineAlert tone="error" title="Lucrarea nu a putut fi citită">Reîncearcă deschiderea fișei.</InlineAlert> : null}
      {!job && jobResource.status !== 'error' ? <LoadingFloor variant="traveler" label="Se citește lucrarea"/> : null}
      {report.status === 'error' ? <InlineAlert tone="error" title="Dosarul nu a putut fi actualizat">{report.data ? 'Ultima citire rămâne afișată.' : 'Fișierele, orele și istoricul sunt indisponibile.'}<Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(jobId))}>Reîncearcă</Button></InlineAlert> : null}
      {job && report.status !== 'error' && !report.data ? <LoadingFloor variant="facts" label="Se citesc fișierele, orele și istoricul"/> : null}
      <JobRecordView key={jobId} record={report.data ?? null} canWriteFiles={owner || Boolean(session.data)} operationHref={operationHref} operationDetail={operationDetail}/>
      {planResource.status === 'error' ? <InlineAlert tone="error" title="Operațiile nu au putut fi citite">Drepturile și detaliile operațiilor nu sunt disponibile.</InlineAlert> : null}
      {taskId && planResource.status === 'success' && !selectedTask ? <InlineAlert tone="error" title="Operația nu există în această lucrare">Linkul nu a fost înlocuit cu altă operație.</InlineAlert> : null}
      {job ? <section id="materiale" aria-label="Materialele lucrării"><JobMaterialPreparation jobId={jobId} returnTo={jobHref(jobId)}/></section> : null}
      {jobResource.data?.siteInstallation ? <SiteInstallationContextPanel context={jobResource.data.siteInstallation}/> : null}
      {job ? <section className="job-sheet__panel" id="sursa" aria-label="Sursa comercială"><h2>Sursă comercială acceptată</h2>{sourceHref ? <a href={sourceHref}>{job.kind === 'ASSEMBLY' ? 'Deschide ansamblul sursă' : 'Deschide oferta sursă'}</a> : <p>Legătura către sursă nu este disponibilă.</p>}</section> : null}
    </div>
  </div></PageRegion>;
}
