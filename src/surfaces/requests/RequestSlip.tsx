import type { RequestListItemTransport } from "../../api/types";
import { invalidateResources } from "../../data/resourceCache";
import { resourceKeys } from "../../data/resourceKeys";
import { loadRequestDetail } from "../../data/routeLoaders";
import { useResource } from "../../data/useResource";
import { presentRequestWorklistAction } from "../../presentation/worklistAction";
import { clientsHref, quotesHref, requestHref } from "../../routing/appRoute";
import { DeskActions, DeskLoading, DeskReadError, DeskSheet, DeskStale } from "../desk/DeskDossier";
import { CommercialProgress, RequestState } from "./RequestParts";
import { entryDay, entryTime } from "./requestRegistryModel";

/** Linked offers come from the request detail, read for this request only. */
function LinkedOffers({ requestId }: { requestId: string }) {
  const key = resourceKeys.request(requestId);
  const detail = useResource(key, () => loadRequestDetail(requestId));
  const retry = () => invalidateResources(key);
  if (!detail.data) {
    return detail.status === "error" ? (
      <DeskReadError title="Ofertele legate nu au putut fi citite" onRetry={retry}>
        Bonul păstrează datele din registru. Reîncearcă citirea cererii.
      </DeskReadError>
    ) : (
      <DeskLoading>Se citesc ofertele legate…</DeskLoading>
    );
  }
  const offers = detail.data.linkedOffers;
  const description = detail.data.description.trim();
  return (
    <>
      {detail.status === "error" ? (
        <DeskStale onRetry={retry}>Actualizarea cererii a eșuat. Se afișează ultima citire reușită.</DeskStale>
      ) : null}
      {description ? <p className="rdesk-sheet__text rtray-sheet__description">{description}</p> : null}
      <div>
        <p className="rdesk-sheet__list-head">
          <span className="rdesk-sheet__label">{`Oferte legate · ${offers.length}`}</span>
          <span className="rdesk-sheet__label">Stare</span>
        </p>
        {offers.length === 0 ? (
          <p className="rdesk-sheet__text rtray-sheet__none">Nicio ofertă încă pentru această cerere.</p>
        ) : (
          <ul className="rdesk-sheet__list">
            {offers.map((offer) => (
              <li key={offer.quoteSnapshotId}>
                <a className="rdesk-sheet__item-title" href={quotesHref({ quoteId: offer.quoteSnapshotId })}>{offer.reference ?? offer.kindLabel}</a>
                <span className="rdesk-sheet__item-value">{offer.superseded ? "Înlocuită" : offer.stageLabel ?? "—"}</span>
                <span className="rdesk-sheet__item-detail">{[offer.kindLabel, offer.productLabel].filter(Boolean).join("  ·  ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** The intake slip: when the request entered, its state, its commercial progress and the next step. */
export function RequestSlip({ item }: { item: RequestListItemTransport }) {
  const action = presentRequestWorklistAction(item);
  const detailHref = requestHref(item.requestId);
  const destinations = [{ action: action.actionLabel, target: action.actionHref === detailHref ? "pagina cererii" : "pasul următor al cererii" }];
  if (action.actionHref !== detailHref) destinations.push({ action: "Cererea completă", target: "pagina cererii" });
  if (item.customerId) destinations.push({ action: "Clientul", target: "cartela clientului, în Clienți" });

  return (
    <DeskSheet
      label={`Bonul de intrare: ${item.title || item.reference || "cerere"}`}
      actions={
        <DeskActions destinations={destinations}>
          <a className="rdesk-dossier__primary" href={action.actionHref}>
            <span>{action.actionLabel}</span>
            <span aria-hidden="true">→</span>
          </a>
          {action.actionHref !== detailHref ? <a className="rdesk-dossier__secondary" href={detailHref}>Cererea completă</a> : null}
        </DeskActions>
      }
    >
      <p className="rdesk-sheet__head">
        <span>Cerere · intrare</span>
        <span>{item.reference ?? "—"}</span>
      </p>
      <div className="rdesk-sheet__identity">
        <div>
          <p className="rdesk-sheet__name">{item.title || item.reference || "Cerere"}</p>
          {item.customerId ? (
            <p className="rdesk-sheet__lead"><a href={clientsHref(item.customerId)}>{item.customerDisplayName ?? "Client"}</a></p>
          ) : (
            <p className="rdesk-sheet__lead">Fără client</p>
          )}
        </div>
        <span className="rtray-entry" aria-label={`Intrată ${entryDay(item.createdAt)}, ${entryTime(item.createdAt)}`}>
          <strong>{entryTime(item.createdAt)}</strong>
          <small>{entryDay(item.createdAt)}</small>
        </span>
      </div>
      <hr className="rdesk-sheet__perforation" />
      <dl className="rdesk-sheet__facts rtray-sheet__facts">
        <div><dt>Stare cerere</dt><dd><RequestState item={item} /></dd></div>
        <div><dt>Progres comercial</dt><dd><CommercialProgress item={item} /></dd></div>
      </dl>
      {item.nextActionLabel ? <p className="rdesk-sheet__note">{`Pas următor: ${item.nextActionLabel}`}</p> : null}
      {item.attentionLabel ? <p className="rdesk-sheet__note" data-tone="attention">{item.attentionLabel}</p> : null}
      <LinkedOffers requestId={item.requestId} />
    </DeskSheet>
  );
}
