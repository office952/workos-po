import { useEffect, useState } from "react";
import "../styles/surfaces/clients.css";
import "../styles/surfaces/client-hub.css";
import { presentCreatedRequestId } from "../adapters/requestAdapter";
import { TransportError } from "../api/http";
import type {
  JobListItemTransport,
  QuoteListItemTransport,
  RequestListItemTransport,
} from "../api/types";
import { createRequest } from "../api/requests";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InlineAlert } from "../components/InlineAlert";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateAfterCreateRequest } from "../data/invalidation";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCustomerWorkspace } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { CLIENT_HUB_FUTURE_COPY, CLIENT_HUB_SECTION_LABEL } from "../presentation/clientHub";
import { formatTimestamp } from "../presentation/format";
import { presentRequestRegistryStatus } from "../presentation/requestListStatus";
import { presentResourceAccess } from "../presentation/resourceAccess";
import { statusTone } from "../presentation/statusTone";
import {
  presentJobWorklistAction,
  presentQuoteWorklistAction,
  presentRequestWorklistAction,
} from "../presentation/worklistAction";
import {
  CLIENT_HUB_SECTIONS,
  clientHref,
  jobHref,
  parseClientHubSection,
  quoteHref,
  requestHref,
} from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import {
  bindConfiguratorSessionToCustomer,
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";

type ClientDetailPageProps = {
  customerId: string;
};

export function ClientDetailPage({ customerId }: ClientDetailPageProps) {
  const workspace = useResource(resourceKeys.customerWorkspace(customerId), () =>
    loadCustomerWorkspace(customerId),
  );
  const customer = workspace.data?.customer;
  const section = parseClientHubSection(window.location.search);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) {
      return;
    }
    writeConfiguratorSession(
      bindConfiguratorSessionToCustomer(readConfiguratorSession(), customerId, customer.displayName),
    );
  }, [customer, customerId]);

  async function create(): Promise<void> {
    if (title.trim() === "" || description.trim() === "") {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const requestId = presentCreatedRequestId(
        await createRequest({
          customerId,
          title: title.trim(),
          description: description.trim(),
        }),
      );
      if (!requestId) {
        setSaveState("error");
        setSaveError("Cererea nu a putut fi creată.");
        return;
      }
      invalidateAfterCreateRequest(customerId);
      navigate(requestHref(requestId));
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof TransportError
          ? "Cererea nu este acceptată."
          : "Cererea nu a putut fi creată.",
      );
    }
  }

  const access = presentResourceAccess(workspace.error);
  const createForm =
    customer && (workspace.data?.canCreateRequest ?? customer.status === "ACTIVE") ? (
      <SurfacePanel title="Cerere nouă" label="Cerere nouă">
        <TextField id="request-title" label="Titlu" value={title} onChange={setTitle} />
        <TextField
          id="request-description"
          label="Descriere"
          value={description}
          onChange={setDescription}
        />
        <Button
          disabled={title.trim() === "" || description.trim() === "" || saveState === "pending"}
          onClick={() => {
            void create();
          }}
        >
          Creează cererea
        </Button>
        {saveError ? (
          <InlineAlert tone="error" title="Crearea a eșuat">
            {saveError}
          </InlineAlert>
        ) : null}
        <p className="ui-note">
          Clientul rămâne contextul. Cererea pornește fluxul comercial și operațional.
        </p>
      </SurfacePanel>
    ) : null;

  return (
    <SlicePage
      contextLabel="Client"
      currentHref={clientHref(customerId, section)}
      workspace="object"
      surface="client-hub"
      eyebrow="Client"
      title={customer?.displayName ?? "Client"}
      lead="Hubul relației comerciale. Identitatea rămâne fișa clientului."
      meta={customer?.city ?? undefined}
      status={
        customer ? (
          <StatusBadge label={customer.statusLabel} tone={statusTone("workflow")} />
        ) : null
      }
    >
      <div className="client-hub">
        <nav className="client-hub__nav" aria-label="Secțiuni client">
          {CLIENT_HUB_SECTIONS.map((item) => (
            <a
              key={item}
              href={clientHref(customerId, item)}
              aria-current={item === section ? "page" : undefined}
            >
              {CLIENT_HUB_SECTION_LABEL[item]}
            </a>
          ))}
        </nav>
        {workspace.status === "loading" && !workspace.data ? (
          <p role="status">Se citește hubul clientului</p>
        ) : null}
        {workspace.status === "error" && !workspace.data ? (
          <ErrorState title={access === "denied" ? "Acces refuzat" : "Clientul nu a putut fi citit"}>
            {access === "denied"
              ? "Nu ai acces la acest client în organizația curentă."
              : "Identitatea clientului nu este disponibilă."}
            <Button
              variant="secondary"
              onClick={() => invalidateResources(resourceKeys.customerWorkspace(customerId))}
            >
              Reîncearcă
            </Button>
          </ErrorState>
        ) : null}
        {workspace.data && section === "prezentare" ? (
          <>
            <SurfacePanel title="Identitate" label="Identitate client">
              <dl className="client-hub__facts">
                <div>
                  <dt>Denumire</dt>
                  <dd>{customer?.displayName}</dd>
                </div>
                <div>
                  <dt>Stare</dt>
                  <dd>{customer?.statusLabel}</dd>
                </div>
                <div>
                  <dt>Localitate</dt>
                  <dd>{customer?.city ?? "—"}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{customer?.contactName ?? "—"}</dd>
                </div>
                <div>
                  <dt>Telefon</dt>
                  <dd>{customer?.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{customer?.email ?? "—"}</dd>
                </div>
                <div>
                  <dt>Adresă</dt>
                  <dd>{customer?.address ?? "—"}</dd>
                </div>
                <div>
                  <dt>CUI</dt>
                  <dd>{customer?.cui ?? "—"}</dd>
                </div>
              </dl>
            </SurfacePanel>
            <SurfacePanel title="Relația curentă" label="Sumar relație">
              <ul className="client-hub__counts">
                <li>
                  <a href={clientHref(customerId, "cereri")}>
                    <strong>{workspace.data.summary.requestCount}</strong>
                    <span>Cereri</span>
                  </a>
                </li>
                <li>
                  <a href={clientHref(customerId, "cereri")}>
                    <strong>{workspace.data.summary.quoteCount}</strong>
                    <span>Oferte verificate</span>
                  </a>
                </li>
                <li>
                  <a href={clientHref(customerId, "lucrari")}>
                    <strong>{workspace.data.summary.jobCount}</strong>
                    <span>Lucrări</span>
                  </a>
                </li>
              </ul>
            </SurfacePanel>
            {createForm}
          </>
        ) : null}
        {workspace.data && section === "lucrari" ? (
          <HubCollection
            title="Lucrări"
            emptyTitle="Nu există lucrări"
            emptyBody="Lucrările eliberate pentru acest client apar aici."
            columns={["Lucrare", "Stare", "Acțiune"]}
            rows={workspace.data.jobs.map((job) => jobRow(job))}
          />
        ) : null}
        {workspace.data && section === "cereri" ? (
          <>
            <HubCollection
              title="Cereri"
              emptyTitle="Nu există cereri"
              emptyBody="Creează cererea lucrării pentru acest client."
              columns={["Cerere", "Stare", "Acțiune"]}
              rows={workspace.data.requests.map((item) => requestRow(item))}
            />
            <HubCollection
              title="Oferte"
              emptyTitle="Nu există oferte verificate"
              emptyBody="Ofertele apar doar dacă motorul le leagă de acest client."
              columns={["Ofertă", "Stare", "Acțiune"]}
              rows={workspace.data.quotes.map((item) => quoteRow(item))}
            />
            {createForm}
          </>
        ) : null}
        {workspace.data && section in CLIENT_HUB_FUTURE_COPY ? (
          <SurfacePanel
            title={CLIENT_HUB_SECTION_LABEL[section]}
            label={CLIENT_HUB_SECTION_LABEL[section]}
          >
            <>
              <p className="client-hub__future">
                {CLIENT_HUB_FUTURE_COPY[section as keyof typeof CLIENT_HUB_FUTURE_COPY].title}
              </p>
              <p className="client-hub__future">
                {CLIENT_HUB_FUTURE_COPY[section as keyof typeof CLIENT_HUB_FUTURE_COPY].body}
              </p>
            </>
          </SurfacePanel>
        ) : null}
      </div>
    </SlicePage>
  );
}

type HubRow = {
  key: string;
  href: string;
  title: string;
  detail?: string;
  state: string;
  actionHref: string;
  actionLabel: string;
};

function requestRow(item: RequestListItemTransport): HubRow {
  const action = presentRequestWorklistAction(item);
  const registry = presentRequestRegistryStatus({
    statusLabel: item.statusLabel,
    contextLabel: item.contextLabel,
  });
  return {
    key: item.requestId,
    href: requestHref(item.requestId),
    title: item.title,
    detail: [item.reference && item.reference !== item.title ? item.reference : null, formatTimestamp(item.createdAt)]
      .filter(Boolean)
      .join(" · "),
    state: registry.stateLabel,
    actionHref: action.actionHref,
    actionLabel: action.actionLabel,
  };
}

function quoteRow(item: QuoteListItemTransport): HubRow {
  const action = presentQuoteWorklistAction(item);
  return {
    key: item.quoteSnapshotId,
    href: quoteHref(item.productCode, item.quoteSnapshotId),
    title: item.reference,
    detail: item.productLabel,
    state: item.stageLabel,
    actionHref: action.actionHref,
    actionLabel: action.actionLabel,
  };
}

function jobRow(job: JobListItemTransport): HubRow {
  const action = presentJobWorklistAction(job);
  return {
    key: job.jobId,
    href: jobHref(job.jobId),
    title: job.kind === "ASSEMBLY" ? job.productLabel : job.inscription || job.productLabel,
    detail: [job.priorityLabel, job.targetDateLabel].filter(Boolean).join(" · "),
    state: job.stageLabel,
    actionHref: action.actionHref,
    actionLabel: action.actionLabel,
  };
}

function HubCollection({
  title,
  emptyTitle,
  emptyBody,
  columns,
  rows,
}: {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  columns: readonly string[];
  rows: readonly HubRow[];
}) {
  return (
    <SurfacePanel variant="flush" title={title} label={title} meta={`${rows.length}`}>
      {rows.length === 0 ? (
        <div className="clients-feedback">
          <EmptyState title={emptyTitle} description={emptyBody} />
        </div>
      ) : (
        <table className="clients-table">
          <caption className="u-visually-hidden">{title}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="clients-table__identity">
                  <a className="clients-object" href={row.href}>
                    <span className="clients-object__title">{row.title}</span>
                    {row.detail ? <span className="clients-object__detail">{row.detail}</span> : null}
                  </a>
                </td>
                <td className="clients-table__state">
                  <StatusBadge label={row.state} tone={statusTone("workflow")} />
                </td>
                <td className="clients-table__action">
                  <a className="clients-next" href={row.actionHref}>
                    <span>{row.actionLabel}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SurfacePanel>
  );
}
