import type {
  StartAttentionEntryTransport,
  StartAttentionLevel,
  StartFlowStageTransport,
  StartFlowTone,
  StartOverviewTransport,
  StartTargetTransport,
} from "../adapters/startAdapter";
import { START_ATTENTION_LEVELS } from "../adapters/startAdapter";
import {
  assemblyHref,
  jobHref,
  jobsHref,
  quotesHref,
  registryQuoteHref,
  requestHref,
  requestProductHref,
  requestsHref,
} from "../routing/appRoute";

/**
 * Start · presentation model. Wording, grouping and the five-row budget live here; what an entry
 * is, which level it belongs to and every number come from the server projection untouched.
 */
export const START_VISIBLE_ENTRIES = 5;
export const START_CONTINUE_VISIBLE = 3;

export const PRICE_APPROVALS_HREF = "/admin/offering";
export const PRODUCT_ENABLEMENT_HREF = "/admin/products";
export const ORGANIZATION_SETTINGS_HREF = "/admin";

/** The server names the destination; this only translates it into this app's canonical routes. */
export function startTargetHref(target: StartTargetTransport): string {
  switch (target.kind) {
    case "PRICE_APPROVALS":
      return PRICE_APPROVALS_HREF;
    case "REQUEST":
      return requestHref(target.requestId);
    case "REQUEST_PRODUCT":
      return requestProductHref(target.requestId);
    case "ASSEMBLY":
      return assemblyHref(target.assemblyId);
    case "QUOTE":
      return registryQuoteHref({
        kind: target.quoteKind,
        productCode: target.productCode,
        quoteSnapshotId: target.quoteSnapshotId,
      });
    case "JOB":
      return jobHref(target.jobId, target.section === "OPERATIONS" ? { section: "operatii" } : {});
    case "REQUESTS_REGISTER":
      return requestsHref();
    case "QUOTES_REGISTER":
      return quotesHref();
    case "JOBS_REGISTER":
      return jobsHref();
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

export type StartAttentionGroup = {
  level: StartAttentionLevel;
  label: string;
  hint: string;
  count: number;
  visible: StartAttentionEntryTransport[];
  hidden: StartAttentionEntryTransport[];
};

function levelLabel(level: StartAttentionLevel): string {
  switch (level) {
    case "ACTION":
      return "Cer acțiunea ta";
    case "ATTENTION":
      return "Necesită atenție";
    case "WATCH":
      return "De urmărit";
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

function levelHint(level: StartAttentionLevel): string {
  switch (level) {
    case "ACTION":
      return "Doar rolul tău poate face pasul.";
    case "ATTENTION":
      return "De verificat și coordonat.";
    case "WATCH":
      return "Doar de urmărit.";
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

/**
 * At most five rows are open. Steps only the actor's role can take are never folded away; the
 * rest keep the server order and wait behind an explicit "show the others" control.
 */
export function presentAttentionGroups(
  entries: readonly StartAttentionEntryTransport[],
  expanded: boolean,
): StartAttentionGroup[] {
  const reserved = entries.filter((entry) => entry.level === "ACTION").length;
  let budget = Math.max(START_VISIBLE_ENTRIES - reserved, 0);
  return START_ATTENTION_LEVELS.flatMap((level) => {
    const rows = entries.filter((entry) => entry.level === level);
    if (rows.length === 0) {
      return [];
    }
    const open = expanded || level === "ACTION" ? rows.length : Math.min(rows.length, budget);
    if (level !== "ACTION") {
      budget -= open;
    }
    return [
      {
        level,
        label: levelLabel(level),
        hint: levelHint(level),
        count: rows.length,
        visible: rows.slice(0, open),
        hidden: rows.slice(open),
      },
    ];
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);
}

/** Romanian count phrase for feminine nouns: "o …", "două …", "5 …", "23 de …". */
function counted(count: number, one: string, many: string): string {
  if (count === 1) return `o ${one}`;
  if (count === 2) return `două ${many}`;
  const tail = count % 100;
  return `${count} ${tail === 0 || tail >= 20 ? "de " : ""}${many}`;
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  const lowered = labels.map((label, index) => (index === 0 ? label : label.toLocaleLowerCase("ro-RO")));
  return `${lowered.slice(0, -1).join(", ")} și ${lowered[lowered.length - 1]}`;
}

export type StartHeadline = { title: string; lead: string };

export function presentStartHeadline(start: StartOverviewTransport): StartHeadline {
  const { counts, entries } = start.attention;
  const failed = start.sources.filter((source) => source.status === "UNAVAILABLE");
  const failedLead =
    failed.length > 0
      ? `${joinLabels(failed.map((source) => source.label))} nu au putut fi citite. Acțiunile care depind de ele pot lipsi din listă.`
      : null;
  const watch =
    counts.WATCH > 0
      ? counts.WATCH === 1
        ? "O lucrare cu probleme raportate este de urmărit."
        : `${capitalize(counted(counts.WATCH, "lucrare", "lucrări"))} cu probleme raportate sunt de urmărit.`
      : null;

  if (counts.ACTION > 0) {
    const onlyApprovals = entries
      .filter((entry) => entry.level === "ACTION")
      .every((entry) => entry.objectKind === "PRICE_APPROVAL");
    const subject = onlyApprovals
      ? counted(counts.ACTION, "aprobare de preț", "aprobări de preț")
      : counted(counts.ACTION, "situație", "situații");
    const attention =
      counts.ATTENTION > 0
        ? `${capitalize(counted(counts.ATTENTION, "situație", "situații"))} necesită atenție.`
        : null;
    return {
      title: `${capitalize(subject)} ${counts.ACTION === 1 ? "cere" : "cer"} acțiunea ta`,
      lead: failedLead ?? [attention, watch].filter(Boolean).join(" "),
    };
  }
  if (counts.ATTENTION > 0) {
    const [only] = entries.filter((entry) => entry.level === "ATTENTION");
    const subject =
      counts.ATTENTION === 1 && only
        ? only.objectKind === "JOB"
          ? "o lucrare"
          : only.objectKind === "QUOTE"
            ? "o ofertă"
            : "o situație"
        : counted(counts.ATTENTION, "situație", "situații");
    return {
      title: `${capitalize(subject)} necesită atenție`,
      lead: failedLead ?? ["Nimic nu cere acțiunea ta.", watch].filter(Boolean).join(" "),
    };
  }
  if (start.activity === "NONE") {
    return start.canCreateRequest
      ? {
          title: "Începe cu prima cerere",
          lead: "Organizația nu are încă activitate. Totul pornește de la o cerere a unui client.",
        }
      : {
          title: "Organizația nu are încă activitate",
          lead: "Cererile, ofertele și lucrările apar aici după ce sunt înregistrate.",
        };
  }
  if (failed.length > 0) {
    // With a source missing, the page cannot say that nothing is waiting.
    return { title: "Datele sunt citite parțial", lead: failedLead ?? "" };
  }
  return {
    title: "Nu ai intervenții în așteptare",
    lead: ["Nimic nu cere acțiunea ta.", watch].filter(Boolean).join(" "),
  };
}

export function presentStartDateLine(readAt: string): string {
  const date = new Date(readAt);
  if (Number.isNaN(date.getTime())) {
    return "Start";
  }
  const day = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `Start · ${day}`;
}

function clock(readAt: string): string | null {
  const date = new Date(readAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export type StartFreshness = { label: string; state: "current" | "partial" | "stale" };

export function presentStartFreshness(
  start: StartOverviewTransport,
  refreshFailed: boolean,
): StartFreshness {
  const time = clock(start.readAt);
  const at = time ? ` la ${time}` : "";
  if (refreshFailed) {
    return { label: `Ultima citire${at}`, state: "stale" };
  }
  if (start.sources.some((source) => source.status === "UNAVAILABLE")) {
    return { label: `Citire parțială${at}`, state: "partial" };
  }
  return { label: `Date citite${at}`, state: "current" };
}

export type StartPartialNotice = { title: string; detail: string; retryLabel: string };

export function presentStartPartialNotice(start: StartOverviewTransport): StartPartialNotice | null {
  const failed = start.sources.filter((source) => source.status === "UNAVAILABLE");
  if (failed.length === 0) {
    return null;
  }
  const ready = start.sources.filter((source) => source.status === "READY");
  return {
    title: `${joinLabels(failed.map((source) => source.label))} nu au putut fi citite.`,
    detail:
      ready.length > 0
        ? `${joinLabels(ready.map((source) => source.label))} sunt la zi. Lipsa nu înseamnă că nu există nimic de făcut.`
        : "Lipsa nu înseamnă că nu există nimic de făcut.",
    retryLabel: "Reîncarcă",
  };
}

export function presentAttentionFootnote(
  start: StartOverviewTransport,
  groups: readonly StartAttentionGroup[],
): string {
  const total = start.attention.entries.length;
  const shown = groups.reduce((sum, group) => sum + group.visible.length, 0);
  const order = "Ordine: întâi ce poate face doar rolul tău, apoi cele mai vechi.";
  const incomplete = start.attention.incompleteLevels.map(levelLabel);
  const missing =
    incomplete.length > 0
      ? ` ${incomplete.map((label) => `„${label}”`).join(" și ")} ${incomplete.length === 1 ? "poate fi incomplet" : "pot fi incomplete"}: o sursă nu a putut fi citită.`
      : "";
  if (total === 0) {
    return `${order}${missing}`.trim();
  }
  const coverage =
    shown >= total
      ? total === 1
        ? "Este afișată singura situație."
        : `Sunt afișate toate cele ${total} situații.`
      : `Sunt afișate ${shown} din ${total} situații.`;
  return `${order} ${coverage}${missing}`;
}

export type StartFlowSegmentView = {
  id: string;
  label: string;
  count: number;
  tone: StartFlowTone;
  /** Share of the stage's own total, for the bar only. Stages are never compared. */
  share: number;
};

export type StartFlowStageView = Omit<StartFlowStageTransport, "segments" | "target"> & {
  href: string;
  segments: StartFlowSegmentView[];
  empty: boolean;
};

export function presentFlowStage(stage: StartFlowStageTransport): StartFlowStageView {
  const sum = stage.segments.reduce((total, segment) => total + segment.count, 0);
  return {
    ...stage,
    href: startTargetHref(stage.target),
    empty: stage.status === "READY" && (stage.total ?? 0) === 0,
    segments: stage.segments.map((segment) => ({
      ...segment,
      share: sum > 0 ? segment.count / sum : 0,
    })),
  };
}

export function presentHiddenLabel(group: StartAttentionGroup): string {
  const count = group.hidden.length;
  return count === 1 ? "Arată și cealaltă situație" : `Arată și celelalte ${count}`;
}
