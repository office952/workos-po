import { useCallback, useId, useState, type ReactNode } from "react";
import {
  presentStartOverview,
  type StartAttentionEntryTransport,
  type StartContinueItemTransport,
  type StartOverviewTransport,
} from "../adapters/startAdapter";
import { fetchStartOverview } from "../api/start";
import { loadResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { PageRegion } from "../layout/PageRegion";
import {
  ORGANIZATION_SETTINGS_HREF,
  PRODUCT_ENABLEMENT_HREF,
  START_CONTINUE_VISIBLE,
  presentAttentionFootnote,
  presentAttentionGroups,
  presentFlowStage,
  presentHiddenLabel,
  presentStartDateLine,
  presentStartFreshness,
  presentStartHeadline,
  presentStartPartialNotice,
  startTargetHref,
  type StartAttentionGroup,
  type StartFlowStageView,
} from "../presentation/startPage";
import { newRequestHref, requestsHref } from "../routing/appRoute";
import "../styles/surfaces/start.css";

async function loadStartOverview(): Promise<StartOverviewTransport> {
  return presentStartOverview(await fetchStartOverview());
}

/**
 * Start · orientation only. Every control navigates to the object or register that owns the
 * step; nothing is approved, confirmed or closed from this page.
 */
export function StartPage() {
  const key = resourceKeys.start();
  const snapshot = useResource(key, loadStartOverview);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    // The last good reading stays on screen while the new one is fetched.
    void loadResource(key, loadStartOverview, { force: true })
      .catch(() => {
        // The snapshot carries the error; the previous reading is kept.
      })
      .finally(() => setRefreshing(false));
  }, [key]);

  const start = snapshot.data;
  if (!start) {
    return (
      <PageRegion>
        <div className="start" data-surface="start">
          <header className="start-orient">
            <div className="start-orient__copy">
              <p className="start-eyebrow">Start</p>
              <h1 className="start-orient__title">
                {snapshot.status === "error" ? "Datele nu au putut fi citite" : "Se citesc datele organizației"}
              </h1>
              {snapshot.status === "error" ? (
                <p className="start-orient__lead" role="alert">
                  Nimic nu este afișat, ca să nu pară că organizația nu are activitate. Reîncearcă.
                </p>
              ) : (
                <p className="start-orient__lead" role="status">
                  Cereri, oferte, lucrări și execuție.
                </p>
              )}
            </div>
            {snapshot.status === "error" ? (
              <div className="start-fresh">
                <button type="button" className="start-refresh" onClick={refresh} disabled={refreshing}>
                  {refreshing ? "Se reîncarcă" : "Reîncearcă"}
                </button>
              </div>
            ) : null}
          </header>
          {snapshot.status === "error" ? null : (
            <div className="start-skeleton" aria-hidden="true">
              <div className="start-skeleton__block start-skeleton__block--tall" />
              <div className="start-skeleton__block" />
            </div>
          )}
        </div>
      </PageRegion>
    );
  }

  return (
    <StartView
      start={start}
      refreshFailed={snapshot.status === "error"}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  );
}

export function StartView({
  start,
  refreshFailed,
  refreshing,
  onRefresh,
}: {
  start: StartOverviewTransport;
  refreshFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const headline = presentStartHeadline(start);
  const freshness = presentStartFreshness(start, refreshFailed);
  const notice = presentStartPartialNotice(start);
  const groups = presentAttentionGroups(start.attention.entries, expanded);
  const firstUse = start.activity === "NONE";
  const compact = !groups.some((group) => group.level !== "WATCH");
  const showAttention = groups.length > 0 || notice !== null;
  const showContinue = !firstUse && start.continueWork !== null;

  return (
    <PageRegion>
      <div className="start" data-surface="start">
        <header className="start-orient">
          <div className="start-orient__copy">
            <p className="start-eyebrow">{presentStartDateLine(start.readAt)}</p>
            <h1 className="start-orient__title">{headline.title}</h1>
            {headline.lead ? <p className="start-orient__lead">{headline.lead}</p> : null}
          </div>
          <div className="start-fresh" aria-busy={refreshing || undefined}>
            <p className="start-fresh__state" role="status">
              <span className={`start-led start-led--${freshness.state}`} aria-hidden="true" />
              {freshness.label}
            </p>
            <button type="button" className="start-refresh" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "Se reîncarcă" : "Reîncarcă"}
            </button>
          </div>
        </header>

        {refreshFailed ? (
          <p className="start-stale" role="alert">
            Datele nu au putut fi reîmprospătate. Rămâne afișată ultima citire reușită.
          </p>
        ) : null}

        <div
          className={[
            "start-main",
            compact || !showAttention || !showContinue ? "start-main--stacked" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {firstUse ? (
            <FirstUsePanel start={start} />
          ) : showAttention ? (
            <section className="start-panel start-attention" aria-labelledby="start-attention-title">
              <h2 id="start-attention-title" className="start-visually-hidden">
                Centrul de atenție
              </h2>
              {notice ? (
                <div className="start-notice" role="alert">
                  <WarningIcon />
                  <div className="start-notice__copy">
                    <p className="start-notice__title">{notice.title}</p>
                    <p className="start-notice__detail">{notice.detail}</p>
                  </div>
                  <button type="button" className="start-btn start-btn--outline" onClick={onRefresh} disabled={refreshing}>
                    {notice.retryLabel}
                  </button>
                </div>
              ) : null}
              {groups.map((group) => (
                <AttentionGroup
                  key={group.level}
                  group={group}
                  compact={compact && groups.length === 1 && group.count === 1}
                  onExpand={() => setExpanded(true)}
                />
              ))}
              {groups.length > 0 && !(compact && start.attention.entries.length === 1 && !notice) ? (
                <p className="start-attention__foot">{presentAttentionFootnote(start, groups)}</p>
              ) : null}
            </section>
          ) : null}

          {showContinue && start.continueWork ? <ContinuePanel work={start.continueWork} wide={compact || !showAttention} /> : null}
        </div>

        {start.flow.length > 0 ? (
          <section className="start-panel start-flow" aria-labelledby="start-flow-title">
            <div className="start-flow__head">
              <h2 id="start-flow-title" className="start-panel__title">
                Fluxul operațional
              </h2>
              <p className="start-flow__note">
                {firstUse
                  ? "așa se va vedea parcursul, de la cerere la execuție, după ce apare activitate"
                  : "de la cerere la execuție · fiecare etapă își numără propria unitate, numerele nu se compară între ele"}
              </p>
            </div>
            <ol className="start-flow__stages">
              {start.flow.map((stage) => (
                <FlowStage key={stage.id} stage={presentFlowStage(stage)} onRetry={onRefresh} refreshing={refreshing} />
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </PageRegion>
  );
}

function AttentionGroup({
  group,
  compact,
  onExpand,
}: {
  group: StartAttentionGroup;
  compact: boolean;
  onExpand: () => void;
}) {
  const titleId = useId();
  return (
    <section
      className={`start-level start-level--${group.level.toLowerCase()}${compact ? " start-level--compact" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="start-level__head">
        <h3 id={titleId} className="start-level__label">
          {group.label}
        </h3>
        {compact ? null : (
          <p className="start-level__count">
            <span className="start-visually-hidden">Situații: </span>
            {group.count}
          </p>
        )}
        <p className="start-level__hint">{group.hint}</p>
      </div>
      <ul className="start-level__rows">
        {group.visible.map((entry) =>
          group.level === "WATCH" ? <WatchRow key={entry.key} entry={entry} /> : <EntryRow key={entry.key} entry={entry} />,
        )}
        {group.hidden.length > 0 ? (
          <li className="start-more">
            <p className="start-more__text">
              {group.hidden.length === 1
                ? "Încă o situație, mai nouă."
                : `Încă ${group.hidden.length} situații, mai noi.`}
            </p>
            <button type="button" className="start-link" onClick={onExpand}>
              {presentHiddenLabel(group)}
              <ArrowIcon />
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function EntryRow({ entry }: { entry: StartAttentionEntryTransport }) {
  const href = startTargetHref(entry.target);
  const primary = entry.level === "ACTION";
  return (
    <li className="start-entry">
      <div className="start-entry__object">
        <p className="start-entry__identity">
          <ObjectIcon kind={entry.objectKind} />
          <span className="start-entry__reference">{entry.reference ?? entry.objectKindLabel}</span>
          <span className="start-badge">{entry.reasonLabel}</span>
        </p>
        <p className="start-entry__title">
          <a className="start-entry__title-link" href={href} tabIndex={-1}>
            {entry.title}
          </a>
        </p>
        {entry.detail ? <p className="start-entry__detail">{entry.detail}</p> : null}
      </div>
      <div className="start-entry__action">
        <a
          className={`start-btn ${primary ? "start-btn--primary" : "start-btn--outline"}`}
          href={href}
          aria-label={`${entry.actionLabel}: ${entry.title}`}
        >
          {entry.actionLabel}
        </a>
        {entry.actionNote ? <p className="start-entry__note">{entry.actionNote}</p> : null}
      </div>
    </li>
  );
}

function WatchRow({ entry }: { entry: StartAttentionEntryTransport }) {
  return (
    <li className="start-watch">
      <a className="start-watch__link" href={startTargetHref(entry.target)}>
        <span className="start-watch__copy">
          <span className="start-watch__title">{entry.title}</span>
          <span className="start-watch__detail">{entry.detail}</span>
        </span>
        <span className="start-watch__action">
          <span className="start-watch__action-label">{entry.actionLabel}</span>
          <ArrowIcon />
        </span>
      </a>
    </li>
  );
}

function ContinuePanel({
  work,
  wide,
}: {
  work: NonNullable<StartOverviewTransport["continueWork"]>;
  wide: boolean;
}) {
  const items = work.items.slice(0, START_CONTINUE_VISIBLE);
  return (
    <section
      className={`start-panel start-continue${wide ? " start-continue--wide" : ""}`}
      aria-labelledby="start-continue-title"
    >
      <div className="start-continue__head">
        <h2 id="start-continue-title" className="start-panel__title">
          De continuat
          {work.status === "READY" ? (
            <span className="start-continue__count">
              <span className="start-visually-hidden">, cereri: </span>
              {work.total}
            </span>
          ) : null}
        </h2>
        <p className="start-continue__lead">Cereri din organizație cu un pas următor valid.</p>
      </div>
      {work.status === "UNAVAILABLE" ? (
        <p className="start-continue__empty" role="status">
          Cererile nu au putut fi citite. Lista nu este afișată; nu înseamnă că nu există cereri.
        </p>
      ) : items.length === 0 ? (
        <p className="start-continue__empty">Nicio cerere nu așteaptă un pas acum.</p>
      ) : (
        <ul className="start-continue__list">
          {items.map((item) => (
            <ContinueRow key={item.requestId} item={item} />
          ))}
        </ul>
      )}
      <div className="start-continue__foot">
        <a className="start-link" href={requestsHref()}>
          {work.total > items.length ? `Toate cele ${work.total} cereri de rezolvat` : "Toate cererile"}
          <ArrowIcon />
        </a>
      </div>
    </section>
  );
}

function ContinueRow({ item }: { item: StartContinueItemTransport }) {
  return (
    <li className="start-request">
      <p className="start-request__meta">
        <span className="start-request__reference">{item.reference}</span>
        <span className="start-request__status">{item.statusLabel}</span>
      </p>
      <p className="start-request__title">{item.title}</p>
      <div className="start-request__body">
        {item.contextLabel ? <p className="start-request__context">{item.contextLabel}</p> : null}
        <a
          className="start-link"
          href={startTargetHref(item.target)}
          aria-label={`${item.nextActionLabel}: ${item.title}`}
        >
          {item.nextActionLabel}
          <ArrowIcon />
        </a>
      </div>
    </li>
  );
}

function FlowStage({
  stage,
  onRetry,
  refreshing,
}: {
  stage: StartFlowStageView;
  onRetry: () => void;
  refreshing: boolean;
}) {
  const unavailable = stage.status === "UNAVAILABLE";
  return (
    <li className={`start-stage${unavailable ? " start-stage--unavailable" : ""}${stage.empty ? " start-stage--empty" : ""}`}>
      <a className="start-stage__head" href={stage.href} aria-label={stageLinkLabel(stage)}>
        <span className="start-stage__label">{stage.label}</span>
        {unavailable ? (
          <span className="start-stage__unavailable">Indisponibil</span>
        ) : stage.empty ? (
          <span className="start-stage__empty-label">{stage.emptyLabel}</span>
        ) : (
          <span className="start-stage__total">
            <span className="start-stage__number">{stage.total}</span>
            <span className="start-stage__unit">{stage.unitLabel}</span>
          </span>
        )}
      </a>
      <div className="start-stage__body">
        <div className="start-stage__bar" aria-hidden="true">
          {unavailable || stage.empty
            ? null
            : stage.segments.map((segment) => (
                <span
                  key={segment.id}
                  className={`start-seg start-seg--${segment.tone}`}
                  style={{ flexGrow: Math.max(segment.share, 0.04), flexBasis: 0 }}
                />
              ))}
        </div>
        {unavailable ? (
          <div className="start-stage__missing">
            <p className="start-stage__hint">Sursa nu a răspuns. Nu este afișat niciun total.</p>
            <button type="button" className="start-link" onClick={onRetry} disabled={refreshing}>
              Reîncarcă
              <ArrowIcon />
            </button>
          </div>
        ) : stage.empty ? (
          <p className="start-stage__hint">{stage.emptyHint}</p>
        ) : (
          <>
            <ul className="start-stage__legend">
              {stage.segments.map((segment) => (
                <li key={segment.id} className="start-legend">
                  <span className={`start-mark start-mark--${segment.tone}`} aria-hidden="true" />
                  <span className="start-legend__label">{segment.label}</span>
                  <span className="start-legend__count">{segment.count}</span>
                </li>
              ))}
            </ul>
            {stage.highlight ? (
              <p className={`start-stage__highlight start-stage__highlight--${stage.highlight.tone}`}>
                <span className="start-dot" aria-hidden="true" />
                {stage.highlight.label}
              </p>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

function stageLinkLabel(stage: StartFlowStageView): string {
  if (stage.status === "UNAVAILABLE") return `${stage.label}: indisponibil. Deschide registrul.`;
  if (stage.empty) return `${stage.label}: ${stage.emptyLabel}. Deschide registrul.`;
  return `${stage.label}: ${stage.total} ${stage.unitLabel}. Deschide registrul.`;
}

function FirstUsePanel({ start }: { start: StartOverviewTransport }) {
  const setup = start.setup;
  const needsProduct = setup !== null && setup.enabledProductCount === 0;
  const rows: ReactNode[] = [];
  if (start.canCreateRequest) {
    rows.push(
      <section key="first" className="start-level start-level--action start-level--setup" aria-labelledby="start-first-step">
        <div className="start-level__head">
          <h3 id="start-first-step" className="start-level__label">
            Primul pas
          </h3>
          <p className="start-level__hint">Poți începe acum.</p>
        </div>
        <ul className="start-level__rows">
          <li className="start-entry">
            <div className="start-entry__object">
              <p className="start-entry__identity">
                <span className="start-entry__reference">Cereri</span>
              </p>
              <p className="start-entry__title">Adaugă prima cerere</p>
              <p className="start-entry__detail">
                Clientul, ce își dorește și, dacă știi deja, produsul. Poți alege și „Momentan indecis”.
              </p>
            </div>
            <div className="start-entry__action">
              <a className="start-btn start-btn--primary" href={newRequestHref()}>
                Cerere nouă
              </a>
              <p className="start-entry__note">Cereri</p>
            </div>
          </li>
        </ul>
      </section>,
    );
  }
  if (needsProduct) {
    rows.push(
      <section key="setup" className="start-level start-level--attention start-level--setup" aria-labelledby="start-setup-step">
        <div className="start-level__head">
          <h3 id="start-setup-step" className="start-level__label">
            Configurare necesară
          </h3>
          <p className="start-level__hint">Pentru un pas ulterior, nu pentru primul.</p>
        </div>
        <ul className="start-level__rows">
          <li className="start-entry">
            <div className="start-entry__object">
              <p className="start-entry__identity">
                <span className="start-entry__reference">Produse oferite</span>
                <span className="start-badge">Niciun produs activ</span>
              </p>
              <p className="start-entry__title">Activează cel puțin un produs oferit</p>
              <p className="start-entry__detail">
                Fără un produs activ, o cerere nu poate primi produs și ofertă. Cererile pot fi primite și înainte.
              </p>
            </div>
            <div className="start-entry__action">
              {setup.canManage ? (
                <a className="start-btn start-btn--outline" href={PRODUCT_ENABLEMENT_HREF}>
                  Deschide produsele oferite
                </a>
              ) : null}
              <p className="start-entry__note">{setup.canManage ? "Administrare" : "Se activează de Proprietar"}</p>
            </div>
          </li>
        </ul>
      </section>,
    );
  }
  const optional = setup?.optionalNotes ?? [];
  if (rows.length === 0 && optional.length === 0) {
    return null;
  }
  return (
    <section className="start-panel start-attention" aria-labelledby="start-first-use-title">
      <h2 id="start-first-use-title" className="start-visually-hidden">
        Primii pași
      </h2>
      {rows}
      {setup ? (
        <div className="start-attention__foot start-attention__foot--split">
          <p>
            {optional.length > 0
              ? `Opțional, nu împiedică lucrul: ${optional.join(" · ")}.`
              : "Setările opționale nu împiedică lucrul."}
          </p>
          <a className="start-link" href={ORGANIZATION_SETTINGS_HREF}>
            Setările organizației
            <ArrowIcon />
          </a>
        </div>
      ) : null}
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg className="start-icon start-icon--arrow" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="start-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M10 3.5 17.5 16h-15L10 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ObjectIcon({ kind }: { kind: StartAttentionEntryTransport["objectKind"] }) {
  const common = {
    className: "start-icon",
    viewBox: "0 0 20 20",
    width: 20,
    height: 20,
    "aria-hidden": true,
    focusable: false,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  switch (kind) {
    case "PRICE_APPROVAL":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.5" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      );
    case "QUOTE":
      return (
        <svg {...common}>
          <rect x="3.5" y="6" width="13" height="10" />
          <path d="M3.5 9.5h13M7.5 6V4h5v2" />
        </svg>
      );
    case "JOB":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="10" height="13" />
          <path d="M8 4V3h4v1M7.5 8.5h5M7.5 11.5h5" />
        </svg>
      );
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
