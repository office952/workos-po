import { useEffect, useRef, useState, type RefObject } from "react";
import { JOB_SHEET_SECTIONS, jobHref, type JobSheetSection } from "../../routing/appRoute";
import { jobSheetSectionLabel as sectionLabel } from "../../presentation/jobSheetSections";

/**
 * N-018 · the sections stay reachable while the sheet scrolls: the bar sticks to the top of the
 * window (the application header is not fixed, so nothing is covered) and, once the full header
 * has scrolled away, it also shows the essential identity in one line. The section anchor sits
 * just before the bar, outside it, so a section change still starts at the section's top.
 */
export function JobSheetNav({
  jobId,
  taskId,
  active,
  identity,
  headerRef,
}: {
  jobId: string;
  taskId?: string | null;
  active: JobSheetSection;
  /** "Panou ACM + litere · În lucru · Operația 02": shown only while the header is out of view. */
  identity?: string | null;
  headerRef?: RefObject<HTMLElement | null>;
}) {
  const [stuck, setStuck] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef?.current;
    if (!header || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStuck(Boolean(entry && !entry.isIntersecting)));
    observer.observe(header);
    return () => observer.disconnect();
  }, [headerRef]);
  // On a phone the sections are one scrollable row: the current one is kept in view.
  useEffect(() => {
    const row = navRef.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current) return;
    const bounds = row.getBoundingClientRect();
    const rect = current.getBoundingClientRect();
    if (rect.left < bounds.left) row.scrollLeft -= bounds.left - rect.left;
    else if (rect.right > bounds.right) row.scrollLeft += rect.right - bounds.right;
  }, [active]);
  return (
    <>
      <div className="job-sheet__section-anchor" data-section-top aria-hidden="true" />
      <div className="job-sheet__sticky" data-stuck={stuck || undefined}>
        {identity ? <p className="job-sheet__sticky-identity" aria-hidden={!stuck}>{identity}</p> : null}
        <nav ref={navRef} className="job-sheet__tabs" aria-label="Secțiunile lucrării">
          {JOB_SHEET_SECTIONS.map((section) => (
            <a key={section} href={jobHref(jobId, { taskId, section })} aria-current={section === active ? "page" : undefined}>
              {sectionLabel(section)}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
