import { moment } from './format';
import { useEffect, useRef, useState } from 'react';
import type { JobRecord, JobRecordFile } from '../../api/jobRecord';
import { AuthenticatedDownloadLink } from '../../presentation/AuthenticatedDownloadLink';
import { JobArtifactPreview } from '../JobArtifactPreview';
import { JobFilesPanel } from '../JobFilesPanel';
import { Button } from '../../components/Button';
import { resourceKeys } from '../../data/resourceKeys';
import { invalidateResources } from '../../data/resourceCache';
import { Heading, RecordIcon } from './presentation';
import { versionRelation, versionTag, versionTrees, type VersionNode } from './fileVersions';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function fileMatchesQuery(file: JobRecordFile, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('ro');
  return [file.originalFileName, file.purposeLabel, ...file.usages.map(u => u.taskLabel)]
    .join(' ').toLocaleLowerCase('ro').includes(normalized);
}

export function JobRecordFiles({ record, canWriteFiles, operationHref, openFileId, onOpenFile, onCloseFile }: {
  record: JobRecord; canWriteFiles: boolean; operationHref: (id: string) => string;
  /** N-018 · the detail lives in the URL (?fisier=), so Back returns to the same list. */
  openFileId?: string | null; onOpenFile?: (artifactId: string) => void; onCloseFile?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const routed = Boolean(onOpenFile);
  const selected = routed ? openFileId ?? null : localSelected;
  const setSelected = (id: string | null) => {
    if (!routed) setLocalSelected(id);
    else if (id) onOpenFile?.(id);
    else onCloseFile?.();
  };
  const fileButtons = useRef(new Map<string, HTMLButtonElement>());
  const fileDetail = useRef<HTMLElement>(null);
  const file = record.files.find(f => f.artifactId === selected) ?? null;
  const files = record.files.filter(f => fileMatchesQuery(f, query));
  const trees = versionTrees(record.files);
  const visibleGroups = trees.map(tree => tree.nodes.filter(node => files.includes(node.file))).filter(group => group.length > 0);
  const treeOf = (node: VersionNode<JobRecordFile>) => trees.find(tree => tree.nodes.includes(node))!;
  const nodes = new Map(trees.flatMap(tree => tree.nodes).map(node => [node.file.artifactId, node]));
  const tagOf = (f: JobRecordFile) => { const node = nodes.get(f.artifactId); return node ? versionTag(node) : 'rev.'; };
  const revisionLine = (node: VersionNode<JobRecordFile>) =>
    node.parent && treeOf(node).linear ? 'Revizie nouă · versiunea anterioară rămâne păstrată' : versionRelation(treeOf(node), node, moment);
  function searchFiles(value: string) {
    setQuery(value);
    if (file && !fileMatchesQuery(file, value)) setSelected(null);
  }
  function openFile(f: JobRecordFile) {
    if (!fileMatchesQuery(f, query)) setQuery('');
    setSelected(f.artifactId);
    if (!routed) setTimeout(() => fileDetail.current?.focus(), 0);
  }
  // A routed detail (link, Back/Forward) takes focus when it appears; closing returns it to the row.
  const lastFile = useRef<string | null>(null);
  useEffect(() => {
    if (!routed) return;
    if (selected) {
      lastFile.current = selected;
      fileDetail.current?.focus();
      return;
    }
    const previous = lastFile.current;
    lastFile.current = null;
    if (previous) fileButtons.current.get(previous)?.focus();
  }, [routed, selected]);
  return <section className="job-record__section" aria-label="Fișierele lucrării">
      <header><div><Heading icon="file">Fișierele lucrării</Heading><p>{`${plural(trees.length, 'fișier', 'fișiere')} · ${plural(record.files.length, 'versiune', 'versiuni')} · utilizări păstrate pe fiecare versiune.`}</p></div>{canWriteFiles ? <Button variant="secondary" aria-expanded={uploading} onClick={() => setUploading(v => !v)}>{uploading ? 'Închide încărcarea' : 'Adaugă fișier'}</Button> : null}</header>
      {uploading && canWriteFiles ? <JobFilesPanel jobId={record.jobId} uploadOnly onUploaded={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}/> : null}
      <label className="job-record__search">Caută fișier sau operație<input type="search" value={query} onChange={e => searchFiles(e.target.value)}/></label>
      {files.length ? <table className="job-record__table job-record__files"><caption className="u-visually-hidden">Fișiere, utilizări și autorii înregistrărilor</caption><thead><tr><th>Fișier / revizie</th><th>Unde a fost folosit</th><th>Încărcat de / când</th><th>Consultare</th></tr></thead>{visibleGroups.map(group => <tbody key={group[0]!.file.artifactId}><tr className="job-record__file-group"><th scope="rowgroup" colSpan={4}>{`${group[0]!.file.originalFileName} · ${plural(group.length, 'versiune', 'versiuni')}`}</th></tr>{group.map(node => { const f = node.file; return <tr key={f.artifactId} data-selected={file?.artifactId === f.artifactId}>
        <td data-label="Fișier / revizie"><strong>{f.originalFileName}</strong> <span className="job-record__version">{versionTag(node)}</span><p>{f.sizeLabel} · {f.purposeLabel ?? 'Scop nedeclarat'}</p><p>{revisionLine(node)}</p></td>
        <td data-label="Unde a fost folosit">{f.usages.length ? f.usages.map(u => <div key={u.taskId} className="job-record__use"><a href={operationHref(u.taskId)}>{u.taskLabel}</a><p><RecordIcon kind={u.usedAt ? 'check' : 'link'}/>{u.usedAt ? 'Utilizare înregistrată' : 'Asociat · utilizare neconfirmată'}</p>{u.usedAt ? <p>{u.usedByLabel ?? 'Autor neînregistrat'} · {moment(u.usedAt)}</p> : null}</div>) : <p>Asociat lucrării · fără utilizare înregistrată pe operații</p>}</td>
        <td data-label="Încărcat de / când">{f.authorLabel ?? 'Cont organizație'}<p>{moment(f.uploadedAt)}</p></td><td data-label="Consultare"><div className="job-record__file-actions"><AuthenticatedDownloadLink href={f.downloadHref}>Descarcă</AuthenticatedDownloadLink><button type="button" ref={n => { if (n) fileButtons.current.set(f.artifactId, n); }} onClick={() => openFile(f)}>Utilizări și versiuni →</button></div></td>
      </tr>; })}</tbody>)}</table> : <p>{record.files.length ? 'Niciun fișier în această căutare.' : 'Lucrarea nu are încă fișiere.'}</p>}
      <p className="job-record__note">Asocierea și descărcarea nu confirmă utilizarea. O revizie nouă nu schimbă fișierul deja declarat folosit.</p>
      {file ? <section className="job-record__file-detail" ref={fileDetail} tabIndex={-1} aria-label={'Detalii fișier ' + file.originalFileName}><header><h3>{file.originalFileName} <span className="job-record__version">{tagOf(file)}</span></h3><Button variant="secondary" onClick={() => { setSelected(null); if (!routed) fileButtons.current.get(file.artifactId)?.focus(); }}>Închide detaliul</Button></header><p>Încărcat: {moment(file.uploadedAt)} · {file.authorLabel ?? 'Cont organizație'}</p>{file.note ? <p>{file.note}</p> : null}<AuthenticatedDownloadLink href={file.downloadHref}>Descarcă această versiune</AuthenticatedDownloadLink><JobArtifactPreview file={file}/>
        <h4>Relații între versiuni</h4>{record.files.filter(f => f.artifactId === file.supersedesArtifactId || f.supersedesArtifactId === file.artifactId).map(f => <p key={f.artifactId}><button type="button" onClick={() => openFile(f)}>{f.artifactId === file.supersedesArtifactId ? 'Versiune anterioară: ' : 'Versiune ulterioară: '}{tagOf(f)} · {f.originalFileName} · {moment(f.uploadedAt)}</button></p>)}{!file.supersedesArtifactId && !record.files.some(f => f.supersedesArtifactId === file.artifactId) ? <p>Nu există alte revizii legate de acest fișier.</p> : null}
      </section> : null}
    </section>;
}
