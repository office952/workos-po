import type { WorkHoursTask } from "../../../../api/jobRecord";
import { AuthenticatedDownloadLink } from "../../../../presentation/AuthenticatedDownloadLink";
import { formatDay } from "../../dossier/dossierModel";
import { countLabel } from "../../dossier/historyModel";
import { DossierIcon } from "../../dossier/dossierIcons";
import { versionMeta, type FileDocument, type FileVersion } from "../workMemoryModel";

/**
 * R-005 · the technical files of the job (1037:38133), one card per document with its recorded
 * versions, newest first. An association with an operation is not use: „utilizat” appears only
 * where the operator declared the use. Reading a file is the only action.
 */
export function MemoryFiles({ documents, tasks }: { documents: readonly FileDocument[]; tasks: readonly WorkHoursTask[] }) {
  const seqOf = (taskId: string, label: string) => tasks.find((task) => task.taskId === taskId)?.seqLabel ?? label;
  return (
    <ul className="wmem-docs">
      {documents.map((document) => (
        <li key={document.key} className="wmem-doc">
          <p className="wmem-doc__head">
            {document.kind ? <span className="wmem-doc__kind">{document.kind}</span> : null}
            <span className="wmem-doc__name">{document.name}</span>
            <span className="wmem-doc__count">{countLabel(document.versions.length, "versiune", "versiuni")}</span>
          </p>
          <ol className="wmem-versions">
            {document.versions.map((version) => (
              <VersionRow key={version.file.artifactId} version={version} name={document.name} seqOf={seqOf} />
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}

function VersionRow({ version, name, seqOf }: { version: FileVersion; name: string; seqOf: (taskId: string, label: string) => string }) {
  const { file } = version;
  const used = file.usages.filter((usage) => usage.usedAt);
  return (
    <li className="wmem-version" data-latest={!version.kept || undefined}>
      <span className="wmem-version__tag">{version.tag}</span>
      <div className="wmem-version__body">
        <p className="wmem-version__title">{version.title}</p>
        <p>{versionMeta(version)}</p>
        {file.note ? <p className="wmem-version__note">{`„${file.note}”`}</p> : null}
        {file.usages.length ? (
          <ul className="wmem-chips">
            {file.usages.map((usage) => (
              <li key={usage.taskId} className="wmem-chip" data-used={usage.usedAt ? true : undefined} title={usage.taskLabel}>
                <span className="wmem-chip__dot" aria-hidden="true" />
                <span aria-hidden="true">{seqOf(usage.taskId, usage.taskLabel)}</span>
                <span className="u-visually-hidden">{usage.taskLabel}</span>
                {usage.usedAt ? " · utilizat" : " · asociat"}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nicio operație asociată acestei versiuni</p>
        )}
        {used.map((usage) => (
          <p key={usage.taskId}>{["Utilizare înregistrată: " + seqOf(usage.taskId, usage.taskLabel), usage.usedByLabel, formatDay(usage.usedAt)].filter(Boolean).join(" · ")}</p>
        ))}
      </div>
      <AuthenticatedDownloadLink href={file.downloadHref} className="wmem-download">
        <DossierIcon name="download" size={14} />
        Descarcă
        <span className="u-visually-hidden">{` ${version.tag} · ${name}`}</span>
      </AuthenticatedDownloadLink>
    </li>
  );
}
