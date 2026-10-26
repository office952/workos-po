import { useRef } from "react";
import type { CustomerWorkspaceTransport } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import { statusTone } from "../../presentation/statusTone";
import { clientRequestPreviewHref, readClientRequestPreview } from "../../routing/appRoute";
import { DeskDialog, DeskDossier, type DeskVacancy } from "../desk/DeskDossier";
import { useDeskLayout } from "../desk/useDeskLayout";
import { useDeskSelection } from "../desk/useDeskSelection";
import { RequestSlip } from "../requests/RequestSlip";
import { relationNow, relationThreads, requestRow, type HubRow } from "./clientRelationModel";
import "../../styles/layout/registry-desk.css";
import "../../styles/surfaces/client-relation.css";

function DocumentLine({ row }: { row: HubRow }) {
  return (
    <li className="crel-doc" data-attention={row.needsAttention || undefined}>
      <span className="crel-doc__kind">{row.kind}</span>
      <a className="crel-doc__title" href={row.href}>{row.title}</a>
      <span className="crel-doc__state">
        {row.needsAttention ? row.attentionLabel ?? "Necesită acțiune" : <StatusBadge label={row.state} tone={statusTone("workflow")} />}
      </span>
      {row.detail ? <span className="crel-doc__detail">{row.detail}</span> : null}
    </li>
  );
}

/**
 * N-018 · Relație: what waits now (server attention and next step), the threads grouped by
 * request (server links only), and the relation journal, which has no source yet.
 */
export function ClientRelation({ customerId, workspace, search }: { customerId: string; workspace: CustomerWorkspaceTransport; search: string }) {
  const layout = useDeskLayout();
  const dialogLayout = layout === "docked" ? "overlay" : layout;
  const now = relationNow(workspace);
  const threads = relationThreads(workspace);
  const previewId = readClientRequestPreview(search);
  const order = workspace.requests.map((item) => item.requestId);
  const previewed = workspace.requests.find((item) => item.requestId === previewId) ?? null;
  const searchRef = useRef<HTMLInputElement>(null);
  const selection = useDeskSelection({
    layout: dialogLayout,
    selectedId: previewId,
    href: (id) => clientRequestPreviewHref(customerId, "prezentare", id),
    order,
    searchRef,
  });

  const vacancy: DeskVacancy | null = previewed
    ? null
    : { title: "Cererea nu este în relația clientului", body: "Cererea cerută nu există sau nu aparține acestui client." };

  return (
    <div className="crel" data-register>
      <section className="crel__block" aria-labelledby="crel-acum">
        <h2 id="crel-acum" className="crel__title">Acum</h2>
        {now.length === 0 ? (
          <p className="crel__quiet">Nimic nu așteaptă o acțiune pentru acest client.</p>
        ) : (
          <ul className="crel-now">
            {now.map((row) => (
              <li key={`${row.kind}-${row.key}`} className="crel-now__item">
                <span className="crel-doc__kind">{row.kind}</span>
                <a className="crel-doc__title" href={row.href}>{row.title}</a>
                <span className="crel-now__reason">{row.attentionLabel ?? "Necesită acțiune"}</span>
                <a className="clients-next" href={row.actionHref}>
                  <span>{row.actionLabel}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="crel__block" aria-labelledby="crel-fire">
        <h2 id="crel-fire" className="crel__title">Fire pe cerere</h2>
        {threads.length === 0 ? (
          <p className="crel__quiet">Clientul nu are încă cereri, oferte sau lucrări.</p>
        ) : (
          <ol className="crel-threads">
            {threads.map((thread) => {
              const head = thread.request ? requestRow(thread.request) : null;
              return (
                <li key={thread.key} className="crel-thread">
                  {head && thread.request ? (
                    <div className="crel-thread__head">
                      <span className="crel-doc__kind">Cerere</span>
                      <button
                        type="button"
                        className="crel-thread__open"
                        data-row-id={thread.request.requestId}
                        aria-haspopup="dialog"
                        aria-label={`Previzualizează cererea ${head.title}`}
                        onClick={() => selection.open(thread.request!.requestId)}
                      >
                        {head.title}
                      </button>
                      <span className="crel-doc__state">
                        {head.needsAttention ? head.attentionLabel ?? "Necesită acțiune" : <StatusBadge label={head.state} tone={statusTone("workflow")} />}
                      </span>
                      {head.detail ? <span className="crel-doc__detail">{head.detail}</span> : null}
                    </div>
                  ) : (
                    <div className="crel-thread__head">
                      <span className="crel-thread__loose">Fără cerere legată</span>
                    </div>
                  )}
                  {thread.documents.length ? (
                    <ul className="crel-thread__docs">
                      {thread.documents.map((row) => <DocumentLine key={`${row.kind}-${row.key}`} row={row} />)}
                    </ul>
                  ) : (
                    <p className="crel__quiet crel-thread__none">Fără oferte sau lucrări încă.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* No journal source yet: one quiet note after the content, no reserved column (138:748 shows a populated journal). */}
      <p className="crel__note">Jurnalul relației nu este disponibil în această etapă.</p>

      {previewId ? (
        <DeskDialog layout={dialogLayout} label="Previzualizare cerere" onClose={selection.close}>
          <DeskDossier
            id="client-cerere-previzualizare"
            label="Previzualizare cerere"
            steps={{ previous: "Cererea anterioară", next: "Cererea următoare" }}
            layout={dialogLayout}
            position={previewed ? { index: selection.index, count: order.length } : null}
            vacancy={vacancy}
            onMove={selection.move}
            onClose={selection.close}
          >
            {previewed ? <RequestSlip key={previewed.requestId} item={previewed} /> : null}
          </DeskDossier>
        </DeskDialog>
      ) : null}
    </div>
  );
}
