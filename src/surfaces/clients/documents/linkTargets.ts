import type { CustomerDossierModel } from "../../../adapters/customerDossierAdapter";

export type LinkKind = "SITE" | "REQUEST" | "JOB" | "HISTORICAL_WORK";

/** One object a document can be attached to: the server's target with a line that identifies it. */
export type LinkTarget = { kind: LinkKind; subjectId: string; label: string; kindWord: string; detail: string | null };

const KIND_WORD: Record<LinkKind, string> = { SITE: "Sediu", REQUEST: "Cerere", JOB: "Lucrare", HISTORICAL_WORK: "Lucrare istorică" };

export function sameLink(left: { kind: string; subjectId: string }, right: { kind: string; subjectId: string }): boolean {
  return left.kind === right.kind && left.subjectId === right.subjectId;
}

/**
 * Every object of the client a document can be attached to (`linkTargets` of the dossier), each with
 * a second line from the dossier itself so two similar titles stay apart: the address of a site, the
 * site of a request or job, the reference · year · site of a historical work. Nothing is invented:
 * a value the dossier does not have is left out.
 */
export function linkTargetsOf(dossier: Pick<CustomerDossierModel, "linkTargets" | "sites" | "siteAssignments" | "historicalWorks">): LinkTarget[] {
  const siteName = new Map(dossier.sites.map((site) => [site.siteId, site.name]));
  const assigned = (kind: "REQUEST" | "JOB", subjectId: string) => {
    const assignment = dossier.siteAssignments.find((item) => item.subjectKind === kind && item.subjectId === subjectId);
    return assignment ? siteName.get(assignment.siteId) ?? null : null;
  };
  return [
    ...dossier.linkTargets.sites.map((target) => {
      const site = dossier.sites.find((item) => item.siteId === target.subjectId);
      return { kind: "SITE" as const, subjectId: target.subjectId, label: target.label, kindWord: KIND_WORD.SITE, detail: [site?.address, site?.city].filter(Boolean).join(", ") || null };
    }),
    ...dossier.linkTargets.requests.map((target) => ({ kind: "REQUEST" as const, subjectId: target.subjectId, label: target.label, kindWord: KIND_WORD.REQUEST, detail: assigned("REQUEST", target.subjectId) })),
    ...dossier.linkTargets.jobs.map((target) => ({ kind: "JOB" as const, subjectId: target.subjectId, label: target.label, kindWord: KIND_WORD.JOB, detail: assigned("JOB", target.subjectId) })),
    ...dossier.linkTargets.historicalWorks.map((target) => {
      const work = dossier.historicalWorks.find((item) => item.workId === target.subjectId);
      return {
        kind: "HISTORICAL_WORK" as const,
        subjectId: target.subjectId,
        label: target.label,
        kindWord: KIND_WORD.HISTORICAL_WORK,
        detail: work ? [work.reference, work.eventDate.slice(0, 4), work.siteId ? siteName.get(work.siteId) : null].filter(Boolean).join(" · ") || null : null,
      };
    }),
  ];
}
