import { JOB_SHEET_SECTIONS, jobHref, type JobSheetSection } from "../../routing/appRoute";

function sectionLabel(section: JobSheetSection): string {
  switch (section) {
    case "situatie":
      return "Situație";
    case "operatii":
      return "Operații";
    case "fisiere":
      return "Fișiere";
    case "oameni":
      return "Oameni";
    case "istoric":
      return "Istoric";
    case "date":
      return "Date lucrare";
    default: {
      const neverSection: never = section;
      return neverSection;
    }
  }
}

export function JobSheetNav({ jobId, taskId, active }: { jobId: string; taskId?: string | null; active: JobSheetSection }) {
  return (
    <nav className="job-sheet__tabs" aria-label="Secțiunile lucrării">
      {JOB_SHEET_SECTIONS.map((section) => (
        <a key={section} href={jobHref(jobId, { taskId, section })} aria-current={section === active ? "page" : undefined}>
          {sectionLabel(section)}
        </a>
      ))}
    </nav>
  );
}
