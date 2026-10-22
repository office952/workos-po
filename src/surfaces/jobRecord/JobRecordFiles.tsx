import { moment } from './format';
import { useRef, useState } from 'react';
import type { JobRecord, JobRecordFile } from '../../api/jobRecord';
import { AuthenticatedDownloadLink } from '../../presentation/AuthenticatedDownloadLink';
import { JobArtifactPreview } from '../JobArtifactPreview';
import { JobFilesPanel } from '../JobFilesPanel';
import { Button } from '../../components/Button';
import { resourceKeys } from '../../data/resourceKeys';
import { invalidateResources } from '../../data/resourceCache';
import { Heading, RecordIcon } from './presentation';

function fileMatchesQuery(file: JobRecordFile, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('ro');
  return [file.originalFileName, file.purposeLabel, ...file.usages.map(u => u.taskLabel)]
    .join(' ').toLocaleLowerCase('ro').includes(normalized);
}

export function JobRecordFiles({ record, canWriteFiles, operationHref }: { record: JobRecord; canWriteFiles: boolean; operationHref: (id: string) => string }) {
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fileButtons = useRef(new Map<string, HTMLButtonElement>());
  const fileDetail = useRef<HTMLElement>(null);
  const file = record.files.find(f => f.artifactId === selected) ?? null;
  const files = record.files.filter(f => fileMatchesQuery(f, query));
  function searchFiles(value: string) {
    setQuery(value);
    if (file && !fileMatchesQuery(file, value)) setSelected(null);
  }
  function openFile(f: JobRecordFile) {
    if (!fileMatchesQuery(f, query)) setQuery('');
    setSelected(f.artifactId);
    setTimeout(() => fileDetail.current?.focus(), 0);
  }
  return <section id="fisiere" className="job-record__section" aria-label="Fișierele lucrării">
      <header><div><Heading icon="file">Fișierele lucrării</Heading><p>Versiunile păstrate și operațiile în care au fost declarate folosite.</p></div>{canWriteFiles ? <Button variant="secondary" aria-expanded={uploading} onClick={() => setUploading(v => !v)}>{uploading ? 'Închide încărcarea' : 'Adaugă fișier'}</Button> : null}</header>
      {uploading && canWriteFiles ? <JobFilesPanel jobId={record.jobId} uploadOnly onUploaded={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}/> : null}
      <label className="job-record__search">Caută fișier sau operație<input type="search" value={query} onChange={e => searchFiles(e.target.value)}/></label>
      {files.length ? <table className="job-record__table job-record__files"><caption className="u-visually-hidden">Fișiere, utilizări și autorii înregistrărilor</caption><thead><tr><th>Fișier / revizie</th><th>Unde a fost folosit</th><th>Încărcat de / când</th><th>Consultare</th></tr></thead><tbody>{files.map(f => <tr key={f.artifactId} data-selected={file?.artifactId === f.artifactId}>
        <td data-label="Fișier / revizie"><strong>{f.originalFileName}</strong><p>{f.sizeLabel} · {f.purposeLabel ?? 'Scop nedeclarat'}</p><p>{f.supersedesArtifactId ? 'Revizie nouă · versiunea anterioară rămâne păstrată' : 'Fișier inițial'}</p></td>
        <td data-label="Unde a fost folosit">{f.usages.length ? f.usages.map(u => <div key={u.taskId} className="job-record__use"><a href={operationHref(u.taskId)}>{u.taskLabel}</a><p><RecordIcon kind={u.usedAt ? 'check' : 'link'}/>{u.usedAt ? 'Utilizare înregistrată' : 'Asociat · utilizare neconfirmată'}</p>{u.usedAt ? <p>{u.usedByLabel ?? 'Autor neînregistrat'} · {moment(u.usedAt)}</p> : null}</div>) : <p>Asociat lucrării · fără utilizare înregistrată pe operații</p>}</td>
        <td data-label="Încărcat de / când">{f.authorLabel ?? 'Cont organizație'}<p>{moment(f.uploadedAt)}</p></td><td data-label="Consultare"><button type="button" ref={n => { if (n) fileButtons.current.set(f.artifactId, n); }} onClick={() => openFile(f)}>Utilizări și versiuni →</button></td>
      </tr>)}</tbody></table> : <p>{record.files.length ? 'Niciun fișier în această căutare.' : 'Lucrarea nu are încă fișiere.'}</p>}
      <p className="job-record__note">Asocierea și descărcarea nu confirmă utilizarea. O revizie nouă nu schimbă fișierul deja declarat folosit.</p>
      {file ? <section className="job-record__file-detail" ref={fileDetail} tabIndex={-1} aria-label={'Detalii fișier ' + file.originalFileName}><header><h3>{file.originalFileName}</h3><Button variant="secondary" onClick={() => { setSelected(null); fileButtons.current.get(file.artifactId)?.focus(); }}>Închide detaliul</Button></header><p>Încărcat: {moment(file.uploadedAt)} · {file.authorLabel ?? 'Cont organizație'}</p>{file.note ? <p>{file.note}</p> : null}<AuthenticatedDownloadLink href={file.downloadHref}>Descarcă această versiune</AuthenticatedDownloadLink><JobArtifactPreview file={file}/>
        <h4>Relații între versiuni</h4>{record.files.filter(f => f.artifactId === file.supersedesArtifactId || f.supersedesArtifactId === file.artifactId).map(f => <p key={f.artifactId}><button type="button" onClick={() => openFile(f)}>{f.artifactId === file.supersedesArtifactId ? 'Versiune anterioară: ' : 'Versiune ulterioară: '}{f.originalFileName} · {moment(f.uploadedAt)}</button></p>)}{!file.supersedesArtifactId && !record.files.some(f => f.supersedesArtifactId === file.artifactId) ? <p>Nu există alte revizii legate de acest fișier.</p> : null}
      </section> : null}
    </section>;
}
