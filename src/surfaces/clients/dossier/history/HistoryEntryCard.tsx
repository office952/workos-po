import { useEffect, useId, useRef, useState } from "react";
import type { CustomerDossierModel, DossierDocument, HistoryEntry } from "../../../../adapters/customerDossierAdapter";
import type { QuoteListItemTransport, RequestListItemTransport } from "../../../../api/types";
import type { BandMode } from "../bandModel";
import { DossierIcon } from "../dossierIcons";
import { attachedFiles, countLabel, entryPhoto, offerCount } from "../historyModel";
import { openDocument, type Opened } from "./opened";
import { NoPhoto, PhotoFrame, StateTag } from "../historyParts";
import { clientListHref, EMPTY_LIST_CONTEXT } from "../listContext";
import { projectChain, projectNeedsAttention, type ChainStep } from "./branchChain";
import { DocTile, Files, Photos } from "./cardParts";
import { follow } from "./follow";
import { summarizeMatch } from "./matchSummary";
import { ProjectTree } from "./ProjectTree";

/**
 * Why a card matched the search: one short line grouped from the server's `matchedOn` ("Potrivire:
 * sediu · anul 2021 · documente (2)"), and the full list in place behind "Detalii potrivire". Opening
 * the details changes nothing else: not the address, the search, the filters or the focus order.
 */
function MatchSummary({ matchedOn }: { matchedOn: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!matchedOn.length) return null;
  const groups = summarizeMatch(matchedOn);
  return (
    <div className="hmatch" data-open={open || undefined}>
      <p className="hmatch__line">
        <span className="hmatch__lead">Potrivire:</span> {groups.map((group) => group.label).join(" · ")}
      </p>
      <button type="button" className="hmatch__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        {open ? "Ascunde detaliile" : "Detalii potrivire"}
        <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={11} />
      </button>
      {open ? (
        <ul id={listId} className="hmatch__list" aria-label="Unde s-a găsit textul">
          {[...new Set(matchedOn)].map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The server names each provenance twice: in full on the entry and short in the filter facet. The eyebrow uses the short one (604:8170 „În WorkOS”). */
export type ProvenanceLabels = Readonly<Record<string, string>>;

function eyebrow(entry: HistoryEntry, mode: BandMode, labels: ProvenanceLabels): string {
  const origin = labels[entry.provenance] ?? entry.provenanceLabel;
  if (mode !== "desktop") return origin;
  if (entry.kind === "PROJECT") return [origin, entry.request ? `Cerere ${entry.request.reference}` : null].filter(Boolean).join(" · ");
  if (entry.kind === "HISTORICAL_WORK") return [origin, entry.reference].filter(Boolean).join(" · ");
  return [origin, entry.documents[0]?.kindLabel, entry.reference].filter(Boolean).join(" · ");
}

function countsLine(entry: HistoryEntry, short: boolean): string {
  const files = attachedFiles(entry.documents).length;
  const parts = [
    entry.kind === "PROJECT" ? countLabel(offerCount(entry), "ofertă", "oferte") : null,
    entry.kind === "DOCUMENT" ? null : short ? `${entry.photoCount} foto` : countLabel(entry.photoCount, "fotografie", "fotografii"),
    countLabel(files, "fișier", "fișiere"),
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The state of an entry: one tag, or each distinct branch state when the branches differ. */
function EntryState({ entry }: { entry: HistoryEntry }) {
  if (entry.kind === "DOCUMENT") {
    return (
      <span className="hnostate">Fără stare · fără cerere sau lucrare</span>
    );
  }
  const mixed = entry.state === null && entry.branches.length > 1;
  if (mixed) {
    return (
      <span className="hcard__states">
        <StateTag state={null} label={entry.stateLabel} />
        {[...new Map(entry.branches.map((branch) => [branch.state, branch])).values()].map((branch) => (
          <StateTag key={branch.state} state={branch.state} label={branch.stateLabel} />
        ))}
      </span>
    );
  }
  const progress = entry.branches.length === 1 ? entry.branches[0]?.job?.progressLabel?.split(" · ")[0] ?? null : null;
  return <StateTag state={entry.state ?? entry.states[0] ?? null} label={[entry.stateLabel, progress].filter(Boolean).join(" · ")} />;
}

function Chain({ steps }: { steps: ChainStep[] }) {
  return (
    <p className="hchain" aria-label={steps.map((step) => step.label).join(", apoi ")}>
      {steps.map((step, index) => (
        <span key={step.key} className="hchain__step" data-tone={step.tone} aria-hidden="true">
          {index > 0 ? <span className="hchain__arrow">→</span> : null}
          <span className="hchain__dot" />
          {step.label}
        </span>
      ))}
    </p>
  );
}

function SiteLine({ entry, full, withDate = true }: { entry: HistoryEntry; full: boolean; withDate?: boolean }) {
  const parts = [entry.site ? `${full ? entry.site.line : entry.site.name}${entry.site.active ? "" : " (inactiv)"}` : null, !withDate || (full && entry.kind !== "PROJECT") ? null : entry.eventDateLabel];
  if (!parts.some(Boolean)) return null;
  return (
    <p className="hcard__meta">
      {entry.site ? <DossierIcon name="site" size={13} /> : null}
      {parts.filter(Boolean).join(" · ")}
      {entry.siteAtTimeLabel ? <span className="hcard__then">{` · la data lucrării: ${entry.siteAtTimeLabel}`}</span> : null}
    </p>
  );
}

/**
 * A collapsed entry (Figma 604:8170 project, 604:8257 document, 604:8272 historical work): the
 * representative image (its stage written on it, so a simulation is never taken for the mounted
 * work), what and where, the state, the request → offers → works line and the counts. A project
 * the server marks for attention has a warm edge.
 */
export function CollapsedCard({
  entry,
  quotes,
  mode,
  onExpand,
  onOpen,
  focusOnMount,
  provenanceLabels,
}: {
  entry: HistoryEntry;
  quotes: readonly QuoteListItemTransport[];
  mode: BandMode;
  onExpand: () => void;
  onOpen: (opened: Opened) => void;
  focusOnMount: boolean;
  provenanceLabels: ProvenanceLabels;
}) {
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) expandRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  const photo = entryPhoto(entry);
  const uploaded = entry.kind === "DOCUMENT" ? entry.documents[0] ?? null : null;
  return (
    <article className="hcard" data-kind={entry.kind} data-attention={projectNeedsAttention(entry, quotes) || undefined} aria-label={entry.title}>
      <div className="hcard__media">
        {uploaded ? (
          <DocTile document={uploaded} large />
        ) : photo ? (
          <PhotoFrame document={photo} size="thumb" onOpen={() => openDocument(entry, photo, onOpen)} label={`Deschide fotografia ${photo.title}`} />
        ) : (
          <NoPhoto size="thumb" />
        )}
      </div>
      <div className="hcard__body">
        {/* Tablet and phone (588:7090): the date follows the provenance as written ("23 oct. 2026"). */}
        <p className="hcard__eyebrow">
          {eyebrow(entry, mode, provenanceLabels)}
          {mode === "desktop" ? null : <span className="hcard__eyebrow-date">{` · ${entry.eventDateLabel}`}</span>}
        </p>
        <h4 className="hcard__title">{entry.title}</h4>
        {/* Tablet and phone carry the date in the eyebrow (588:7090). */}
        <SiteLine entry={entry} full={false} withDate={mode === "desktop"} />
        <div className="hcard__status">
          <EntryState entry={entry} />
          {entry.kind === "PROJECT" ? <Chain steps={projectChain(entry, quotes)} /> : null}
        </div>
        <MatchSummary matchedOn={entry.matchedOn} />
      </div>
      <div className="hcard__side">
        <p className="hcard__counts">{countsLine(entry, mode !== "desktop")}</p>
        {uploaded ? (
          <button type="button" className="hcard__button" onClick={() => openDocument(entry, uploaded, onOpen)}>
            Previzualizează
          </button>
        ) : (
          <button ref={expandRef} type="button" className="hcard__button" aria-expanded={false} onClick={onExpand}>
            Extinde
            <DossierIcon name="chevronDown" size={11} />
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * An expanded entry. A project (813:31187 / 813:31490 / 813:31793 / 813:31918, ProjectTree): the
 * request once, each offer once with its work, the request's photos and documents apart from each
 * work's. A historical work (579:6351 / 588:8220): its photos in the order of the work, the files with
 * Previzualizează and Descarcă, the description, "Deschide fișa lucrării" and the site's history.
 */
export function ExpandedCard({
  customerId,
  entry,
  dossier,
  quotes,
  requests,
  mode,
  onCollapse,
  onOpen,
  onSite,
  onPreviewQuote,
  focusOnMount,
  provenanceLabels,
}: {
  customerId: string;
  entry: HistoryEntry;
  dossier: CustomerDossierModel | null;
  quotes: readonly QuoteListItemTransport[];
  requests: readonly RequestListItemTransport[];
  mode: BandMode;
  onCollapse: () => void;
  onOpen: (opened: Opened) => void;
  onSite: (siteId: string) => void;
  onPreviewQuote: (quoteSnapshotId: string) => void;
  /** Expanded by the reader: the focus goes to "Restrânge". Reopened by Back/Forward or a link, the
   * page keeps the focus it restores (the link that led away). */
  focusOnMount: boolean;
  provenanceLabels: ProvenanceLabels;
}) {
  const ref = useRef<HTMLElement>(null);
  // Read at mount only: a later change of the flag is not a new expansion.
  const expandedHere = useRef(focusOnMount);
  // A direct link or a refresh opens the page at the top: bring the open entry into view. Back and
  // Forward restore their own position, which this leaves alone.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.scrollY === 0 && node.getBoundingClientRect().top > window.innerHeight * 0.6) node.scrollIntoView({ block: "start" });
    if (expandedHere.current) node.querySelector<HTMLButtonElement>(".hcard__collapse")?.focus({ preventScroll: true });
  }, []);
  const site = entry.site ? dossier?.sites.find((item) => item.siteId === entry.site?.siteId) ?? null : null;
  const openFile = (document: DossierDocument) => openDocument(entry, document, onOpen);
  const project = entry.kind === "PROJECT";
  const workHref = entry.historicalWorkId ? clientListHref(customerId, "lucrari", EMPTY_LIST_CONTEXT, { lucrare: entry.historicalWorkId }) : null;
  return (
    <article ref={ref} className="hcard" data-expanded data-kind={entry.kind} data-attention={projectNeedsAttention(entry, quotes) || undefined} aria-label={entry.title}>
      <div className="hcard__head">
        <div className="hcard__head-text">
          {/* A project (813:31793 / 813:31918): the date in the eyebrow from 768 up, next to the site on the phone. */}
          <p className="hcard__eyebrow">{[eyebrow(entry, "desktop", provenanceLabels), mode === "desktop" || (project && mode === "tablet") ? entry.eventDateLabel : null].filter(Boolean).join(" · ")}</p>
          <h4 className="hcard__title" data-level="expanded">{entry.title}</h4>
          <div className="hcard__status">
            <EntryState entry={entry} />
            {/* Phone (580:4114): the site by name with the period; wider screens give the address (579:6351). */}
            {mode === "phone" ? <SiteLine entry={entry} full={false} /> : <SiteLine entry={entry} full withDate={!project} />}
          </div>
          <MatchSummary matchedOn={entry.matchedOn} />
        </div>
        <button type="button" className="hcard__button hcard__collapse" aria-expanded onClick={onCollapse}>
          Restrânge
          <DossierIcon name="chevronUp" size={11} />
        </button>
      </div>

      {project ? (
        <>
          <ProjectTree entry={entry} quotes={quotes} requests={requests} mode={mode} onOpen={onOpen} onPreviewQuote={onPreviewQuote} />
        </>
      ) : (
        <div className="hcard__columns">
          <Photos entry={entry} mode={mode} onOpen={onOpen} />
          <div className="hcard__detail">
            <Files title="Fișiere atașate" documents={attachedFiles(entry.documents)} onOpen={openFile} />
            {entry.description ? <p className="hcard__description">{entry.description}</p> : null}
          </div>
        </div>
      )}
      {site?.accessNotes ? <p className="hcard__access">{`Acces sediu azi: ${site.accessNotes}`}</p> : null}
      {workHref || entry.site ? (
        <p className="hcard__actions">
          {workHref ? (
            <a className="hcard__button" href={workHref} onClick={(event) => follow(event, workHref)}>
              Deschide fișa lucrării
              <DossierIcon name="right" size={13} />
            </a>
          ) : null}
          {entry.site ? (
            <button type="button" className="hcard__link" onClick={() => onSite(entry.site!.siteId)}>
              {`Istoricul sediului ${entry.site.name}`}
            </button>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
